const HttpsProxyAgent = require("https-proxy-agent");

const { fetcher } = require("../utils");

/**
 * Initializes the preauthenticated fetcher
 */
function init({ redis, log }) {
  /**
   * The actual fetch function
   */
  async function fetch({
    token,
    sessionKey,
    configuration,
    skipCache = false,
  }) {
    const agencyid = configuration.fbs.agencyid;
    const userId = configuration.user.id;

    const redisVal = !skipCache && (await redis.get(token));

    if (redisVal) {
      return redisVal;
    }

    const path = `${process.env.FBS_CMS_API_URL}/external/${agencyid}/patrons/preauthenticated/v7`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session": sessionKey,
      },
      body: userId,
    };

    if (process.env.HTTPS_PROXY) {
      options.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }

    let res = await fetcher(path, options, log);
    switch (res.code) {
      case 200:
        const patronId = res.body.patron && res.body.patron.patronId + "";
        if (!patronId) {
          log.error(`Failed to fetch patronId. User was not authenticated`);
          throw res;
        }
        await redis.set(token, patronId);
        return patronId;
      case 401:
        // session key expired
        throw res;
      default:
        log.error(`Failed to fetch patronId. This is unexpected`, {
          response: { status: res.code, body: res.body },
        });

        // Pass error on to the caller
        throw res;
    }
  }
  return { fetch };
}

module.exports = init;
