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
      outputPath: options.outputPath,
      httpsAgent: this.httpsAgent,
      pause: options.pause,
      logger: this.logger,
    });
  }

  _processResults(results) {
    return results.reduce(
      (acc, result) => {
        if (result.status === 'fulfilled') acc[0].push(result.value);
        else if (result.reason instanceof RequestError) acc[1].push(result.reason.message);
        else if (result.reason instanceof StopError) acc[2].push(result.reason.message);
        else if (result.reason instanceof ValidationError) acc[3].push(result.reason.message);
        return acc;
      },
      [[], [], [], []]
    );
  }

  async getDocsByInn(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getDocByInn(query))
    );
    return this._processResults(results);
  }

  async getMetaDataByInn(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getMetaDataByInn(query))
    );
    return this._processResults(results);
  }

  async getDocs(queries) {
    await Promise.allSettled(queries.map((query) => this.downloader.getDocs(query)));
  }

  async getMetaData(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getMetaData(query))
    );
    return results
      .reduce((acc, result) => {
        if (result.status === 'fulfilled') acc.push(result.value);
        return acc;
      }, [])
      .flat();
  }

  convertMetaDataItem(item) {
    return this.downloader.convertMetaDataItem(item);
  }

  convertMetaData(data) {
    return this.downloader.convertMetaData(data);
  }

  async getMetaObjects(queries) {
    const data = await this.getMetaData(queries);
    return this.convertMetaData(data);
  }
}

module.exports = MultiDownloader;
