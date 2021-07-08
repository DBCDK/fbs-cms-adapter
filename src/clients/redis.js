const Redis = require("ioredis");

const redis = process.env.REDIS_CLUSTER_HOST
  ? new Redis.Cluster([{ host: process.env.REDIS_CLUSTER_HOST }])
  : new Redis({
      host: process.env.REDIS_HOST,
    });
let ready = false;
redis.on("ready", function () {
  ready = true;
});
redis.on("close", function () {
  ready = false;
});

/**
 * Initializes redis
 */
function init({ log }) {
  /**
   * Wraps redis get
   * Adds some error handling as well as logging
   */
  async function get(key, { namespace }) {
    if (!ready) {
      log.error(
        `Redis: GET ${namespace}:${key} NOT CONNECTED ${process.env.REDIS_HOST}`
      );
      throw { code: 500, body: "internal server error" };
    }
    try {
      const res = await redis.get(`${namespace}:${key}`);
      log.info(`Redis: GET ${namespace}:${key}->${res}`);
      return res;
    } catch (error) {
      log.error(error);
      throw { code: 500, body: "internal server error" };
    }
  }

  /**
   * Wraps redis set
   * Adds some error handling as well as logging
   */
  async function set(key, value, { namespace }) {
    if (!ready) {
      log.error(
        `Redis: SET ${namespace}:${key}->${value} NOT CONNECTED ${process.env.REDIS_HOST}`
      );
      throw { code: 500, body: "internal server error" };
    }
    try {
      await redis.set(`${namespace}:${key}`, value);
      log.info(`Redis: SET ${namespace}:${key}->${value}`);
    } catch (error) {
      log.error(error);
      throw { code: 500, body: "internal server error" };
    }
  }

  return { get, set, redis };
}
module.exports = init;
