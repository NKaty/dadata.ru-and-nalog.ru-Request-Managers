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

  async getMetaData(queries) {
    let data = [];
    try {
      const results = await Promise.allSettled(
        queries.map((query) => this.downloader.getMetaData(query))
      );
      data = results
        .map((result) => {
          if (result.status === 'fulfilled') return result.value;
          else console.log(result.reason);
        })
        .flat();
    } catch (err) {
      console.log(err);
    }
    return data;
  }

  convertMetaData(data) {
    return this.downloader.convertMetaData(data);
  }

  async getMetaObject(queries) {
    const data = await this.getMetaData(queries);
    return this.convertMetaData(data);
  }
}

module.exports = MultiDownloader;
