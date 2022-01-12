/**
 * @file This is a HTTP mock service, useful for writing cypress tests
 *
 * - Perform get/set operations to Redis
 * - Mock http requests
 */
"use strict";

const isMatch = require("lodash/isMatch");
const createRedis = require("./clients/redis");

let mocked = [];

module.exports = async function (fastify, opts) {
  // FBS API require to receive content type application/json
  // even though the body is a string.
  // We have to override the default fastify body parser
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (req, body, done) {
      try {
        var json = JSON.parse(body);
        done(null, json);
      } catch (err) {
        done(null, body);
      }
    }
  );

  // Redis get operation
  fastify.get("/redis", async (request) => {
    const { redis } = createRedis({
      log: fastify.log,
      namespace: request.query.namespace,
    });
    const val = await redis.get(request.query.key);
    await redis.disconnect();
    return val;
  });

  // Redis set operation
  fastify.post("/redis", async (request) => {
    const { redis } = createRedis({
      log: fastify.log,
      namespace: request.body.namespace,
    });
    await redis.set(request.body.key, request.body.value);
    await redis.disconnect();
    return "OK";
  });

  // Mock HTTP request
  fastify.post("/", async (request) => {
    const { body } = request;
    mocked.push(body);
    return { status: "ok" };
  });

  // Reset Redis and Mocked requests
  fastify.post("/reset", async (request) => {
    mocked = [];
    // redis namespaces to wipe
    const namespaces = request.body.namespaces;
    await Promise.all(
      namespaces.map(async (namespace) => {
        const { redis } = createRedis({
          log: fastify.log,
          namespace,
        });
        await redis.flushall();
      })
    );
    return "ok";
  });

  // Returns a mocked if it matches any
  fastify.route({
    method: ["GET", "POST"],
    url: "*",
    handler: async (request, reply) => {
      const { body, headers, method, query } = request;
      const path = request.params["*"];

      // Look for any mocked requests that matches current request
      // method, path, headers, body, query should match
      const match = mocked.find((mock) => {
        return isMatch({ method, path, headers, body, query }, mock.request);
      });

      if (match) {
        return reply.code(match.response.status).send(match.response.body);
      }

      request.log.error({
        msg: "no mock matching request",
        request: { body, headers, method, query, path },
      });

      reply.code(500).send({ message: "no mock matching request" });
    },
  });
};
