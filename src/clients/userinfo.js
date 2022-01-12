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
 * Checks that configuration contains FBS credentials
 */
function validateSmaugFBSCredentials({ configuration, log }) {
  const isValid =
    configuration &&
    configuration.fbs &&
    configuration.fbs.agencyid &&
    configuration.fbs.username &&
    configuration.fbs.password;

  if (!isValid) {
    log.info("Smaug configuration has invalid fbs credentials");
    throw {
      code: 403,
      body: {
        message:
          "token must have FBS credentials with 'agencyid', 'username' and 'password'",
      },
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
    const res = await fetcher(
      `${process.env.USERINFO_URL}`,
      { headers: { authorization: `Bearer ${token}` } },
      log
    );

    console.log("############## res", res);

    switch (res.code) {
      case 200:
        const attributes = res.body && res.body.attributes;
        // ensure user has loggedIn by using nem-id, else throw error
        if (!(attributes && attributes.cpr)) {
          log.error(
            `/userinfo request failed for token=${token}. Token does not include a cpr`
          );
          throw {
            code: 401,
            body: { message: "invalid token" },
          };
        }
        return attributes.cpr;
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
