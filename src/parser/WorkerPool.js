const { Worker } = require('worker_threads');
const { AsyncResource } = require('async_hooks');
const { EventEmitter } = require('events');
const { cpus } = require('os');

const kTaskInfo = Symbol('kTaskInfo');
const kWorkerFreedEvent = Symbol('kWorkerFreedEvent');

// Associates the task with the received result
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

/**
 * WorkerPool
 * WorkerPool class provides a worker thread pool
 */
class WorkerPool extends EventEmitter {
  /**
   * WorkerPool class
   * @constructor
   * @param {string} workerPath - file path to worker implementation
   * @param {number} [numberOfThreads=os.cpus().length] - number of worker threads
   */
  constructor(workerPath, numberOfThreads = cpus().length) {
    super();
    this._queue = [];
    this._workers = {};
    this._activeWorkers = {};
    this.workerPath = workerPath;
    this.numberOfThreads = numberOfThreads;
    this._init();
  }

  _init() {
    if (!this.numberOfThreads || isNaN(this.numberOfThreads) || this.numberOfThreads < 1) {
      return null;
    }

    this.on(kWorkerFreedEvent, this._kWorkerFreedEventHandler);

    for (let i = 0; i < this.numberOfThreads; i += 1) {
      this._addNewWorker(i);
    }
  }

  _kWorkerFreedEventHandler(id) {
    if (this._queue.length) this._runWorker(id);
  }

  _addNewWorker(i) {
    const worker = new Worker(this.workerPath);

    // As the onMessage listener in the worker thread is an async function,
    // the errors occurred there will not be caught in the onError listener
    // in the main thread. So we are catching errors in the onMessage listener
    // in the worker thread by ourselves and sending them to the main thread.
    // Therefore the result object can contain either data or error information.
    worker.on('message', (result) => {
      // Add path to the result object
      const data = { ...result, path: worker[kTaskInfo].path };
      // If it is a success, resolve promise
      if (result.status === 'success') worker[kTaskInfo].done(null, data);
      // If an error was caught, reject promise
      else worker[kTaskInfo].done(data, null);
      worker[kTaskInfo] = null;
      this._activeWorkers[i] = false;
      // Take next task
      this.emit(kWorkerFreedEvent, i);
    });

    worker.on('error', (error) => {
      // If there is information about the task
      if (worker[kTaskInfo]) {
        // Create an object similar to a result object from the onMessage listener
        const data = { status: 'error', error, path: worker[kTaskInfo].path };
        // Reject promise
        worker[kTaskInfo].done(data, null);
        // No information about task
      } else {
        // Just emit error
        this.emit('error', error);
      }
      // Maintain the number of worker threads
      this._removeWorker(i);
      this._addNewWorker(i);
    });

    this._workers[i] = worker;
    this._activeWorkers[i] = false;
    // Take a task
    this.emit(kWorkerFreedEvent, i);
  }

  _removeWorker(i) {
    this._workers[i].terminate();
    this._workers[i] = null;
  }

  _getInactiveWorker() {
    // If the queue is not empty, there are no available worker threads
    if (this._queue.length) return -1;

    for (let i = 0; i < this.numberOfThreads; i += 1) {
      if (!this._activeWorkers[i]) return i;
    }
    return -1;
  }

  _runWorker(workerId, task = null) {
    // kWorkerFreedEvent has occurred
    if (task === null) task = this._queue.shift();
    // There are no tasks in the queue
    if (!task) return;
    const worker = this._workers[workerId];
    this._activeWorkers[workerId] = true;
    worker[kTaskInfo] = new WorkerPoolTaskInfo(task.callback, task.path);
    worker.postMessage(task.path);
  }

  /**
   * @desc Executes the task
   * @param {string} path - path to a pdf file
   * @returns {Promise} - promise object represents a data object received
   *  from a worker thread after the task was done
   */
  run(path) {
    return new Promise((resolve, reject) => {
      const availableWorkerId = this._getInactiveWorker();
      // Create a task
      const task = {
        path,
        callback: (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      };
      // There are no available worker threads
      // Add the task to the queue
      if (availableWorkerId === -1) {
        this._queue.push(task);
        return;
      }
      // Otherwise execute the task
      this._runWorker(availableWorkerId, task);
    });
  }

  /**
   * @desc Cleans before finishing
   * @returns {Promise} - promise object represents void
   */
  async clean() {
    this.off(kWorkerFreedEvent, this._kWorkerFreedEventHandler);
    await Promise.allSettled(Object.values(this._workers).map((worker) => worker.terminate()));
  }
}

module.exports = WorkerPool;
