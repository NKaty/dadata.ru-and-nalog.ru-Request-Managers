/**
 * BaseRequestManagerDb
 * Base request manager class manages multiples requests to nalog.ru website
 * or dadata.ru api by using sqlite database.
 * Uses only inn for search.
 * Inns must be given in text files, where each line is a single inn.
 * Creates a directory structure on the first run, after which it is required
 * to put the files with inns into input directory.
 * Offers reports on downloads after completion.
 */

const { resolve } = require('path');
const {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
  statSync,
} = require('fs');
const { createInterface } = require('readline');
const Database = require('better-sqlite3');
const Logger = require('./Logger');
const { getDate, cleanDir, closeStreams } = require('./helpers');

class BaseRequestManagerDb {
  /**
   * BaseRequestManagerDb class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {string} [options.inputDir='input'] - name of directory with input files
   * @param {string} [options.outputDir='output'] - name of directory with output files
   * @param {string} [options.logsDir='logs'] - name of directory with logs files
   * @param {string} [options.reportsDir='reports'] - name of directory with reports
   * @param {string} [options.dbFile='data.db'] - name of sqlite database file
   * @param {string} [options.workingDir=process.cwd()] - path to directory where
   *  all other directories and files will be created
   * @param {number} [options.requestsLength=100] - number of requests simultaneously sent and processed
   * @param {number} [options.failureRate=0.5] - failure rate of request to wait or stop
   * @param {number} [options.requestsLengthToCheckFailureRate=5] - minimum number of requests sent
   *  simultaneously to check failure rate
   * @param {number} [options.timeToWaitBeforeNextAttempt=30 * 60 * 1000] - time in milliseconds
   *  to wait for the first time failure rate is exceeded
   */
  constructor(options = {}) {
    if (new.target === BaseRequestManagerDb)
      throw new TypeError('You cannot instantiate BaseRequestManagerDb class directly');

    // Directory with files to process. File names mustn't start with _
    // Every file must be text file, where each line is a single inn
    this.inputDir = options.inputDir || 'input';
    // Output directory for pdf files and json files
    this.outputDir = options.outputDir || 'output';
    // Output directory for logs
    this.logsDir = options.logsDir || 'logs';
    // Output directory for reports
    this.reportsDir = options.reportsDir || 'reports';
    // Report with statistics on downloads
    this.reportFile = 'report.txt';
    // List of inns, on which some network error occurred and they require re-request
    this.errorsToRetryFile = 'errorsToRetry.txt';
    // List of invalid inns
    this.validationErrorsFile = 'validationErrors.txt';
    this.dbFile = options.dbFile || 'data.db';
    // Directory, where all other directories and files will be created
    this.workingDir = options.workingDir || process.cwd();
    this._inputPath = resolve(this.workingDir, this.inputDir);
    this._outputPath = resolve(this.workingDir, this.outputDir);
    this._logsPath = resolve(this.workingDir, this.logsDir);
    this._reportsPath = resolve(this.workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this._errorsToRetryPath = resolve(this._reportsPath, this.errorsToRetryFile);
    this._validationErrorsPath = resolve(this._reportsPath, this.validationErrorsFile);
    this._streams = { validationErrorStream: null, retryErrorStream: null };
    // Number of requests simultaneously sent and processed
    this.requestsLength = options.requestsLength || 100;
    // Failure rate to wait before making a next request if the failure rate was exceeded
    // for the first time or stop making requests if the failure rate is exceeded more than once
    this.failureRate = options.failureRate || 0.5;
    // Minimum number of requests sent simultaneously to check failure rate
    this.requestsLengthToCheckFailureRate = options.requestsLengthToCheckFailureRate || 5;
    // Time in milliseconds to wait before making a next request
    // if the failure rate was exceeded for the first time
    this.timeToWaitBeforeNextAttempt = options.timeToWaitBeforeNextAttempt || 30 * 60 * 1000;
    this._repeatedFailure = false;
    this._stop = false;
    this._isStopErrorOccurred = false;
    this._stopErrorMessage = '';
    // Allows to check on manager instance whether the request process has ended with request errors
    this.endedWithRetryErrors = false;
    // Allows to check on manager instance whether the request process has ended with stop error
    this.endedWithStopError = false;
    this.db = new Database(resolve(this.workingDir, this.dbFile));
    this._getDate = getDate;
    this.logger = new Logger({
      retryErrorPath: resolve(this._logsPath, `retryErrors_${this._getDate()}.log`),
      validationErrorPath: resolve(this._logsPath, `validationErrors_${this._getDate()}.log`),
      generalErrorPath: resolve(this._logsPath, `generalErrors_${this._getDate()}.log`),
      successPath: resolve(this._logsPath, `success_${this._getDate()}.log`),
      mode: 'a',
    });
    this._makeRequests = null;
    this._createDirStructure();
    this._createDb();
  }

  _createDirStructure() {
    if (!existsSync(this._inputPath)) mkdirSync(this._inputPath);
    if (!existsSync(this._outputPath)) mkdirSync(this._outputPath);
    if (!existsSync(this._logsPath)) mkdirSync(this._logsPath);
    if (!existsSync(this._reportsPath)) mkdirSync(this._reportsPath);
  }

  _createDb() {
    // Create table to keep status of requests
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS requests (
             id INTEGER PRIMARY KEY,
             inn TEXT,
             status TEXT CHECK(status IN ('raw', 'success', 'invalid', 'retry')))`
      )
      .run();
  }

  _prepareDb() {
    this.db.prepare('DELETE FROM requests').run();
  }

  _cleanBeforeStart() {
    cleanDir(this._reportsPath);
    cleanDir(this._logsPath);
  }

  _setBeforeStart() {
    this.endedWithRetryErrors = false;
    this.endedWithStopError = false;
  }

  // Makes necessary checks and insert inn into into requests table
  _insertRequest(inn) {
    throw new Error('Must be implemented for sub classes.');
  }

  // Gets inns to request into database
  async _processInput() {
    // Read input directory and select files to process
    const inputPaths = readdirSync(this._inputPath).filter((file) => {
      const stat = statSync(resolve(this._inputPath, file));
      // Select if it is a file and its name doesn't start with _
      // If a file name starts with _, it means it is was processed before
      return stat.isFile() && file[0] !== '_' && file.endsWith('.txt');
    });

    // If there are no files to process, go to make requests by inns (if there are unprocessed requests)
    if (!inputPaths.length) return;

    // Clean requests table from old requests
    this._prepareDb();
    // Clean reports and logs directory
    this._cleanBeforeStart();

    // Process each file
    for (const file of inputPaths) {
      const currentPath = resolve(this._inputPath, file);
      const rl = createInterface({
        input: createReadStream(currentPath, 'utf8'),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        // Process each line (inn) and insert into request table
        this._insertRequest(line);
      }

      // Mark each file as processed
      renameSync(currentPath, resolve(this._inputPath, `_${file}`));
    }
  }

  _getSuccessItemInn(item) {
    throw new Error('Must be implemented for sub classes.');
  }

  // Updates status of every made request
  _updateAfterRequest(success, validationErrors, requestErrors, stopErrors) {
    const updateStatus = this.db.prepare('UPDATE requests SET status = ? WHERE inn = ?');
    success.forEach((item) => updateStatus.run('success', this._getSuccessItemInn(item)));
    validationErrors.forEach((item) => updateStatus.run('invalid', item));
    requestErrors.forEach((item) => updateStatus.run('retry', item));
    stopErrors.forEach((item) => updateStatus.run('retry', item));
  }

  // Makes batch of requests by passing them to multi downloader (api multi caller) class
  async _request(queries) {
    const response = await this._makeRequests(queries);
    const [success, requestErrors, stopErrors, validationErrors] = response;
    const failureRate = requestErrors.length / (success.length + requestErrors.length);
    const failureRateExceeded =
      failureRate > this.failureRate && queries.length > this.requestsLengthToCheckFailureRate;

    this._updateAfterRequest(success, validationErrors, requestErrors, stopErrors);

    // If stop error occurs or the failure rate is exceeded again, stop
    if (stopErrors.length || (failureRate > this.failureRate && this._repeatedFailure)) {
      this._stop = true;
      this._isStopErrorOccurred = !!stopErrors.length;
      // If the failure rate is exceeded, mark it and
      // wait before making a next request in case it is a short-term issue
    } else if (failureRateExceeded && !this._repeatedFailure) {
      this._repeatedFailure = true;
      await new Promise((resolve) => setTimeout(resolve, this.timeToWaitBeforeNextAttempt));
      // Everything is ok
    } else {
      this._repeatedFailure = false;
    }
  }

  // Gets inns to request
  _getQueryArray() {
    throw new Error('Must be implemented for sub classes.');
  }

  // Splits requests into batches
  _getQueries(queryArray) {
    throw new Error('Must be implemented for sub classes.');
  }

  // Manages request process
  async _requests() {
    // Get inns to request
    const queryArray = this._getQueryArray();

    while (queryArray.length) {
      // If stop error occurred or the failure rate is exceeded again, stop
      if (this._stop) return;
      // Get a new batch of requests
      const queries = this._getQueries(queryArray);
      await this._request(queries);
    }
  }

  _collectStat() {
    const selectStatus = this.db.prepare(
      'SELECT COUNT(inn) AS count FROM requests WHERE status = ?'
    );
    return {
      requests: this.db.prepare('SELECT COUNT(inn) AS count FROM requests').get().count,
      distinctRequests: this.db.prepare('SELECT DISTINCT inn FROM requests').all().length,
      success: selectStatus.get('success').count,
      validationErrors: selectStatus.get('invalid').count,
      requestErrors: selectStatus.get('retry').count,
    };
  }

  _setErrorsState(stat) {
    this.endedWithRetryErrors = !!stat.requestErrors;
    this.endedWithStopError = this._isStopErrorOccurred;
  }

  /**
   * @desc Writes a report with statistics on downloads
   * @returns {void}
   */
  writeReport(stat) {
    const report = `Общее количество ИНН: ${stat.requests}
  из них повторяется: ${stat.requests - stat.distinctRequests}
Выполнено запросов: ${stat.success + stat.validationErrors + stat.requestErrors}
  успешных: ${stat.success}
  неудачных: ${stat.validationErrors + stat.requestErrors}
    с ошибками в теле запроса (ИНН): ${stat.validationErrors}
    с сетевыми ошибками (нужен повторный запрос): ${stat.requestErrors}
${this._isStopErrorOccurred ? this._stopErrorMessage : ''}
Отчет сформирован: ${this._getDate(true)}`;

    writeFileSync(this._mainReportPath, report);
  }

  /**
   * @desc Writes a file with a list of inns, on which some network error occurred
   * and they require re-request, and a file with a list of invalid inns
   * @returns {void}
   */
  writeErrors() {
    const selectErrors = this.db.prepare('SELECT inn FROM requests WHERE status = ?');
    const validationErrors = selectErrors.raw().all('invalid').flat();
    const retryErrors = selectErrors.raw().all('retry').flat();

    if (validationErrors.length) {
      if (!this._streams.validationErrorStream) {
        this._streams.validationErrorStream = createWriteStream(this._validationErrorsPath);
      }
      validationErrors.forEach((inn) => this._streams.validationErrorStream.write(`${inn}\n`));
      this._streams.validationErrorStream.end(`Отчет сформирован: ${this._getDate(true)}\n`);
    } else {
      if (existsSync(this._validationErrorsPath)) unlinkSync(this._validationErrorsPath);
    }

    if (retryErrors.length) {
      if (!this._streams.retryErrorStream) {
        this._streams.retryErrorStream = createWriteStream(this._errorsToRetryPath);
      }
      retryErrors.forEach((inn) => this._streams.retryErrorStream.write(`${inn}\n`));
      this._streams.retryErrorStream.end(`Отчет сформирован: ${this._getDate(true)}\n`);
    } else {
      if (existsSync(this._errorsToRetryPath)) unlinkSync(this._errorsToRetryPath);
    }
  }

  /**
   * @desc Writes a report with statistics on downloads and files with lists of inns with errors
   * @returns {void}
   */
  generateReport() {
    try {
      const stat = this._collectStat();
      this.writeReport(stat);
      this._setErrorsState(stat);
      this.writeErrors();
    } catch (err) {
      this.logger.log('generalError', err);
    }
  }

  _reset() {
    this._repeatedFailure = false;
    this._stop = false;
    this._isStopErrorOccurred = false;
    this._stopErrorMessage = '';
    Object.keys(this._streams).forEach((key) => (this._streams[key] = null));
  }

  /**
   * @desc Cleans after the request process
   * @returns {Promise} - Promise object represents void
   */
  async cleanBeforeFinish() {
    try {
      await closeStreams(Object.values(this._streams));
      await this.logger.closeStreams();
      this._reset();
    } catch (err) {
      console.log(err);
    }
  }

  async _start() {
    this._setBeforeStart();
    await this._processInput();
    await this._requests();
  }

  /**
   * @desc Launches the request process
   * @returns {Promise} - Promise object represents void
   */
  async start() {
    try {
      await this._start();
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      this.generateReport();
      await this.cleanBeforeFinish();
    }
  }
}

module.exports = BaseRequestManagerDb;
