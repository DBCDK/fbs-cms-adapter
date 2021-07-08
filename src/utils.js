const fetch = require("node-fetch");

/**
 * Wraps fetch API
 * Adds some error handling as well as logging
 */
async function fetcher(url, options, log) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    log.error(
      `Outgoing request: ${
        (options && options.method) || "GET"
      } ${url} FETCH ERROR`
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
    `Outgoing request: ${(options && options.method) || "GET"} ${url} ${
      res.status
    }`
  );

  return {
    code: res.status,
    body,
  };
}

module.exports = {
  fetcher,
};
