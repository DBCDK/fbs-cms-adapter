/**
 * @file This is a HTTP mock service, useful for writing cypress tests
 *
 * - Perform get/set operations to Redis
 * - Mock http requests
 */
"use strict";

const isMatch = require("lodash/isMatch");

let mocked = [];

module.exports = async function (fastify, opts) {
  fastify.register(require("fastify-redis"), { url: process.env.REDIS_URL });

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
    const { redis } = fastify;
    const val = await redis.get(request.query.key);
    return val;
  });

  // Redis set operation
  fastify.post("/redis", async (request) => {
    const { redis } = fastify;
    await redis.set(request.body.key, request.body.value);
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
    const { redis } = fastify;
    await redis.flushall();
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
      const match = mocked.find((mock) =>
        isMatch({ method, path, headers, body, query }, mock.request)
      );

      if (match) {
        return reply.code(match.response.status).send(match.response.body);
      }

      reply.code(500).send({ message: "no mock matching request" });
    },
  });
};
