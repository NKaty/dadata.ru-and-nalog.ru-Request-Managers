const { createWriteStream } = require('fs');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { Agent } = require('https');
const { resolve } = require('path');
const fetch = require('node-fetch');
const ratelimit = require('promise-ratelimit');

const streamPipeline = promisify(pipeline);

class Downloader {
  constructor(options = {}) {
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 1,
      });
    this.throttle = ratelimit(options.pause || 2000);
    this.url = 'https://egrul.nalog.ru/';
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
    } catch (err) {
      console.log(query, region, page, err);
      return false;
    }
    if (json && (json.captchaRequired || json.ERRORS)) {
      console.log(query, region, page, 'The captcha is required.');
      return false;
    }
    return json.t;
  }

  async _getSearchResult(query, region, token, page = '') {
    let json;
    try {
      const response = await fetch(
        `${this.url}search-result/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
        { agent: this.httpsAgent }
      );
      json = await response.json();
    } catch (err) {
      console.log(query, region, page, err);
      return false;
    }
    if (json && (json.captchaRequired || json.ERRORS)) {
      console.log(query, region, page, 'The captcha is required.');
      return false;
    }
    try {
      if (json.status === 'wait') {
        console.log(json);
        return new Promise((resolve) =>
          setTimeout(async () => {
            try {
              const results = await this._getSearchResult(query, region, token, page);
              resolve(results);
            } catch (err) {
              console.log(query, region, page, err);
              resolve(false);
            }
          }, 1000)
        );
      } else {
        let docs = json.rows;
        if (page === '' || page === '1') {
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
              ...results.map((res) => {
                if (res.status === 'fulfilled') {
                  return res.value;
                } else console.log(res.reason);
              }),
            ].flat();
          }
        }
        return docs;
      }
    } catch (err) {
      console.log(query, region, page, err);
      return false;
    }
  }

  async _getPage(query, region, page) {
    await this.throttle();
    const token = await this._sendForm(query, region, page);
    if (!token) throw Error(`query: ${query}, region: ${region}, page: ${page}, No token!`);
    const results = await this._getSearchResult(query, region, token, page);
    if (!results) throw Error(`query: ${query}, region: ${region}, page: ${page}, No documents!`);
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
        throw Error('The captcha is required.');
      }
      await this._waitForResponse(json.t, doc.i);
    } catch (err) {
      console.log(doc.i, err);
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
        throw Error('The captcha is required.');
      }
      if (json.status === 'ready') await this._downloadFile(token, inn);
      else setTimeout(async () => await this._waitForResponse(token, inn), 1000);
    } catch (err) {
      console.log(inn, err);
      throw err;
    }
  }

  async _downloadFile(token, inn) {
    try {
      const response = await fetch(`${this.url}vyp-download/${token}`, { agent: this.httpsAgent });
      const path = resolve(__dirname, `../../docs/${inn}.pdf`);
      const writable = createWriteStream(path);
      await streamPipeline(response.body, writable);
    } catch (err) {
      console.log(inn, err);
    }
  }

  _getRequestParams(params) {
    if (typeof params === 'string') return [params, ''];
    else return [params.query, params.region];
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
      console.log(err);
    }
  }
}

module.exports = Downloader;
