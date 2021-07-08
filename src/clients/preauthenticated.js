const { fetcher } = require("../utils");

// Redis namespace
const namespace = "patronid";

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

    const redisVal = !skipCache && (await redis.get(token, { namespace }));

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

    let res = await fetcher(path, options, log);
    switch (res.code) {
      case 200:
        const patronId = res.body.patron.patronId + "";
        await redis.set(token, patronId, {
          namespace,
        });
        return patronId;
      case 401:
        // session key expired
        throw res;
      default:
        log.error(
          { response: res },
          `Failed to fetch patronId. This is unexpected`
        );

        // Pass error on to the caller
        throw res;
    }
  }
  return { fetch };
}

module.exports = init;
