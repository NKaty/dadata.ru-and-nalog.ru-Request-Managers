const { Agent } = require('https');
const Downloader = require('./Downloader');

class MultiDownloader {
  constructor(options = {}) {
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 1,
      });
    this.pause = options.pause || 2000;
    this.downloader = new Downloader({ httpsAgent: this.httpsAgent, pause: this.pause });
  }

  async getDocs(queries) {
    try {
      await Promise.allSettled(queries.map((query) => this.downloader.getDocs(query)));
    } catch (err) {
      console.log(err);
    }
  }
}

module.exports = MultiDownloader;
