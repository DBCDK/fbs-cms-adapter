const HttpsProxyAgent = require("https-proxy-agent");

const { fetcher } = require("../utils");

/**
 * Initializes the authenticate fetcher
 */
function init({ redis, log }) {
  /**
   * The actual fetch function
   */
  async function fetch({
    token,
    sessionKey,
    configuration,
    attributes,
    skipCache = false,
  }) {
    const agencyid = configuration.fbs.agencyid;
    const fbsCmsUrl = configuration.fbs.url || process.env.FBS_CMS_API_URL;
    const userId = attributes.userId;
    const userPin = attributes.pincode;

    const redisVal = !skipCache && (await redis.get(token));

    if (redisVal) {
      return redisVal;
    }

    const credentials = { libraryCardNumber: userId, pincode: userPin };

    const path = `${fbsCmsUrl}/external/${agencyid}/patrons/authenticate/v9`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session": sessionKey,
      },
      body: JSON.stringify(credentials),
    };

    if (process.env.HTTPS_PROXY) {
      options.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }

    let res = await fetcher(path, options, log);

    switch (res.code) {
      case 200:
        const patronId = res.body.patronId + "";
        if (!patronId) {
          log.error(
            `Failed to fetch patronId from /authenticate. User was not authenticated`
          );
          throw res;
        }
        await redis.set(token, patronId);
        return patronId;
      case 401:
        // session key expired
        throw res;
      default:
        log.error(
          `Failed to fetch patronId from /authenticate. This is unexpected`,
          {
            response: { status: res.code, body: res.body },
          }
        );

        // Pass error on to the caller
        throw res;
    }
  }
  return { fetch };
}

module.exports = init;
