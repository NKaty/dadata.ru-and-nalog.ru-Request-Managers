const { createWriteStream } = require('fs');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { Agent } = require('https');
const { resolve } = require('path');
const fetch = require('node-fetch');
const throttle = require('promise-ratelimit')(1000);

const httpsAgent = new Agent({
  keepAlive: true,
  maxSockets: 1,
});

const streamPipeline = promisify(pipeline);

const queries = [
  '1659096539',
  '5043052387',
  '7804671668',
  '7724322990',
  '3808202740',
  '1650391240',
];

const url = 'https://egrul.nalog.ru/';

const sendForm = async (query, region, page = '') => {
  const params = new URLSearchParams();
  params.append('vyp3CaptchaToken', '');
  params.append('page', `${page}`);
  params.append('query', `${query}`);
  params.append('region', `${region}`);
  params.append('PreventChromeAutocomplete', '');
  let json;

  try {
    const response = await fetch(url, {
      method: 'POST',
      agent: httpsAgent,
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
};

const getSearchResult = async (query, region, token, page = '') => {
  let json;
  try {
    const response = await fetch(
      `${url}search-result/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
      { agent: httpsAgent }
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
    let docs = json.rows;
    if (page === '' || page === '1') {
      const pages = Math.ceil(docs[0].cnt / docs.length);
      if (pages > 1) {
        const results = await Promise.allSettled(
          Array(pages - 1)
            .fill()
            .map((e, i) => i + 2)
            .map((page) => getPage(query, region, page))
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
  } catch (err) {
    console.log(query, region, page, err);
    return false;
  }
};

const getPage = async (query, region, page) => {
  await throttle();
  const token = await sendForm(query, region, page);
  if (!token) throw Error(`query: ${query}, region: ${region}, page: ${page}, No token!`);
  const results = getSearchResult(query, region, token, page);
  if (!results) throw Error(`query: ${query}, region: ${region}, page: ${page}, No documents!`);
  return results;
};

const requestFile = async (doc) => {
  try {
    await throttle();
    const response = await fetch(`${url}vyp-request/${doc.t}?r=&_=${new Date().getTime()}`, {
      agent: httpsAgent,
    });
    const json = await response.json();
    if (json && (json.captchaRequired || json.ERRORS)) {
      throw Error('The captcha is required.');
    }
    await waitForResponse(json.t, doc.i);
  } catch (err) {
    console.log(doc.i, err);
    throw err;
  }
};

const waitForResponse = async (token, inn) => {
  try {
    const response = await fetch(
      `${url}vyp-status/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
      { agent: httpsAgent }
    );
    const json = await response.json();
    if (json && (json.captchaRequired || json.ERRORS)) {
      throw Error('The captcha is required.');
    }
    if (json.status === 'ready') await downloadFile(token, inn);
    else setTimeout(async () => await waitForResponse(token, inn), 1000);
  } catch (err) {
    console.log(inn, err);
    throw err;
  }
};

const downloadFile = async (token, inn) => {
  try {
    const response = await fetch(`${url}vyp-download/${token}`, { agent: httpsAgent });
    const path = resolve(__dirname, `../docs/${inn}.pdf`);
    const writable = createWriteStream(path);
    await streamPipeline(response.body, writable);
  } catch (err) {
    console.log(inn, err);
  }
};

const getDoc = async (params) => {
  let query, region;
  if (typeof params === 'string') {
    query = params;
    region = '';
  } else {
    query = params.query;
    region = params.region;
  }

  try {
    await throttle();
    const token = await sendForm(query, region);
    if (!token) return;
    const results = await getSearchResult(query, region, token);
    if (!results) return;
    await Promise.allSettled(results.map((result) => requestFile(result)));
  } catch (err) {
    console.log(err);
  }
};

const getDocs = async (queries) => {
  await Promise.allSettled(queries.map((query) => getDoc(query)));
};

if (module.parent) {
  module.exports = getDocs;
} else {
  getDocs(queries).catch(console.log);
}
