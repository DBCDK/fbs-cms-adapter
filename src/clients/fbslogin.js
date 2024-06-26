const HttpsProxyAgent = require("https-proxy-agent");

const { fetcher } = require("../utils");

/**
 * Initializes the fbslogin fetcher
 */
function init({ redis, log }) {
  /**
   * The actual fetch function
   */
  async function fetch({ token, configuration, skipCache = false }) {
    const { agencyid, username, password, url } = configuration.fbs;

    const fbsCmsUrl = url || process.env.FBS_CMS_API_URL;

    const cachedVal = !skipCache && (await redis.get(token));

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
      `${fbsCmsUrl}/external/v1/${agencyid}/authentication/login`,
      options,
      log
    );

    const sessionKey = res.body.sessionKey;

    if (res.code === 200 && sessionKey) {
      await redis.set(token, sessionKey);
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
