const { Worker } = require('worker_threads');

class WorkerPool {
  constructor(workerPath, numberOfThreads) {
    this.queue = [];
    this.workers = {};
    this.activeWorkers = {};
    this.workerPath = workerPath;
    this.numberOfThreads = numberOfThreads;
    this.init();
  }

  init() {
    if (!this.numberOfThreads || isNaN(this.numberOfThreads) || this.numberOfThreads < 1) {
      return null;
    }
    for (let i = 0; i < this.numberOfThreads; i += 1) {
      this.workers[i] = new Worker(this.workerPath);
      this.activeWorkers[i] = false;
    }
  }

  getInactiveWorker() {
    for (let i = 0; i < this.numberOfThreads; i += 1) {
      if (!this.activeWorkers[i]) {
        return i;
      }
    }
    return -1;
  }

  runWorker(workerId, queueItem) {
    const worker = this.workers[workerId];
    this.activeWorkers[workerId] = true;
    const resultCallback = (result) => {
      queueItem.callback(null, result);
      console.log(queueItem.data, workerId);
      cleanUp();
    };
    const errorCallback = (error) => {
      queueItem.callback(error);
      cleanUp();
    };
    const cleanUp = () => {
      worker.removeAllListeners('message');
      worker.removeAllListeners('error');
      this.activeWorkers[workerId] = false;
      if (!this.queue.length) {
        worker.unref();
        return;
      }
      this.runWorker(workerId, this.queue.shift());
    };
    worker.once('message', resultCallback);
    worker.once('error', errorCallback);
    worker.postMessage(queueItem.data);
  }

  run(data) {
    return new Promise((resolve, reject) => {
      const availableWorkerId = this.getInactiveWorker();
      const queueItem = {
        data,
        callback: (error, result) => {
          if (error) {
            return reject(error);
          }
          return resolve(result);
        },
      };
      if (availableWorkerId === -1) {
        this.queue.push(queueItem);
        return;
      }
      this.runWorker(availableWorkerId, queueItem);
    });
  }
}

module.exports = WorkerPool;
