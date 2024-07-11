"use strict";

const { log } = require("dbc-node-logger");
const { v4: uuidv4 } = require("uuid");

const createRedis = require("./clients/redis");
const initSmaug = require("./clients/smaug");
const initProxy = require("./clients/proxy");
const initUserinfo = require("./clients/userinfo");
const initPreauthenticated = require("./clients/preauthenticated");
const initFbsLogin = require("./clients/fbslogin");
const initLogger = require("./logger");
const { ensureString } = require("./utils");

// JSON Schema for validating the request headers
const schema = {
  headers: {
    type: "object",
    properties: {
      Authorization: { type: "string" },
    },
    required: ["Authorization"],
  },
};

// whitelist request specifications
const whitelist = {
  // userinfo cpr request
  userinfo: [
    // /external/agencyid/patrons/v5 is deprecated, and will be removed from fbs-cms
    { method: "POST", url: "/external/agencyid/patrons/v5" },
    { method: "POST", url: "/external/agencyid/patrons/v9" },
    // /external/agencyid/patrons/withGuardian/v1 is deprecated, and will be removed from fbs-cms
    { method: "POST", url: "/external/agencyid/patrons/withGuardian/v1" },
    { method: "POST", url: "/external/agencyid/patrons/withGuardian/v3" },
    // /external/agencyid/patrons/patronid/v3 is deprecated, and will be removed from fbs-cms
    { method: "PUT", url: "/external/agencyid/patrons/patronid/v3" },
    { method: "PUT", url: "/external/agencyid/patrons/patronid/v8" },
  ],
};

const corsOptions = {
  origin: parsCorsOrigin(),
  methods: "GET,PUT,POST,DELETE,OPTIONS,HEAD",
};

function parsCorsOrigin() {
  const originValue = `${process.env.CORS_ORIGIN}`;
  if (originValue === "all") {
    return "*";
  } else {
    return originValue;
  }
}

/**
 * All requests to the adapter is handled in this route handler
 */
module.exports = async function (fastify, opts) {
  // Initialize and create global logger for app
  const appLogger = initLogger({ app: "fbs-cms-adapter" });
  appLogger.info("App started");

  // Prepare for 'decorateRequest' and 'timings' properties to be set on request object
  fastify.decorateRequest("requestLogger", null);
  fastify.decorateRequest("timings", null);

  // Establish connections to redis for namespaces
  const redisClientPatronId = createRedis({
    log: appLogger,
    namespace: "patronid",
  });
  const redisClientSessionKey = createRedis({
    log: appLogger,
    namespace: "sessionkey",
  });

  fastify.register(require("@fastify/cors"), corsOptions);

  fastify.addHook("onRequest", (request, reply, done) => {
    // Create request logger and generate uuid (reqId) to be attached
    // to every log line during this request
    request.requestLogger = appLogger.child({ reqId: uuidv4() });

    // summary
    request.requestLogger.summary = {
      datasources: {},
      total_ms: performance.now(),
    };

    request.requestLogger.info("onRequest", {
      requestObj: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        hostname: request.hostname,
        remoteAddress: request.ip,
        remotePort: request.connection.remotePort,
      },
    });

    request.timings = { start: process.hrtime() };

    done();
  });

  fastify.addHook("onSend", function (_request, reply, payload, next) {
    // save response body for logging in "onResponse"
    reply.raw.payload = payload;
    next();
  });

  fastify.addHook("onResponse", (request, reply, done) => {
    request.requestLogger.debug("DEBUG", {
      requestObj: {
        method: request.method,
        url: request.url,
        body: ensureString(request.body),
        headers: request.headers,
        hostname: request.hostname,
      },
      response: {
        status: reply.statusCode,
        body: ensureString(reply.raw?.payload),
      },
    });

    const summary = request.requestLogger.summary;

    request.requestLogger.info("onResponse", {
      status: reply.statusCode,
      method: request.method,
      url: request.url,
      ...summary,
      total_ms: performance.now() - summary.total_ms,
    });

    done();
  });

  // route to check if server is running
  fastify.get("/", { logLevel: "silent" }, async (request) => {
    return "ok";
  });

  fastify.route({
    method: ["GET", "POST", "PUT", "DELETE"],
    url: "*",
    schema,
    logLevel: "silent",
    handler: async (request, reply) => {
      try {
        const requestLogger = request.requestLogger;

        // Initialize clients with logger for this request
        const redisPatronId = redisClientPatronId.init({
          log: requestLogger,
        });
        const redisSessionKey = redisClientSessionKey.init({
          log: requestLogger,
        });

        const smaug = initSmaug({ log: requestLogger });

        const userinfo = initUserinfo({ log: requestLogger });

        const proxy = initProxy({
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body,
          log: requestLogger,
        });
        const preauthenticated = initPreauthenticated({
          log: requestLogger,
          redis: redisPatronId,
        });
        const fbsLogin = initFbsLogin({
          log: requestLogger,
          redis: redisSessionKey,
        });

        // url contains a /authenticate or /preauthenticated path (which should be hidden)
        const includesAuthenticate = !!request.url.includes("authenticate");

        // add to summary log
        requestLogger.summary.includesAuthenticatedPath = includesAuthenticate;

        // throw a 404 (not found) if path includes authenticate
        if (includesAuthenticate) {
          return reply.code(404).send({ message: "not found" });
        }

        // The smaug token extracted from authorization header
        const token = request.headers.authorization.replace(/bearer /i, "");

        // check method and url matches whitelist item -> this will allow userinfo to be called to get cpr
        const cprRequired = !!whitelist.userinfo.find(
          (obj) => obj.method === request.method && obj.url === request.url
        );

        // add to summary log
        requestLogger.summary.cprRequired = cprRequired;

        // if allowed, retrieve cpr from token
        let cpr = null;
        if (cprRequired) {
          cpr = await userinfo.fetch({ token });
        }

        // Check if we need to fetch patronId
        const patronIdRequired = request.url.includes("/patronid/");

        // add to summary log
        requestLogger.summary.patronIdRequired = patronIdRequired;

        // The smaug configuration, fetched and validated
        const configuration = await smaug.fetch({
          token,
          patronIdRequired,
        });

        // add to summary log
        requestLogger.summary.isAuthenticatedToken = !!configuration?.user?.id;

        // add to summary log
        requestLogger.summary.agencyId = configuration?.agencyId;
        requestLogger.summary.clientId = configuration?.app?.clientId;

        // We need to login and get a sessionKey in order to call the FBS API
        let sessionKey = await fbsLogin.fetch({
          token,
          configuration,
        });

        // add to summary log
        requestLogger.summary.hasSessionKey = !!sessionKey;

        // Holds the patronId
        let patronId;

        // Holds the proxy response
        let proxyResponse;

        try {
          if (patronIdRequired) {
            patronId = await preauthenticated.fetch({
              token,
              sessionKey,
              configuration,
            });
          }

          // add to summary log
          requestLogger.summary.hasPatronId = !!patronId;

          proxyResponse = await proxy.fetch({
            sessionKey,
            patronId,
            configuration,
            cpr,
          });
        } catch (e) {
          if (e.code === 401) {
            // Calls to the FBS API may fail with 401
            // This means sessionKey is expired and we have to login again
            sessionKey = await fbsLogin.fetch({
              token,
              configuration,
              skipCache: true,
            });

            // add to summary log
            requestLogger.summary.sessionKeyRefetch = true;

            if (patronIdRequired) {
              patronId = await preauthenticated.fetch({
                token,
                sessionKey,
                configuration,
                skipCache: true,
              });
            }
            proxyResponse = await proxy.fetch({
              sessionKey,
              patronId,
              configuration,
              cpr,
            });
          } else {
            // Give up, and pass the error to the caller
            throw e;
          }
        }

        // Finally send the proxied response to the caller
        reply.code(proxyResponse.code).send(await proxyResponse.body);
      } catch (error) {
        if (!error.code) {
          // This is an unexpected error, could be a bug
          // request.log.error(error);
          log.error(String(error), {
            error: String(error),
            stacktrace: error.stack,
          });
        }

        reply
          .code(error.code || 500)
          .send(
            typeof error.body === "undefined"
              ? "internal server error"
              : error.body
          );
      }
    },
  });
};
