/**
 * MultiDownloader
 * Downloads metadata and EGRUL pdf documents on companies from nalog.ru website.
 * Accepts an array of queries and search by inn, ogrn, company name and region.
 * If several companies are found for the query, they all will be downloaded.
 **/

const { Agent } = require('https');
const Downloader = require('./Downloader');
const { ValidationError, RequestError, StopError } = require('../common/customErrors');

class MultiDownloader {
  /**
   * MultiDownloader class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {string} [options.outputPath=resolve(process.cwd(), 'output')] - path to download pdf files
   * @param {number} [options.sockets=1] - maximum number of sockets to allow
   * @param {number} [options.pause=1500] - pause between requests in milliseconds
   * @param {https.Agent} [options.httpsAgent=new Agent()] - https agent to manage connections
   * @param {Logger} [options.logger=console] - logger to log errors and success requests
   */
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
   * @desc Gets metadata of the companies found by inns
   * @param {Array.<string>} queries - inns of companies to search
   * @returns {Promise} - Promise object represents an array of arrays of inns
   * or arrays of metadata objects, composed by status of result and type of errors
   */
  async getMetadataByInn(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getMetadataByInn(query))
    );
    return this._processResults(results);
  }

  /**
   * @desc Gets EGRUL pdf documents on the companies found by query parameters
   * @param {Array.<(string|Object)>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as queries[].query
   * @param {string} queries[].query - inn, ogrn or company name
   * @param {string} [queries[].region] - a string of region codes separated by a comma - '5,12' or '10'
   * @param {string} [queries[].page] - page number - '2' or '10'
   * @returns {Promise} - Promise object represents void
   */
  async getDocs(queries) {
    await Promise.allSettled(queries.map((query) => this.downloader.getDocs(query)));
  }

  /**
   * @desc Gets metadata of the companies found by query parameters
   * @param {Array.<(string|Object)>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as queries[].query
   * @param {string} queries[].query - inn, ogrn or company name
   * @param {string} [queries[].region] - a string of region codes separated by a comma - '5,12' or '10'
   * @param {string} [queries[].page] - page number - '2' or '10'
   * @returns {Promise} - Promise object represents an array of metadata objects
   */
  async getMetadata(queries) {
    const results = await Promise.allSettled(
      queries.map((query) => this.downloader.getMetadata(query))
    );
    return results
      .reduce((acc, result) => {
        if (result.status === 'fulfilled') acc.push(result.value);
        return acc;
      }, [])
      .flat();
  }

  /**
   * @desc Converts company metadata according to map
   * @param {Object} item - company metadata object to convert
   * @returns {Object} - converted metadata object
   */
  convertMetadataItem(item) {
    return this.downloader.convertMetadataItem(item);
  }

  /**
   * @desc Converts metadata of the companies according to map
   * @param {Array} data - array of metadata objects to convert
   * @returns {Array} - array of converted metadata objects
   */
  convertMetadata(data) {
    return this.downloader.convertMetadata(data);
  }

  /**
   * @desc Gets converted metadata of the companies found by query parameters
   * @param {Array.<(string|Object)>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as queries[].query
   * @param {string} queries[].query - inn, ogrn or company name
   * @param {string} [queries[].region] - a string of region codes separated by a comma - '5,12' or '10'
   * @param {string} [queries[].page] - page number - '2' or '10'
   * @returns {Promise} - Promise object represents an array of converted metadata objects
   */
  async getMetadataObjects(queries) {
    const data = await this.getMetadata(queries);
    return this.convertMetadata(data);
  }
}

module.exports = MultiDownloader;
