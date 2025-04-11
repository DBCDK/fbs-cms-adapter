const fetch = require("node-fetch");

/**
 * Wraps fetch API
 * Adds some error handling as well as logging
 */
async function fetcher(url, options, log) {
  const start = process.hrtime();
  let res;
  try {
    log.debug(
      `Creating external HTTP request: ${
        (options && options.method) || "GET"
      } ${url}`,
      {
        requestObj: options,
        timings: { ms: nanoToMs(process.hrtime(start)[1]) },
      }
    );

    res = await fetch(url, options);
  } catch (e) {
    log.error(
      `External HTTP request: ${
        (options && options.method) || "GET"
      } ${url} FETCH ERROR`,
      {
        error: String(e),
        stacktrace: e.stack,
        timings: { ms: nanoToMs(process.hrtime(start)[1]) },
      }
    );

    throw {
      code: 500,
      body: "internal server error",
    };
  }
  const contentType = res.headers.get("content-Type");
  const body =
    contentType && contentType.includes("json")
      ? await res.json()
      : await res.text();

  log.info(
    `External HTTP request: ${(options && options.method) || "GET"} ${url} ${
      res.status
    }`,
    { timings: { ms: nanoToMs(process.hrtime(start)[1]) } }
  );

  return {
    code: res.status,
    body,
  };
}

/**
 * Convert ns to ms
 *
 * @param {number} nano
 * @returns {number}
 */
function nanoToMs(nano) {
  return Math.round(nano / 1000000);
}

function parseCredentials(str = "") {
  const lines = str.split(/\r?\n/).filter((l) => l);
  const map = {};
  lines.forEach((line) => {
    const arr = line.split(",");
    map[arr[0]] = {
      agencyId: arr[0],
      isil: `DK-${arr[0]}`,
      username: arr[1],
      password: arr[2],
    };
  });
  return map;
}

const credentialsList = parseCredentials(process.env.FBS_CMS_CREDENTIALS);

function getCredentials({ agencyId, log }) {
  console.log("credentialsList", credentialsList);

  const credentials = credentialsList?.[agencyId];

  if (!credentials?.username || !credentials?.password) {
    log.debug(`Agency '${agencyId}' is missing FBS credentials`);
    throw {
      code: 403,
      body: {
        message: "Agency is missing FBS credentials",
      },
    };
  }

  return credentials;
}

function extractAgencyIdFromUrl(url = "") {
  const parts = url.split("/");
  const v1Index = parts.findIndex((part) => part === "v1");

  if (v1Index !== -1 && parts.length > v1Index + 1) {
    const agencyId = parts[v1Index + 1];
    // Returnér null hvis agencyId bare er strengen "agencyid"
    if (agencyId.toLowerCase() === "agencyid") return null;
    return agencyId;
  }

  return null;
}

/**
 * Convert to string
 *
 * @param {object|string} el
 * @returns {string}
 */
function ensureString(el) {
  const isString = typeof el === "string";
  return isString ? el : JSON.stringify(el);
}

module.exports = {
  fetcher,
  nanoToMs,
  extractAgencyIdFromUrl,
  getCredentials,
  ensureString,
};
