/**
 * Downloader
 * Downloads metadata and EGRUL pdf documents on companies from nalog.ru website.
 * Can search by inn, ogrn, company name and region.
 * If several companies are found for the query, they all will be downloaded.
 **/

const { createWriteStream } = require('fs');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { Agent } = require('https');
const { resolve } = require('path');
const fetch = require('node-fetch');
const ratelimit = require('promise-ratelimit');
const { ValidationError, RequestError, StopError } = require('../common/customErrors');
const { getDate } = require('../common/helpers');

const streamPipeline = promisify(pipeline);

class Downloader {
  /**
   * Downloader class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {string} [options.outputPath=null] - path to download pdf files
   * @param {number} [options.sockets=1] - maximum number of sockets to allow
   * @param {number} [options.pause=1500] - pause between requests in milliseconds
   * @param {https.Agent} [options.httpsAgent=new Agent()] - https agent to manage connections
   * @param {Logger} [options.logger=console] - logger to log errors and success requests
   */
  constructor(options = {}) {
    // Output directory for pdf files
    this.outputPath = options.outputPath || null;
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 1,
      });
    // Pause between requests in milliseconds
    // Should be long enough not to cause 'Captcha is required' error
    this.pause = options.pause === null || options.pause === undefined ? 1500 : options.pause;
    this.throttle = ratelimit(this.pause);
    this.logger = options.logger || console;
    this.url = 'https://egrul.nalog.ru/';
    // Metadata information on a company, that can be obtained from request when pdf document is downloading
    this.map = {
      g: 'management',
      n: 'full_name',
      c: 'short_name',
      a: 'address',
      o: 'ogrn',
      r: 'ogrn_date',
      i: 'inn',
      p: 'kpp',
      e: 'liquidation_date',
      v: 'invalidation_date',
      k: 'type',
    };
    this._searchPage = false;
  }

  async _makeRequest(url, options = { agent: this.httpsAgent }) {
    let json;
    const response = await fetch(url, options);

    if (response.ok) json = await response.json();
    else throw new RequestError('An error occurred during the request.');

    if (json && (json.captchaRequired || json.ERRORS))
      throw new StopError('The captcha is required.');

    return json;
  }

  // Sends search request
  async _sendForm(query, region, page = '') {
    const params = new URLSearchParams();
    params.append('vyp3CaptchaToken', '');
    params.append('page', `${page}`);
    params.append('query', `${query}`);
    params.append('region', `${region}`);
    params.append('PreventChromeAutocomplete', '');

    try {
      const json = await this._makeRequest(this.url, {
        method: 'POST',
        agent: this.httpsAgent,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      return json.t;
    } catch (err) {
      this.logger.log('retryError', err, query, region, page);
      throw err;
    }
  }

  // Gets search result, which includes companies metadata
  async _getSearchResult(query, region, token, page = '') {
    let json;
    let docs;

    try {
      json = await this._makeRequest(
        `${this.url}search-result/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`
      );
    } catch (err) {
      this.logger.log('retryError', err, query, region, page);
      throw err;
    }

    try {
      // If there is no search result yet, repeat request in 1 second
      if (json.status === 'wait') {
        docs = await new Promise((resolve, reject) =>
          setTimeout(async () => {
            try {
              const results = await this._getSearchResult(query, region, token, page);
              resolve(results);
            } catch (err) {
              reject(err);
            }
          }, 1000)
        );
      } else {
        // There is search result
        docs = json.rows;
        // If we are on the first page, find out the number of pages
        if (docs.length && !this._searchPage && (page === '' || page === '1')) {
          const pages = Math.ceil(docs[0].cnt / docs.length);
          // If the number of pages more than 1, get information from all other pages
          if (pages > 1) {
            const results = await Promise.allSettled(
              Array(pages - 1)
                .fill()
                .map((e, i) => i + 2)
                .map((page) => this._getPage(query, region, page))
            );
            docs = [
              ...docs,
              ...results.reduce((acc, result) => {
                if (result.status === 'fulfilled') acc.push(result.value);
                return acc;
              }, []),
            ].flat();
          }
        }
      }
      return docs;
    } catch (err) {
      this.logger.log('retryError', err, query, region, page);
      throw err;
    }
  }

  // Gets specific page
  async _getPage(query, region, page) {
    await this.throttle();
    const token = await this._sendForm(query, region, page);
    return this._getSearchResult(query, region, token, page);
  }

  // Sends request to download pdf file
  async _requestFile(doc) {
    try {
      await this.throttle();
      const json = await this._makeRequest(
        `${this.url}vyp-request/${doc.t}?r=&_=${new Date().getTime()}`
      );
      await this._waitForResponse(json.t, doc.i);
    } catch (err) {
      this.logger.log('retryError', err, doc.i);
      throw err;
    }
  }

  // Gets permission to download file
  async _waitForResponse(token, inn) {
    const json = await this._makeRequest(
      `${this.url}vyp-status/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`
    );
    // If file is ready for download
    if (json.status === 'ready') await this._downloadFile(token, inn);
    // Otherwise, check in 1 second
    else
      await new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            await this._waitForResponse(token, inn);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 1000);
      });
  }

  // Downloads pdf file
  async _downloadFile(token, inn) {
    const response = await fetch(`${this.url}vyp-download/${token}`, { agent: this.httpsAgent });
    if (response.ok)
      await streamPipeline(
        response.body,
        createWriteStream(resolve(this.outputPath, `${inn || getDate()}.pdf`))
      );
    else throw new RequestError('Failed to download the document.');
    this.logger.log('success', `${inn || getDate()}.pdf is downloaded.`);
  }

  _getRequestParams(params) {
    if (typeof params === 'string') return [params, '', ''];
    else {
      this._searchPage = !!params.page;
      return [params.query, params.region || '', params.page || ''];
    }
  }

  /**
   * @desc Gets company metadata by its inn
   *  It is assumed, that only one company can be found,
   *  so length of the array of meta dada objects will be 1
   * @param {string} inn - company inn to search
   * @returns {Promise} - Promise object represents an array of metadata objects
   * @throws {ValidationError} - if no company is found
   * @throws {StopError} - if the time limitation of nalog.ru were violated
   * @throws {RequestError} - if network errors occurred
   */
  async getMetadataByInn(inn) {
    const [query, region] = this._getRequestParams(inn);
    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      const results = await this._getSearchResult(query, region, token);
      if (results && (!results.length || !results[0].i)) throw new ValidationError('Invalid inn.');
      this.logger.log('success', `${results[0].i} Metadata is received.`);
      return results.slice(0, 1);
    } catch (err) {
      if (err instanceof StopError) throw new StopError(inn);
      else if (err instanceof ValidationError) {
        this.logger.log('validationError', err, inn);
        throw new ValidationError(inn);
      } else throw new RequestError(inn);
    }
  }

  /**
   * @desc Gets metadata of the companies found by query parameters
   * @param {(string|Object)} params - query parameters to search
   * If params is a string, it will be treated as params.query
   * @param {string} params.query - inn, ogrn or company name
   * @param {string} [params.region] - a string of region codes separated by a comma - '5,12' or '10'
   * @param {string} [params.page] - page number - '2' or '10'
   * @returns {Promise} - Promise object represents an array of metadata objects
   */
  async getMetadata(params) {
    const [query, region, page] = this._getRequestParams(params);
    try {
      await this.throttle();
      const token = await this._sendForm(query, region, page);
      const results = await this._getSearchResult(query, region, token, page);
      if (results && !results.length) throw new ValidationError('Nothing was found.');
      return results.filter((item) => {
        if (item.i) {
          this.logger.log('success', `${item.i} Metadata is received.`);
          return true;
        }
      });
    } catch (err) {
      if (err instanceof ValidationError)
        this.logger.log('validationError', err, query, region, page);
      return [];
    }
  }

  /**
   * @desc Converts company metadata according to map
   * @param {Object} item - company metadata object to convert
   * @returns {Object} - converted metadata object
   */
  convertMetadataItem(item) {
    return Object.keys(item).reduce((acc, field) => {
      if (field in this.map) {
        if (field === 'g') {
          const subFields = item[field].split(': ');
          acc[this.map[field]] = {
            post: subFields[0],
            name: subFields[1],
          };
        } else {
          acc[this.map[field]] = item[field];
        }
      }
      return acc;
    }, {});
  }

  /**
   * @desc Converts metadata of the companies according to map
   * @param {Array} data - array of metadata objects to convert
   * @returns {Array} - array of converted metadata objects
   */
  convertMetadata(data) {
    return data.map((item) => this.convertMetadataItem(item));
  }

  /**
   * @desc Gets metadata of the companies by query parameters and convert it
   * @param {(string|Object)} params - query parameters to search
   * If params is a string, it will be treated as params.query
   * @param {string} params.query - inn, ogrn or company name
   * @param {string} [params.region] - a string of region codes separated by a comma - '5,12' or '10'
   * @param {string} [params.page] - page number - '2' or '10'
   * @return {Promise} - Promise object represents an array of converted metadata objects
   */
  async getMetadataObjects(params) {
    const data = await this.getMetadata(params);
    return this.convertMetadata(data);
  }

  /**
   * @desc Gets EGRUL pdf document on the company by its inn
   *  It is assumed, that only one company or none can be found,
   *  so only one pdf file or none will be downloaded
   * @param {string} inn - company inn to search
   * @returns {Promise} - Promise object represents company inn
   * @throws {ValidationError} - if no company is found
   * @throws {StopError} - if the time limitation of nalog.ru were violated
   * @throws {RequestError} - if network errors occurred
   */
  async getDocByInn(inn) {
    const [query, region] = this._getRequestParams(inn);

    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      const results = await this._getSearchResult(query, region, token);
      if (results && (!results.length || !results[0].i)) throw new ValidationError('Invalid inn.');
      await this._requestFile(results[0]);
      return inn;
    } catch (err) {
      if (err instanceof StopError) throw new StopError(inn);
      else if (err instanceof ValidationError) {
        this.logger.log('validationError', err, inn);
        throw new ValidationError(inn);
      } else throw new RequestError(inn);
    }
  }

  /**
   * @desc Gets EGRUL pdf documents on the companies found by query parameters
   * @param {(string|Object)} params - query parameters to search
   * If params is a string, it will be treated as params.query
   * @param {string} params.query - inn, ogrn or company name
   * @param {string} [params.region] - a string of region codes separated by a comma - '5,12' or '10'
   * @param {string} [params.page] - page number - '2' or '10'
   * @returns {Promise} - Promise object represents void
   */
  async getDocs(params) {
    const [query, region, page] = this._getRequestParams(params);

    try {
      await this.throttle();
      const token = await this._sendForm(query, region, page);
      const results = await this._getSearchResult(query, region, token, page);
      if (results && !results.length) throw new ValidationError('Nothing was found.');
      await Promise.allSettled(
        results.filter((result) => !!result.i).map((result) => this._requestFile(result))
      );
    } catch (err) {
      if (err instanceof ValidationError)
        this.logger.log('validationError', err, query, region, page);
    }
  }
}

module.exports = Downloader;
