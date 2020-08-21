const { Agent } = require('https');
const Downloader = require('./Downloader');
const { ValidationError, RequestError, StopError } = require('../common/customErrors');

class MultiDownloader {
  constructor(options = {}) {
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 1,
      });
    this.logger = options.logger || console;
    this.downloader = new Downloader({
      path: options.path,
      httpsAgent: this.httpsAgent,
      pause: options.pause,
      logger: this.logger,
    });
  }

  async getDocs(queries) {
    try {
      await Promise.allSettled(queries.map((query) => this.downloader.getDocs(query)));
    } catch (err) {
      this.logger.log(err);
    }
  }

  async getMetaData(queries) {
    let data = [];

    try {
      const results = await Promise.allSettled(
        queries.map((query) => this.downloader.getMetaData(query))
      );
      data = results.reduce(
        (acc, result) => {
          if (result.status === 'fulfilled') acc[0].push(result.value);
          else if (result.reason instanceof RequestError) acc[1].push(result.reason.message);
          else if (result.reason instanceof StopError) acc[2].push(result.reason.message);
          else if (result.reason instanceof ValidationError) acc[3].push(result.reason.message);
          return acc;
        },
        [[], [], [], []]
      );
      // data[0] = data[0].flat();
    } catch (err) {
      this.logger.log(err);
    }
    console.log(data);
    return data;
  }

  convertMetaDataItem(item) {
    return this.downloader.convertMetaDataItem(item);
  }

  convertMetaData(data) {
    return this.downloader.convertMetaData(data);
  }

  async getMetaObject(queries) {
    const data = await this.getMetaData(queries);
    return this.convertMetaData(data[0].flat());
  }
}

module.exports = MultiDownloader;
