const { Worker } = require('worker_threads');
const { AsyncResource } = require('async_hooks');
const { EventEmitter } = require('events');
const { cpus } = require('os');

const kTaskInfo = Symbol('kTaskInfo');
const kWorkerFreedEvent = Symbol('kWorkerFreedEvent');

class WorkerPoolTaskInfo extends AsyncResource {
  constructor(callback, path) {
    super('WorkerPoolTaskInfo');
    this.callback = callback;
    this.path = path;
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
    this.numberOfThreads = numberOfThreads || cpus().length;
    this._init();
  }

  _kWorkerFreedEventHandler(id) {
    if (this.queue.length) this._runWorker(id);
  }

  _init() {
    if (!this.numberOfThreads || isNaN(this.numberOfThreads) || this.numberOfThreads < 1) {
      return null;
    }
    for (let i = 0; i < this.numberOfThreads; i += 1) {
      this._addNewWorker(i);
    }
    this.on(kWorkerFreedEvent, this._kWorkerFreedEventHandler);
  }

  _addNewWorker(i) {
    const worker = new Worker(this.workerPath);

    worker.on('message', (result) => {
      const data = { ...result, path: worker[kTaskInfo].path };
      if (result.status === 'success') worker[kTaskInfo].done(null, data);
      else worker[kTaskInfo].done(data, null);
      worker[kTaskInfo] = null;
      this.activeWorkers[i] = false;
      this.emit(kWorkerFreedEvent, i);
    });

    worker.on('error', (error) => {
      if (worker[kTaskInfo]) {
        const data = { status: 'error', error, path: worker[kTaskInfo].path };
        worker[kTaskInfo].done(data, null);
      } else {
        this.emit('error', error);
      }
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
    worker[kTaskInfo] = new WorkerPoolTaskInfo(queueItem.callback, queueItem.path);
    worker.postMessage(queueItem.path);
  }

  run(path) {
    return new Promise((resolve, reject) => {
      const availableWorkerId = this.getInactiveWorker();
      const queueItem = {
        path,
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

  async clean() {
    this.off(kWorkerFreedEvent, this._kWorkerFreedEventHandler);
    await Promise.allSettled(Object.values(this.workers).map((worker) => worker.terminate()));
  }
}

module.exports = WorkerPool;
