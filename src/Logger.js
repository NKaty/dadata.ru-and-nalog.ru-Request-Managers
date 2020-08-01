const { createWriteStream } = require('fs');

class Logger {
  constructor(errorPath = null, successPath = null, mode = 'w') {
    this.errorFileStream = errorPath && createWriteStream(errorPath, { flags: mode });
    this.successFileStream = successPath && createWriteStream(successPath, { flags: mode });
  }

  log(message, ...args) {
    const info = args.length ? `${args.join(', ')} ` : '';
    if (message instanceof Error) {
      console.log(`${info}${message.stack}`);
      this.errorFileStream && this.errorFileStream.write(`${info}${message}\n`);
    } else {
      this.successFileStream && this.successFileStream.write(`${info}${message}\n`);
    }
  }
}

module.exports = Logger;
