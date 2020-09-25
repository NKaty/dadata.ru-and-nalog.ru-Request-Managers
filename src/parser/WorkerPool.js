const { Worker } = require('worker_threads');
const { AsyncResource } = require('async_hooks');
const { EventEmitter } = require('events');
const { cpus } = require('os');

const kTaskInfo = Symbol('kTaskInfo');
const kWorkerFreedEvent = Symbol('kWorkerFreedEvent');

class WorkerPoolTaskInfo extends AsyncResource {
  constructor(callback) {
    super('WorkerPoolTaskInfo');
    this.callback = callback;
  }

  done(err, result) {
    this.runInAsyncScope(this.callback, null, err, result);
    this.emitDestroy();
  }
}

class WorkerPool extends EventEmitter {
  constructor(workerPath, dbPath, numberOfThreads) {
    super();
    this.queue = [];
    this.workers = {};
    this.activeWorkers = {};
    this.workerPath = workerPath;
    this.dbPath = dbPath;
    this.numberOfThreads = numberOfThreads || cpus().length;
    this._init();
  }

  _init() {
    if (!this.numberOfThreads || isNaN(this.numberOfThreads) || this.numberOfThreads < 1) {
      return null;
    }
    for (let i = 0; i < this.numberOfThreads; i += 1) {
      this._addNewWorker(i);
    }
    this.on(kWorkerFreedEvent, (id) => {
      if (this.queue.length) this._runWorker(id);
    });
  }

  _addNewWorker(i) {
    const worker = new Worker(this.workerPath, { workerData: { db: this.dbPath } });

    worker.on('message', (result) => {
      if (result.status === 'success') worker[kTaskInfo].done(null, result.data);
      else worker[kTaskInfo].done(result.error, null);
      worker[kTaskInfo] = null;
      this.activeWorkers[i] = false;
      this.emit(kWorkerFreedEvent, i);
    });

    worker.on('error', (err) => {
      if (worker[kTaskInfo]) worker[kTaskInfo].done(err, null);
      else this.emit('error', err);
      this._removeWorker(i);
      this._addNewWorker(i);
    });

    this.workers[i] = worker;
    this.activeWorkers[i] = false;
    this.emit(kWorkerFreedEvent, i);
  }

  _removeWorker(i) {
    this.workers[i].terminate();
    this.workers[i] = null;
  }

  getInactiveWorker() {
    for (let i = 0; i < this.numberOfThreads; i += 1) {
      if (!this.activeWorkers[i]) return i;
    }
    return -1;
  }

  _runWorker(workerId, queueItem = null) {
    if (queueItem === null) queueItem = this.queue.shift();
    const worker = this.workers[workerId];
    this.activeWorkers[workerId] = true;
    worker[kTaskInfo] = new WorkerPoolTaskInfo(queueItem.callback);
    worker.postMessage(queueItem.data);
  }

  run(data) {
    return new Promise((resolve, reject) => {
      const availableWorkerId = this.getInactiveWorker();
      const queueItem = {
        data,
        callback: (error, result) => {
          if (error) return reject(error);
          return resolve(result);
        },
      };
      if (availableWorkerId === -1) {
        this.queue.push(queueItem);
        return;
      }
      this._runWorker(availableWorkerId, queueItem);
    });
  }

  async close() {
    await Promise.allSettled(Object.values(this.workers).map((worker) => worker.terminate()));
  }
}

module.exports = WorkerPool;
