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
    attributes,
    credentials,
    skipCache = false,
  }) {
    const time = performance.now();

    const { isil, agencyId, fbsUrl } = credentials;

    const userId = attributes.userId;

    // Redis key according to agencyId
    const redisKey = agencyId + "-" + token;
    const redisVal = !skipCache && (await redis.get(redisKey));

    if (redisVal) {
      return JSON.parse(redisVal);
    }

    const path = `${fbsUrl}/external/${isil}/patrons/preauthenticated/v10`;
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

    // log response to summary
    log.summary.datasources.preauthenticated = {
      code: res.code,
      time: performance.now() - time,
    };

    switch (res.code) {
      case 200:
        const patronId = res.body.patronId + "";
        if (!patronId) {
          log.error(
            `Failed to fetch patronId from /preauthenticated. User was not authenticated`
          );
          throw res;
        }

        const authResult = {
          patronId,
          authenticateStatus: res.body.authenticateStatus,
          patronType: res.body.patronType,
        };

        await redis.set(redisKey, JSON.stringify(authResult));

        return authResult;
      case 401:
        // session key expired
        throw res;
      default:
        log.error(
          `Failed to fetch patronId from /preauthenticated. This is unexpected`,
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
