const HttpProxyAgent = require("http-proxy-agent");

const { fetcher } = require("../utils");

function replacePath({ url, agencyid, patronId }) {
  return url
    .replace("/agencyid/", `/${agencyid}/`)
    .replace("/patronid/", `/${patronId}/`);
}

/**
 * Initializes the proxy
 */
function init(request) {
  /**
   * The actual fetch function
   */
  async function fetch({ sessionKey, agencyid, patronId }) {
    // use this when token is a header
    const url = request.url;

    const options = {
      method: request.method,
      headers: {
        ...request.headers,
        "X-Session": sessionKey,
      },
    };

    if (process.env.HTTPS_PROXY) {
      options.agent = new HttpProxyAgent(process.env.HTTPS_PROXY);
    }

    delete options.headers.host;
    delete options.headers.authorization;

    if (request.body) {
      options.body =
        typeof request.body === "object"
          ? JSON.stringify(request.body)
          : request.body;
    }

    let res = await fetcher(
      process.env.FBS_CMS_API_URL + replacePath({ url, agencyid, patronId }),
      options,
      request.log
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
