// Worker to parse egrul pdf documents
// Worker is designed to work with WorkerPool class

const { parentPort } = require('worker_threads');

const Parser = require('./Parser');

const parser = new Parser();

parentPort.on('message', async (path) => {
  // As this listener is an async function, the onError listener in the main thread
  // doesn't catch errors occurred here (inside this listener).
  // So we must catch errors by ourselves
  try {
    const result = await parser.parse(path);
    // Send the data object to the main thread
    parentPort.postMessage(result);
  } catch (error) {
    // Catch an error, send it to the main thread
    parentPort.postMessage(error);
  }
});
