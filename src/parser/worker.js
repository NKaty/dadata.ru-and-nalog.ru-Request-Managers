const { isMainThread, parentPort } = require('worker_threads');

const Parser = require('./Parser');

if (isMainThread) {
  throw new Error('It is not a worker');
}

const parser = new Parser();

parentPort.on('message', async (path) => {
  try {
    const result = await parser.parse(path);
    parentPort.postMessage({ status: 'success', data: result, path });
  } catch (error) {
    parentPort.postMessage({ status: 'error', error, path });
  }
});
