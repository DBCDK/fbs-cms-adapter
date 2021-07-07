"use strict";

// JSON Schema for validating header
const schema = {
  headers: {
    type: "object",
    properties: {
      Authorization: { type: "string" },
    },
    required: ["Authorization"],
  },
};

const initSmaug = require("./clients/smaug");
const initProxy = require("./clients/proxy");
const initPreauthenticated = require("./clients/preauthenticated");
const initFbsLogin = require("./clients/fbslogin");

module.exports = async function (fastify, opts) {
  fastify.register(require("fastify-redis"), { url: process.env.REDIS_URL });

  fastify.route({
    method: ["GET", "POST", "PUT", "DELETE"],
    url: "*",
    schema,
    handler: async (request, reply) => {
      try {
        // Initialize clients
        const smaug = initSmaug(request);
        const proxy = initProxy(request);
        const preauthenticated = initPreauthenticated({
          log: request.log,
          redis: fastify.redis,
        });
        const fbsLogin = initFbsLogin({
          log: request.log,
          redis: fastify.redis,
        });

        // The smaug token extracted from authorization header
        const token = request.headers.authorization.replace(/bearer /i, "");

        // Check if we need to fetch patronId
        const patronIdRequired = request.url.includes("/patronid/");

        // The smaug configuration, fetched and validated
        const configuration = await smaug.fetch({
          token,
          patronIdRequired,
        });

        // We need to login and get a sessionKey in order to call the FBS API
        let sessionKey = await fbsLogin.fetch({
          token,
          configuration,
        });

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

          proxyResponse = await proxy.fetch({
            sessionKey,
            patronId,
            agencyid: configuration.fbs.agencyid,
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
              agencyid: configuration.fbs.agencyid,
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
          request.log.error(error);
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
