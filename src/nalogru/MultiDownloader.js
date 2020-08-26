/**
 * MultiDownloader
 * Downloads meta data and EGRUL pdf documents on companies.
 * Can accept an array of queries and search by inn, ogrn, company name and region.
 * If several companies are found for the query, they all will be downloaded.
 **/

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

  // Sorts download results by status of result and type of errors
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

  /**
   * @desc Gets EGRUL pdf documents on the companies found by inns
   * @param {Array.<string>} queries - inns of companies to search
   * @returns {Promise} - Promise object represents an array of arrays of inns,
   * composed by status of result and type of errors
   */
  async getDocsByInn(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getDocByInn(query))
    );
    return this._processResults(results);
  }

  /**
   * @desc Gets meta data of the companies found by inns
   * @param {Array.<string>} queries - inns of companies to search
   * @returns {Promise} - Promise object represents an array of arrays of inns
   * or arrays of meta data objects, composed by status of result and type of errors
   */
  async getMetaDataByInn(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getMetaDataByInn(query))
    );
    return this._processResults(results);
  }

  /**
   * @desc Gets EGRUL pdf documents on the companies found by query parameters
   * @param {Array.<(string|{query: string, region: string})>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as a query field (not a region field)
   * @returns {Promise}
   */
  async getDocs(queries) {
    await Promise.allSettled(queries.map((query) => this.downloader.getDocs(query)));
  }

  /**
   * @desc Gets meta data of the companies found by query parameters
   * @param {Array.<(string|{query: string, region: string})>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as a query field (not a region field)
   * @returns {Promise} - Promise object represents an array of meta data objects
   */
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

  /**
   * @desc Converts company meta data according to map
   * @param {Object} item - company meta data object to convert
   * @returns {Object} - converted meta data object
   */
  convertMetaDataItem(item) {
    return this.downloader.convertMetaDataItem(item);
  }

  /**
   * @desc Converts meta data of the companies according to map
   * @param {Array} data - array of meta data objects to convert
   * @returns {Array} - array of converted meta data objects
   */
  convertMetaData(data) {
    return this.downloader.convertMetaData(data);
  }

  /**
   * @desc Gets converted meta data of the companies found by query parameters
   * @param {Array.<(string|{query: string, region: string})>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as a query field (not a region field)
   * @returns {Promise} - Promise object represents an array of converted meta data objects
   */
  async getMetaObjects(queries) {
    const data = await this.getMetaData(queries);
    return this.convertMetaData(data);
  }
}

module.exports = MultiDownloader;
