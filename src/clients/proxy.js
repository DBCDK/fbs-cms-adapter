const HttpsProxyAgent = require("https-proxy-agent");
const merge = require("lodash/merge");

const { fetcher } = require("../utils");

/**
 * CPR attachment rules used to determine how a CPR number should be included
 * in the request body based on HTTP method and URL prefix.
 */
const cprAttachmentRules = [
  {
    method: "POST",
    urlPrefix: "/external/agencyid/patrons/withGuardian/",
    buildBody: (cpr) => ({ guardian: { personIdentifier: cpr } }),
  },
  {
    method: "PUT",
    urlPrefix: "/external/agencyid/patrons/patronid/",
    buildBody: (cpr) => ({ pincodeChange: { libraryCardNumber: cpr } }),
  },
];

/**
 * Builds the appropriate request body with CPR data based on HTTP method and URL.
 */
function attachCpr({ method, url, cpr }) {
  const rule = cprAttachmentRules.find(
    (r) => r.method === method && url.startsWith(r.urlPrefix)
  );

  return rule ? rule.buildBody(cpr) : { personIdentifier: cpr };
}

function replacePath({ url, agencyId, isil, patronId }) {
  // Replaces url path params
  return (
    url
      // replace real alternative agencyId with isil (DK-xxxxxx)
      .replace(`/${agencyId}/`, `/${isil}/`)
      // replace agencyId placeholder with isil (DK-xxxxxx)
      .replace("/agencyid/", `/${isil}/`)
      // replace patronid placeholder with real patronId
      .replace("/patronid/", `/${patronId}/`)
  );
}

/**
 * Initializes the proxy
 */
function init({ url, method, headers, body, log }) {
  /**
   * The actual fetch function
   */
  async function fetch({ sessionKey, credentials, patronId, cpr }) {
    const time = performance.now();

    const { isil, agencyId, fbsUrl } = credentials;

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
      fbsUrl + replacePath({ url, agencyId, isil, patronId }),
      options,
      log
    );

    // log response to summary
    log.summary.datasources.fbs = {
      code: res.code,
      time: performance.now() - time,
    };

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
