const Redis = require("ioredis");

const truthy = new Set(["1", "true", "yes", "y", "on"]);
const falsy = new Set(["0", "false", "no", "n", "off"]);

function isRedisDisabled() {
  const enabled = String(process.env.REDIS_ENABLED || "").toLowerCase();
  if (enabled) {
    return falsy.has(enabled);
  }

  const disabled = String(process.env.REDIS_DISABLED || "").toLowerCase();
  if (disabled) {
    return truthy.has(disabled);
  }

  return false;
}

const options = {
  host: process.env.REDIS_CLUSTER_HOST || process.env.REDIS_HOST,
  maxRetriesPerRequest: 5,
};

function buildKeyPrefix(namespace) {
  const prefix = process.env.REDIS_PREFIX;
  return prefix ? `${prefix}:${namespace}` : namespace;
}

/**
 * Creates a Redis connection pool
 */
function createRedis({ log: appLogger, namespace }) {
  const disabled = isRedisDisabled();
  if (disabled) {
    appLogger.warn("Redis disabled by flag", { namespace });
    const noopRedis = {
      get: async () => null,
      set: async () => null,
      flushall: async () => null,
      disconnect: async () => null,
      on: () => {},
    };

    function init({ log }) {
      async function get(key) {
        log.summary.datasources.redis = {
          code: 204,
          time: 0,
          disabled: true,
        };
        log.info(`Redis disabled: GET ${namespace}:${key}`);
        return null;
      }

      async function set(key, value) {
        log.summary.datasources.redis = {
          code: 204,
          time: 0,
          disabled: true,
        };
        log.info(`Redis disabled: SET ${namespace}:${key}->${value}`);
      }

      return { get, set };
    }

    return { init, redis: noopRedis };
  }

  const keyPrefix = buildKeyPrefix(namespace);
  const redis = process.env.REDIS_CLUSTER_HOST
    ? new Redis.Cluster([options], { ...options, keyPrefix })
    : new Redis({ ...options, keyPrefix });

  redis.on("error", (e) => {
    appLogger.error("Redis error", {
      error: String(e),
      stacktrace: e.stack,
      namespace,
    });
  });

  /**
   * Initializes redis for a request
   * We need this in order to have request id logged automatically
   */
  function init({ log }) {
    /**
     * Wraps redis get
     * Adds some error handling as well as logging
     */
    async function get(key) {
      const time = performance.now();
      try {
        const res = await redis.get(key);

        // log response to summary
        log.summary.datasources.redis = {
          code: !!res ? 200 : 404,
          time: performance.now() - time,
        };

        log.info(`Redis: GET ${namespace}:${key}->${res}`, {
          timings: { ms: performance.now() - time },
        });
        return res;
      } catch (error) {
        log.error(
          `Redis: GET ${namespace}:${key} FAILED ${process.env.REDIS_HOST}`,
          {
            error: String(e),
            stacktrace: e.stack,
            namespace,
            timings: { ms: performance.now() - time },
          }
        );
        throw { code: 500, body: "internal server error" };
      }
    }

    /**
     * Wraps redis set
     * Adds some error handling as well as logging
     */
    async function set(key, value) {
      const time = performance.now();
      try {
        await redis.set(key, value);
        log.info(`Redis: SET ${namespace}:${key}->${value}`, {
          timings: { ms: performance.now() - time },
        });
      } catch (error) {
        log.error(
          `Redis: SET ${namespace}:${key} FAILED ${process.env.REDIS_HOST}`,
          {
            error: String(e),
            stacktrace: e.stack,
            namespace,
            timings: { ms: performance.now() - time },
          }
        );
        throw { code: 500, body: "internal server error" };
      }
    }

    return { get, set };
  }

  return { init, redis };
}

module.exports = createRedis;
