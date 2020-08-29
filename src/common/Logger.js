/**
 * Logger
 * Logs messages to specific files depending on the message type
 **/

const { createWriteStream } = require('fs');
const { closeStreams } = require('./helpers');

class Logger {
  constructor(
    retryErrorPath = null,
    validationErrorPath = null,
    generalErrorPath = null,
    successPath = null,
    mode = 'w'
  ) {
    // Flag, that indicates in what mode files should be opened for logging
    this.mode = mode;
    this._pathTypes = {
      retryError: retryErrorPath,
      validationError: validationErrorPath,
      generalError: generalErrorPath,
      success: successPath,
    };
    this._steamTypes = {
      retryError: null,
      validationError: null,
      generalError: null,
      success: null,
    };
  }

  // Gets a proper stream
  _getStream(type) {
    if (!type || !this._pathTypes[type]) type = 'generalError';
    if (this._steamTypes[type] === null)
      this._steamTypes[type] = createWriteStream(this._pathTypes[type], { flags: this.mode });
    return this._steamTypes[type];
  }

  /**
   * @desc Logs a message to a specific file depending on the message type
   * @param {string} type - message type
   * @param {(string|Error)} message - message to log
   * @param {...(string|number)} args - additional information
   * @returns {void}
   */
  log(type, message, ...args) {
    try {
      args = args.filter((item) => item.length);
      const info = args.length ? `${args.join(', ')} ` : '';
      const stream = this._getStream(type);
      if (message instanceof Error) console.log(`${info}${message.stack}`);
      if (type === 'generalError' && stream) stream.write(`${info}${message.stack}\n`);
      else stream && stream.write(`${info}${message}\n`);
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
      await closeStreams(Object.values(this._steamTypes));
    } catch (err) {
      console.log(err);
    }
  }
}

module.exports = Logger;
