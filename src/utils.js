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
      fbsUrl: arr[3] || process.env.FBS_CMS_API_URL,
    };
  });
  return map;
}

const credentialsList = parseCredentials(process.env.FBS_CMS_CREDENTIALS);

function getCredentials({ agencyId, log }) {
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

/**
 * Returns the raw value in the `/agencyid/` position of the URL,
 * including values like "agencyid", "DK-123456", or "123456".
 */
function extractAgencyPathFromUrl(url = "") {
  const parts = url.split("/");
  const externalIndex = parts.findIndex((part) => part === "external");

  if (externalIndex !== -1 && parts.length > externalIndex + 1) {
    let index = externalIndex + 1;

    // If next part is a version like v1, v2, v10, skip it
    if (/^v\d+$/i.test(parts[index])) {
      index++;
    }

    if (parts.length > index) {
      return parts[index]; // Return the value in the agencyid position
    }
  }

  return null;
}

/**
 * Returns a cleaned agencyId (e.g. "123456") from the URL,
 * or null if it's just a placeholder like "agencyid".
 */
function extractAgencyIdFromUrl(url = "") {
  const raw = extractAgencyPathFromUrl(url);
  if (!raw || raw.toLowerCase() === "agencyid") return null;

  return raw.replace(/^dk-/i, "");
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
  extractAgencyPathFromUrl,
  getCredentials,
  ensureString,
};
