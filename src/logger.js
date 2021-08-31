const { log } = require("dbc-node-logger");

/**
 * Creates logger instance with extra properties added
 *
 * @param {object} extra
 * @returns {object}
 */
function initLogger(extra = {}) {
  return {
    info: (msg, args = {}) => log.info(msg, { ...args, ...extra }),
    warn: (msg, args = {}) => log.warn(msg, { ...args, ...extra }),
    error: (msg, args = {}) => log.error(msg, { ...args, ...extra }),
    debug: (msg, args = {}) => log.debug(msg, { ...args, ...extra }),
    trace: (msg, args = {}) => log.trace(msg, { ...args, ...extra }),
    child: (extraChild = {}) => initLogger({ ...extra, ...extraChild }),
  };
}

module.exports = initLogger;
