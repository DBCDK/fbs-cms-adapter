const HttpsProxyAgent = require("https-proxy-agent");

const { fetcher } = require("../utils");

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
  async function fetch({ sessionKey, agencyid, patronId }) {
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

    if (body) {
      options.body = typeof body === "object" ? JSON.stringify(body) : body;
    }

    let res = await fetcher(
      process.env.FBS_CMS_API_URL + replacePath({ url, agencyid, patronId }),
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
