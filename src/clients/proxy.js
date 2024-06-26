const HttpsProxyAgent = require("https-proxy-agent");
const merge = require("lodash/merge");

const { fetcher } = require("../utils");

function attachCpr({ method, url, cpr }) {
  // on POST to withGuardian url, cpr is attached to a deeper level body.guardian
  const isGuardian =
    method === "POST" &&
    (url === "/external/agencyid/patrons/withGuardian/v1" ||
      url === "/external/agencyid/patrons/withGuardian/v3");

  if (isGuardian) {
    // v1 is deprecated - this check can be removed when legacy version is no longer supported in fbs api
    if (url === "/external/agencyid/patrons/withGuardian/v1") {
      return { guardian: { cprNumber: cpr } };
    }

    return { guardian: { personIdentifier: cpr } };
  }

  // on PUT (pincodeChange) to /patrons/patronid url, cpr is attached to a deeper level body.pincodeChange as libraryCardNumber
  const isPincodeChange =
    method === "PUT" &&
    (url === "/external/agencyid/patrons/patronid/v3" ||
      url === "/external/agencyid/patrons/patronid/v8");

  if (isPincodeChange) {
    return { pincodeChange: { libraryCardNumber: cpr } };
  }

  // v5 is deprecated - this check can be removed when legacy version is no longer supported in fbs api
  if (url === "/external/agencyid/patrons/v5") {
    return { cprNumber: cpr };
  }

  // else return default at base level
  return { personIdentifier: cpr };
}

function replacePath({ url, agencyid, patronId }) {
  return url
    .replace("/agencyid/", `/${agencyid}/`)
    .replace("/patronid/", `/${patronId}/`);
}

/**
 * Initializes the proxy
 */
function init({ url, method, headers, body, log }) {
  /**
   * The actual fetch function
   */
  async function fetch({ sessionKey, configuration, patronId, cpr }) {
    const agencyid = configuration.fbs.agencyid;
    const fbsCmsUrl = configuration.fbs.url || process.env.FBS_CMS_API_URL;

    const options = {
      method: method,
      headers: {
        ...headers,
        "X-Session": sessionKey,
      },
    };

    if (process.env.HTTPS_PROXY) {
      options.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }

    delete options.headers.host;
    delete options.headers.authorization;

    if (cpr) {
      const copy = typeof body === "object" ? body : JSON.parse(body || {});
      // attatch cprNumber to body according to url and method
      const attachedCpr = attachCpr({ url, method, cpr });
      // attach cpr to body
      body = merge({}, copy, attachedCpr);
    }

    if (body) {
      options.body = typeof body === "object" ? JSON.stringify(body) : body;
    }

    let res = await fetcher(
      fbsCmsUrl + replacePath({ url, agencyid, patronId }),
      options,
      log
    );

    switch (res.code) {
      case 401:
        // sessionKey expired
        throw res;
      default:
        // All other responses we pass through to the client
        return res;
    }
  }
  return { fetch };
}

module.exports = init;
