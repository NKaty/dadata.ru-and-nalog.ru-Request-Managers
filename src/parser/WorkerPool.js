const { Worker } = require('worker_threads');
const { AsyncResource } = require('async_hooks');
const { EventEmitter } = require('events');
const { cpus } = require('os');
const { ParsingError } = require('../common/customErrors');

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

    if (!this.numberOfThreads || isNaN(this.numberOfThreads) || this.numberOfThreads < 1) {
      throw new TypeError('The number of worker threads must be a positive number');
    }

    this._init();
  }

  _init() {
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
      // If an error was caught, reject promise
      if (result instanceof Error) {
        worker[kTaskInfo].done(new ParsingError(result, worker[kTaskInfo].path), null);
        // If it is a success, resolve promise
      } else {
        worker[kTaskInfo].done(null, { data: result, path: worker[kTaskInfo].path });
      }
      worker[kTaskInfo] = null;
      this._activeWorkers[i] = false;
      // Take next task
      this.emit(kWorkerFreedEvent, i);
    });

    worker.on('error', (error) => {
      // If there is information about the task
      if (worker[kTaskInfo]) {
        // Reject promise
        worker[kTaskInfo].done(new ParsingError(error, worker[kTaskInfo].path), null);
        // No information about task
      } else {
        // Emit error
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
    if (this._workers[i]) {
      this._workers[i].terminate();
      this._workers[i] = null;
    }
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
      try {
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
      } catch (error) {
        reject(new ParsingError(error, path));
      }
    });
  }

  /**
   * @desc Cleans before finishing
   * @returns {Promise} - promise object represents void
   */
  async clean() {
    this.off(kWorkerFreedEvent, this._kWorkerFreedEventHandler);
    await Promise.allSettled(
      Object.values(this._workers).map((worker) => worker && worker.terminate())
    );
  }
}

module.exports = WorkerPool;
