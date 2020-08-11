const { createWriteStream } = require('fs');

class Logger {
  constructor(
    retryErrorPath = null,
    validationErrorPath = null,
    generalErrorPath = null,
    successPath = null,
    mode = 'w'
  ) {
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

  _getStream(type) {
    if (this._steamTypes[type] === null && this._pathTypes[type])
      this._steamTypes[type] = createWriteStream(this._pathTypes[type], { flags: this.mode });
    return this._steamTypes[type];
  }

  log(type, message, ...args) {
    const info = args.length ? `${args.join(', ')} ` : '';
    const stream = this._getStream(type);
    if (message instanceof Error) console.log(`${info}${message.stack}`);
    if (type === 'generalError' && stream) stream.write(`${info}${message.stack}\n`);
    else stream && stream.write(`${info}${message}\n`);
  }

  async closeStreams() {
    const streamPromises = Object.keys(this._steamTypes).map((stream) => {
      if (this._steamTypes[stream]) {
        this._steamTypes[stream].end();
        return new Promise((resolve) => this._steamTypes[stream].on('close', resolve));
      }
      return new Promise((resolve) => resolve());
    });
    await Promise.allSettled(streamPromises);
  }
}

module.exports = Logger;
