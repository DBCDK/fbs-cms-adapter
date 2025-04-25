const HttpsProxyAgent = require("https-proxy-agent");

const { fetcher } = require("../utils");

/**
 * Initializes the fbslogin fetcher
 */
function init({ redis, log }) {
  /**
   * The actual fetch function
   */
  async function fetch({ token, credentials, skipCache = false }) {
    const time = performance.now();

    const { isil, agencyId, fbsUrl, username, password } = credentials;

    // Redis key according to agencyId
    const redisKey = agencyId + "-" + token;
    const cachedVal = !skipCache && (await redis.get(redisKey));

    if (cachedVal) {
      return cachedVal;
    }

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    };

    if (process.env.HTTPS_PROXY) {
      options.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }

    const res = await fetcher(
      `${fbsUrl}/external/v1/${isil}/authentication/login`,
      options,
      log
    );

    // log response to summary
    log.summary.datasources.fbslogin = {
      code: res.code,
      time: performance.now() - time,
    };

    const sessionKey = res.body.sessionKey;

    if (res.code === 200 && sessionKey) {
      await redis.set(redisKey, sessionKey);
      return sessionKey;
    }

    log.error("Failed to fetch session key. This is unexpected", {
      response: { status: res.code, body: res.body },
    });

    // Pass error on to the caller
    throw res;
  }

  return { fetch };
}

module.exports = init;
