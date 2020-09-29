const { parentPort } = require('worker_threads');

const Parser = require('./Parser');

const parser = new Parser();

parentPort.on('message', async (path) => {
  try {
    const result = await parser.parse(path);
    parentPort.postMessage({ status: 'success', data: result });
  } catch (error) {
    parentPort.postMessage({ status: 'error', error });
  }
});
