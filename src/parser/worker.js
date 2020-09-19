const { isMainThread, parentPort } = require('worker_threads');
const { resolve } = require('path');

const Parser = require('./Parser');

if (isMainThread) {
  throw new Error('It is not a worker');
}

const parser = new Parser();

parentPort.on('message', async (data) => {
  const result = await parser.parse(resolve(__dirname, data));
  parentPort.postMessage(result);
});
