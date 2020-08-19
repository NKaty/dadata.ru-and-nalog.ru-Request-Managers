const { createWriteStream } = require('fs');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { Agent } = require('https');
const { resolve } = require('path');
const fetch = require('node-fetch');
const ratelimit = require('promise-ratelimit');
const { ValidationError, RequestError, StopError } = require('./customErrors');

const streamPipeline = promisify(pipeline);

class Downloader {
  constructor(options = {}) {
    this.path = options.path || '';
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
    };
  }

  async _sendForm(query, region, page = '') {
    const params = new URLSearchParams();
    params.append('vyp3CaptchaToken', '');
    params.append('page', `${page}`);
    params.append('query', `${query}`);
    params.append('region', `${region}`);
    params.append('PreventChromeAutocomplete', '');
    let json;

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        agent: this.httpsAgent,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      json = await response.json();

      if (json && (json.captchaRequired || json.ERRORS)) {
        throw new StopError('The captcha is required.');
      }

      return json.t;
    } catch (err) {
      this.logger.log('retryError', err, query, region, page, '1');
      if (err instanceof StopError) throw err;
      return false;
    }
  }

  async _getSearchResult(query, region, token, page = '') {
    let json;
    try {
      const response = await fetch(
        `${this.url}search-result/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
        { agent: this.httpsAgent }
      );
      json = await response.json();

      if (json && (json.captchaRequired || json.ERRORS)) {
        throw new StopError('The captcha is required.');
      }
    } catch (err) {
      this.logger.log('retryError', err, query, region, page, '2');
      if (err instanceof StopError) throw err;
      return false;
    }

    try {
      if (json.status === 'wait') {
        return new Promise((resolve) =>
          setTimeout(async () => {
            try {
              const results = await this._getSearchResult(query, region, token, page);
              resolve(results);
            } catch (err) {
              this.logger.log(err, query, region, page);
              resolve(false);
            }
          }, 1000)
        );
      } else {
        let docs = json.rows;
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
                else this.logger.log(result.reason, '3');
                return acc;
              }, []),
            ].flat();
          }
        }
        return docs;
      }
    } catch (err) {
      this.logger.log('retryError', err, query, region, page, '4');
      if (err instanceof StopError) throw err;
      return false;
    }
  }

  async _getPage(query, region, page) {
    await this.throttle();
    const token = await this._sendForm(query, region, page);
    if (!token) throw new RequestError(`${query} ${region} ${page} No token!`);
    const results = await this._getSearchResult(query, region, token, page);
    if (!results) throw new RequestError(`${query} ${region} ${page} No documents!`);
    return results;
  }

  async _requestFile(doc) {
    try {
      await this.throttle();
      const response = await fetch(`${this.url}vyp-request/${doc.t}?r=&_=${new Date().getTime()}`, {
        agent: this.httpsAgent,
      });
      const json = await response.json();
      if (json && (json.captchaRequired || json.ERRORS)) {
        throw new StopError('The captcha is required.');
      }
      await this._waitForResponse(json.t, doc.i);
    } catch (err) {
      this.logger.log('retryError', err, doc.i, '5');
      throw err;
    }
  }

  async _waitForResponse(token, inn) {
    try {
      const response = await fetch(
        `${this.url}vyp-status/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
        { agent: this.httpsAgent }
      );
      const json = await response.json();
      if (json && (json.captchaRequired || json.ERRORS)) {
        throw new StopError('The captcha is required.');
      }
      if (json.status === 'ready') await this._downloadFile(token, inn);
      else setTimeout(async () => await this._waitForResponse(token, inn), 1000);
    } catch (err) {
      this.logger.log('retryError', err, inn, '6');
      throw err;
    }
  }

  async _downloadFile(token, inn) {
    try {
      const response = await fetch(`${this.url}vyp-download/${token}`, { agent: this.httpsAgent });
      const path = resolve(this.path, `${inn}.pdf`);
      const writable = createWriteStream(path);
      await streamPipeline(response.body, writable);
      this.logger.log(`${inn}.pdf is downloaded.`);
    } catch (err) {
      this.logger.log('retryError', err, inn, '7');
      if (err instanceof StopError) throw err;
    }
  }

  _getRequestParams(params) {
    if (typeof params === 'string') return [params, ''];
    else return [params.query, params.region];
  }

  async getMetaData(inn) {
    try {
      await this.throttle();
      const token = await this._sendForm(inn);

      if (!token) throw new RequestError(inn);

      const results = await this._getSearchResult(inn, '', token);

      if (!results) throw new RequestError(inn);
      if (!results.length) throw new ValidationError('Invalid inn');

      this.logger.log('success', `${results[0].i} Meta data is received.`);
      return results;
    } catch (err) {
      if (err instanceof StopError) throw new StopError(inn);
      else if (err instanceof ValidationError) {
        this.logger('validationError', err, inn);
        throw new ValidationError(inn);
      } else throw err;
    }
  }

  async _getMetaData(params) {
    const [query, region] = this._getRequestParams(params);
    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      if (!token) return [];
      const results = await this._getSearchResult(query, region, token);
      if (results && !results.length) throw new ValidationError('Nothing was found.');
      if (results)
        results.map((item) => {
          this.logger.log('success', `${item.i} Meta data is received.`);
        });
      return results || [];
    } catch (err) {
      if (err instanceof ValidationError) this.logger.log('validationError', err, query, region);
      else this.logger.log('retryError', err, query, region, '8');
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

  async getMetaObject(params) {
    const data = await this._getMetaData(params);
    return this.convertMetaData(data);
  }

  async getDocs(params) {
    const [query, region] = this._getRequestParams(params);

    try {
      await this.throttle();
      const token = await this._sendForm(query, region);
      if (!token) return;
      const results = await this._getSearchResult(query, region, token);
      if (!results) return;
      await Promise.allSettled(results.map((result) => this._requestFile(result)));
    } catch (err) {
      this.logger.log('retryError', err, query, region, '9');
    }
  }
}

module.exports = Downloader;

new Downloader().getMetaObject('колодцам').then(console.log);
// new Downloader().getDocs('колодцами').then(console.log);
