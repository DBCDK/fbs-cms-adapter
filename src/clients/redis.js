const Redis = require("ioredis");
const { nanoToMs } = require("../utils");

const options = {
  host: process.env.REDIS_CLUSTER_HOST || process.env.REDIS_HOST,
  maxRetriesPerRequest: 5,
};

/**
 * Creates a Redis connection pool
 */
function createRedis({ log: appLogger, namespace }) {
  const redis = process.env.REDIS_CLUSTER_HOST
    ? new Redis.Cluster([options], { ...options, keyPrefix: namespace })
    : new Redis({ ...options, keyPrefix: namespace });

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
      const start = process.hrtime();
      try {
        const res = await redis.get(key);
        log.info(`Redis: GET ${namespace}:${key}->${res}`, {
          timings: { ms: nanoToMs(process.hrtime(start)[1]) },
        });
        return res;
      } catch (error) {
        log.error(
          `Redis: GET ${namespace}:${key} FAILED ${process.env.REDIS_HOST}`,
          {
            error: String(e),
            stacktrace: e.stack,
            namespace,
            timings: { ms: nanoToMs(process.hrtime(start)[1]) },
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
      const start = process.hrtime();
      try {
        await redis.set(key, value);
        log.info(`Redis: SET ${namespace}:${key}->${value}`, {
          timings: { ms: nanoToMs(process.hrtime(start)[1]) },
        });
      } catch (error) {
        log.error(
          `Redis: SET ${namespace}:${key} FAILED ${process.env.REDIS_HOST}`,
          {
            error: String(e),
            stacktrace: e.stack,
            namespace,
            timings: { ms: nanoToMs(process.hrtime(start)[1]) },
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
