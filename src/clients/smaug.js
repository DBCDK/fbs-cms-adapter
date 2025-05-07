const { fetcher } = require("../utils");

/**
 * Checks that configuration contains a valid user
 */
function validateSmaugUser({ configuration, log }) {
  // token must be user authenticated
  if (!configuration || !configuration.user || !configuration.user.id) {
    log.info("Smaug configuration has invalid user");
    throw {
      code: 403,
      body: { message: "user authenticated token is required" },
    };
  }
}

/**
 * Initializes the smaug fetcher
 */
function init({ log }) {
  /**
   * The actual fetch function
   */
  async function fetch({ token, patronIdRequired }) {
    const time = performance.now();

    const res = await fetcher(
      `${process.env.SMAUG_URL}?token=${token}`,
      {},
      log
    );

    // log response to summary
    log.summary.datasources.smaug = {
      code: res.code,
      time: performance.now() - time,
    };

    switch (res.code) {
      case 200:
        const configuration = res.body;

        if (patronIdRequired) {
          validateSmaugUser({ configuration, log });
        }
        return configuration;
      case 404:
        throw {
          code: 403,
          body: { message: "invalid token" },
        };
      default:
        log.error(
          `Smaug request failed for token=${token}. This is unexpected.`
        );
        throw {
          code: 500,
          body: { message: "internal server error" },
        };
    }
  }

  return { fetch };
}

module.exports = init;
