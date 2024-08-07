const { fetcher } = require("../utils");

/**
 * Checks that attributes contains a cpr
 */
function validateUserinfoCPR({ attributes, log, token }) {
  // token must be nem-id authenticated (contains a cpr number)
  if (!(attributes && attributes.cpr)) {
    log.info(
      `CPR request to userinfo failed for token=${token}. Token does not include a cpr`
    );
    throw {
      code: 403,
      body: { message: "token does not include a cpr" },
    };
  }
}

/**
 * Initializes the userinfo fetcher
 */
function init({ log }) {
  /**
   * The actual fetch function
   */
  async function fetch({ token }) {
    const time = performance.now();

    const res = await fetcher(
      `${process.env.USERINFO_URL}`,
      { headers: { authorization: `Bearer ${token}` } },
      log
    );

    // log response to summary
    log.summary.datasources.userinfo = {
      code: res.code,
      time: performance.now() - time,
    };

    switch (res.code) {
      case 200:
        return res.body && res.body.attributes;
      case 401:
        validateUserinfoCPR({ log }); // fails
      default:
        log.error(
          `Userinfo request failed for token=${token}. This is unexpected.`
        );
        throw {
          code: 500,
          body: { message: "internal server error" },
        };
    }
  }

  return { fetch };
}

module.exports = { init, validateUserinfoCPR };
