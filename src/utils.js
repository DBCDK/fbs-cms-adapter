const fetch = require("node-fetch");

/**
 * Wraps fetch API
 * Adds some error handling as well as logging
 */
async function fetcher(url, options, log) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    log.error(
      `Outgoing request: ${
        (options && options.method) || "GET"
      } ${url} FETCH ERROR`
    );

    throw {
      code: 500,
      body: "internal server error",
    };
  }
  const contentType = res.headers.get("content-Type");
  const body =
    contentType && contentType.includes("json")
      ? await res.json()
      : await res.text();

  log.info(
    `Outgoing request: ${(options && options.method) || "GET"} ${url} ${
      res.status
    }`
  );

  return {
    code: res.status,
    body,
  };
}

/**
 * Wraps redis get
 * Adds some error handling as well as logging
 */
async function redisGet(key, { namespace, redis, log }) {
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
async function redisSet(key, value, { namespace, redis, log }) {
  try {
    await redis.set(`${namespace}:${key}`, value);
    log.info(`Redis: SET ${namespace}:${key}->${value}`);
  } catch (error) {
    log.error(error);
    throw { code: 500, body: "internal server error" };
  }
}

module.exports = {
  fetcher,
  redisGet,
  redisSet,
};
