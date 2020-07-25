const { createWriteStream } = require('fs');
const util = require('util');
const { pipeline } = require('stream');
const { Agent } = require('https');
const Path = require('path');
const fetch = require('node-fetch');
const throttle = require('promise-ratelimit')(5000);

const httpsAgent = new Agent({
  keepAlive: true,
  maxSockets: 1,
});

const streamPipeline = util.promisify(pipeline);

const url = 'https://egrul.nalog.ru/';

const sendForm = async (query, page = '') => {
  const params = new URLSearchParams();
  params.append('vyp3CaptchaToken', '');
  params.append('page', `${page}`);
  params.append('query', `${query}`);
  params.append('region', '');
  params.append('PreventChromeAutocomplete', '');
  try {
    const response = await fetch(url, {
      method: 'POST',
      agent: httpsAgent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const json = await response.json();
    return json.t;
  } catch (err) {
    console.log(err);
  }
};

const getSearchResult = async (query, token, page = '') => {
  try {
    const response = await fetch(
      `${url}search-result/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
      { agent: httpsAgent }
    );
    const json = await response.json();
    let docs = json.rows;
    if (page === '' || page === '1') {
      const pages = Math.ceil(docs[0].cnt / docs.length);
      if (pages > 1) {
        const results = await Promise.allSettled(
          Array(pages - 1)
            .fill()
            .map((e, i) => i + 2)
            .map((page) => getPage(query, page))
        );
        docs = [
          ...docs,
          ...results.map((res) => {
            if (res.status === 'fulfilled') {
              return res.value;
            } else console.log(query, res.reason);
          }),
        ].flat(2);
      }
    }
    return docs;
  } catch (err) {
    console.log(err);
  }
};

const getPage = async (query, page) => {
  await throttle();
  const token = await sendForm(query, page);
  return await getSearchResult(query, token, page);
};

const requestFile = async (doc) => {
  try {
    await throttle();
    const response = await fetch(`${url}vyp-request/${doc.t}?r=&_=${new Date().getTime()}`, {
      agent: httpsAgent,
    });
    const json = await response.json();
    await waitForResponse(json.t, doc.i);
  } catch (err) {
    console.log(doc.i, err);
  }
};

const waitForResponse = async (token, inn) => {
  try {
    const response = await fetch(
      `${url}vyp-status/${token}?r=${new Date().getTime()}&_=${new Date().getTime()}`,
      { agent: httpsAgent }
    );
    const json = await response.json();
    if (json.status === 'ready') await downloadFile(token, inn);
    else setTimeout(async () => await waitForResponse(token, inn), 1000);
  } catch (err) {
    console.log(inn, err);
  }
};

const downloadFile = async (token, inn) => {
  try {
    const response = await fetch(`${url}vyp-download/${token}`, { agent: httpsAgent });
    const path = Path.resolve(__dirname, `../docs/${inn}.pdf`);
    const writable = createWriteStream(path);
    await streamPipeline(response.body, writable);
  } catch (err) {
    console.log(inn, err);
  }
};

async function getInfo(query) {
  try {
    await throttle();
    const token = await sendForm(query);
    const results = await getSearchResult(query, token);
    await Promise.allSettled(results.map((result) => requestFile(result)));
  } catch (err) {
    console.log(err);
  }
}

getInfo('компот');
