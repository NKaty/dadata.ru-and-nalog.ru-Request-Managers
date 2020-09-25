const { isMainThread, parentPort } = require('worker_threads');

const Parser = require('./Parser');

if (isMainThread) {
  throw new Error('It is not a worker');
}

const parser = new Parser();

parentPort.on('message', async (data) => {
  try {
    const result = await parser.parse(data);
    parentPort.postMessage({ status: 'success', data: result });
  } catch (error) {
    parentPort.postMessage({ status: 'error', error });
  }
});
