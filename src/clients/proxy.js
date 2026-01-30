const HttpsProxyAgent = require("https-proxy-agent");
const merge = require("lodash/merge");

const { fetcher, parseBody, stringifyBody } = require("../utils");

/**
 * Builds the appropriate request body with CPR data based on HTTP method and URL.
 */
function attachIdentifiers({ method, url, libraryCardNumber, originalBody }) {
  const bodyObj = parseBody(originalBody);

  if (
    method === "POST" &&
    url.startsWith("/external/agencyid/patrons/withGuardian/")
  ) {
    return merge({}, bodyObj, {
      guardian: { personIdentifier: libraryCardNumber },
    });
  }

  if (
    method === "PUT" &&
    url.startsWith("/external/agencyid/patrons/patronid/v8")
  ) {
    const hasPincodeChange = !!bodyObj?.pincodeChange;
    const hasLibraryCardNumber = !!bodyObj?.pincodeChange?.libraryCardNumber;

    if (hasPincodeChange && !hasLibraryCardNumber) {
      return merge({}, bodyObj, { pincodeChange: { libraryCardNumber } });
    }

    return bodyObj;
  }

  // Default: do nothing
  return bodyObj;
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
  async function fetch({
    sessionKey,
    credentials,
    patronId,
    libraryCardNumber,
  }) {
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

    if (libraryCardNumber) {
      body = attachIdentifiers({
        method,
        url,
        libraryCardNumber,
        originalBody: body,
      });
    }

    if (body) {
      options.body = stringifyBody(body);
    }

    let res = await fetcher(
      fbsUrl + replacePath({ url, agencyId, isil, patronId }),
      options,
      log
    );

    console.log("################res", res);

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
