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
    credentials,
    attributes,
    skipCache = false,
  }) {
    const { isil, agencyId, fbsUrl } = credentials;

    const userId = attributes.userId;
    const userPin = attributes.pincode;

    // Redis key according to agencyId
    const redisKey = agencyId + "-" + token;
    const redisVal = !skipCache && (await redis.get(redisKey));

    if (redisVal) {
      return redisVal;
    }

    const path = `${fbsUrl}/external/${isil}/patrons/authenticate/v9`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session": sessionKey,
      },
      body: JSON.stringify({ libraryCardNumber: userId, pincode: userPin }),
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
        await redis.set(redisKey, patronId);
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
