const https = require('https');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';
const token = process.env.DADATA_API_KEY;
const queries = Array(50).fill('7707083893');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
});

const options = {
  method: 'POST',
  mode: 'cors',
  agent: httpsAgent,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Token ${token}`,
  },
};

const makeRequest = (options, query) => {
  options.body = JSON.stringify({ query });
  return fetch(url, options);
};
let count = 0;

console.time('time');
Promise.allSettled(queries.map((query) => makeRequest(options, query))).then((results) => {
  results.forEach((result) => {
    if (result.status === 'fulfilled') console.log('fulfilled', ++count);
    if (result.status === 'rejected') console.log('rejected', ++count, result.reason);
  });
  console.timeEnd('time');
});
