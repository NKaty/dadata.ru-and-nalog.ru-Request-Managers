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
  constructor(options = {}) {
    this.outputPath = options.outputPath || resolve(process.cwd(), 'output');
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 1,
      });
    this.pause = options.pause === null || options.pause === undefined ? 1500 : options.pause;
    this.throttle = ratelimit(this.pause);
    this.logger = options.logger || console;
    this.url = 'https://egrul.nalog.ru/';
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
        docs = json.rows;
        if (docs.length && (page === '' || page === '1')) {
          const pages = Math.ceil(docs[0].cnt / docs.length);
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

  async _getPage(query, region, page) {
    await this.throttle();
    const token = await this._sendForm(query, region, page);
    return this._getSearchResult(query, region, token, page);
  }

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

  async _waitForResponse(token, inn) {
    const json = await this._makeRequest(
      `${this.url}vyp-status/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`
    );
    if (json.status === 'ready') await this._downloadFile(token, inn);
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

  async _downloadFile(token, inn) {
    const response = await fetch(`${this.url}vyp-download/${token}`, { agent: this.httpsAgent });
    if (response.ok)
      await streamPipeline(
        response.body,
        createWriteStream(resolve(this.outputPath, `${inn || getDate()}.pdf`))
      );
    else throw new RequestError('Failed to download the document.');
    this.logger.log('success', `${inn}.pdf is downloaded.`);
  }

  _getRequestParams(params) {
    if (typeof params === 'string') return [params, ''];
    else return [params.query, params.region];
  }

  async getMetaDataByInn(inn) {
    const [query, region] = this._getRequestParams(inn);
    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      const results = await this._getSearchResult(query, region, token);
      if (results && (!results.length || !results[0].i)) throw new ValidationError('Invalid inn.');
      this.logger.log('success', `${results[0].i} Meta data is received.`);
      return results.slice(0, 1);
    } catch (err) {
      if (err instanceof StopError) throw new StopError(inn);
      else if (err instanceof ValidationError) {
        this.logger.log('validationError', err, inn);
        throw new ValidationError(inn);
      } else throw new RequestError(inn);
    }
  }

  async getMetaData(params) {
    const [query, region] = this._getRequestParams(params);
    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      const results = await this._getSearchResult(query, region, token);
      if (results && !results.length) throw new ValidationError('Nothing was found.');
      return results.filter((item) => {
        if (item.i) {
          this.logger.log('success', `${item.i} Meta data is received.`);
          return true;
        }
      });
    } catch (err) {
      if (err instanceof ValidationError) this.logger.log('validationError', err, query, region);
      return [];
    }
  }

  convertMetaDataItem(item) {
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

  convertMetaData(data) {
    return data.map((item) => this.convertMetaDataItem(item));
  }

  async getMetaObjects(params) {
    const data = await this.getMetaData(params);
    return this.convertMetaData(data);
  }

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

  async getDocs(params) {
    const [query, region] = this._getRequestParams(params);

    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      const results = await this._getSearchResult(query, region, token);
      if (results && !results.length) throw new ValidationError('Nothing was found.');
      await Promise.allSettled(
        results.filter((result) => !!result.i).map((result) => this._requestFile(result))
      );
    } catch (err) {
      if (err instanceof ValidationError) this.logger.log('validationError', err, query, region);
    }
  }
}

module.exports = Downloader;
