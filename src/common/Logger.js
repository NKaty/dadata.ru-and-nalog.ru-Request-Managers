/**
 * Logger
 * Logs messages to specific files depending on the message type
 **/

const { createWriteStream } = require('fs');
const { getDate, closeStreams } = require('./helpers');

class Logger {
  /**
   * Logger class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {string} [options.mode='w'] - flag, that indicates in what mode files
   *  should be opened for logging
   * @param {?string} [options.parsingErrorPath=null] - path to file to log parsing errors
   * @param {?string} [options.retryErrorPath=null] - path to file to log network errors to retry
   * @param {?string} [options.validationErrorPath=null] - path to file to log validation errors
   * @param {?string} [options.generalErrorPath=null] - path to file to log general errors
   * @param {?string} [options.successPath=null] - path to file to log successful requests
   */
  constructor(options = {}) {
    this.mode = options.mode || 'w';
    this._pathTypes = {
      parsingError: options.parsingErrorPath || null,
      retryError: options.retryErrorPath || null,
      validationError: options.validationErrorPath || null,
      generalError: options.generalErrorPath || null,
      success: options.successPath || null,
    };

    this._streamTypes = {
      parsingError: null,
      retryError: null,
      validationError: null,
      generalError: null,
      success: null,
    };
  }

  // Gets a proper stream
  _getStream(type) {
    if (!type || !this._pathTypes[type]) type = 'generalError';
    if (this._streamTypes[type] === null && this._pathTypes[type])
      this._streamTypes[type] = createWriteStream(this._pathTypes[type], { flags: this.mode });
    return this._streamTypes[type];
  }

  /**
   * @desc Logs a message to a specific file depending on the message type
   * @param {string} type - message type
   * @param {(string|Error)} message - message to log
   * @param {...(string|number)} [args] - additional information
   * @returns {void}
   */
  log(type, message, ...args) {
    try {
      args = args.filter((item) => item !== undefined && item !== null && item.length);
      const info = args.length ? `${args.join(', ')} ` : '';
      const stream = this._getStream(type);
      if (message instanceof Error && message.stack) console.log(`${info}${message.stack}`);
      if (stream) {
        if (type === 'generalError' && message instanceof Error && message.stack) {
          stream.write(`${getDate(true)} ${info}${message.stack}\n`);
        } else {
          stream.write(`${getDate(true)} ${info}${message}\n`);
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * @desc Closes message streams
   * @returns {Promise} - Promise object represents void
   */
  async closeStreams() {
    try {
      await closeStreams(Object.values(this._streamTypes));
      Object.keys(this._streamTypes).forEach((key) => (this._streamTypes[key] = null));
    } catch (err) {
      console.log(err);
    }
  }
}

module.exports = Logger;
