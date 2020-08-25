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
  constructor(options = {}) {
    if (new.target === BaseRequestManagerDb)
      throw new TypeError('You cannot instantiate BaseRequestManagerDb class directly');

    this.inputDir = options.inputDir || 'input';
    this.outputDir = options.outputDir || 'output';
    this.logsDir = options.logsDir || 'logs';
    this.reportsDir = options.reportsDir || 'reports';
    this.reportFile = 'report.txt';
    this.errorsToRetryFile = 'errorsToRetry.txt';
    this.validationErrorsFile = 'validationErrors.txt';
    this.dbFile = options.dbFile || 'data.db';
    this.workingDir = options.workingDir || process.cwd();
    this._inputPath = resolve(this.workingDir, this.inputDir);
    this._outputPath = resolve(this.workingDir, this.outputDir);
    this._logsPath = resolve(this.workingDir, this.logsDir);
    this._reportsPath = resolve(this.workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this._errorsToRetryPath = resolve(this._reportsPath, this.errorsToRetryFile);
    this._validationErrorsPath = resolve(this._reportsPath, this.validationErrorsFile);
    this._validationErrorStream = null;
    this._retryErrorStream = null;
    this._streams = [this._validationErrorStream, this._retryErrorStream];
    this.requestsLength = options.requestsLength || 100;
    this.failureRate = options.failureRate || 0.5;
    this.requestsLengthToCheckFailureRate = options.requestsLengthToCheckFailureRate || 5;
    this.timeToWaitBeforeNextAttempt = options.timeToWaitBeforeNextAttempt || 0.2 * 60 * 1000;
    this._repeatedFailure = false;
    this._stop = false;
    this._isStopErrorOccurred = false;
    this._stopErrorMessage = '';
    this.db = new Database(this.dbFile);
    this._getDate = getDate;
    this.logger = new Logger(
      resolve(this._logsPath, `retryErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `validationErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `generalErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `success_${this._getDate()}.log`)
    );
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

  _insertRequest(inn) {
    throw new Error('Must be implemented for sub classes.');
  }

  async _processInput() {
    const inputPaths = readdirSync(this._inputPath).filter((file) => {
      const stat = statSync(resolve(this._inputPath, file));
      return stat.isFile() && file[0] !== '_';
    });

    if (!inputPaths.length) return;

    this._prepareDb();
    this._cleanBeforeStart();

    for (const file of inputPaths) {
      const currentPath = resolve(this._inputPath, file);
      const rl = createInterface({
        input: createReadStream(currentPath, 'utf8'),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        this._insertRequest(line);
      }

      renameSync(currentPath, resolve(this._inputPath, `_${file}`));
    }
  }

  _getSuccessItemInn(item) {
    throw new Error('Must be implemented for sub classes.');
  }

  _updateAfterRequest(success, validationErrors, requestErrors, stopErrors) {
    const updateStatus = this.db.prepare('UPDATE requests SET status = ? WHERE inn = ?');
    success.forEach((item) => updateStatus.run('success', this._getSuccessItemInn(item)));
    validationErrors.forEach((item) => updateStatus.run('invalid', item));
    requestErrors.forEach((item) => updateStatus.run('retry', item));
    stopErrors.forEach((item) => updateStatus.run('retry', item));
  }

  async _request(queries) {
    const response = await this._makeRequests(queries);
    const success = response[0];
    const requestErrors = response[1];
    const stopErrors = response[2];
    const validationErrors = response[3];
    const failureRate = requestErrors.length / (success.length + requestErrors.length);
    const failureRateExceeded =
      failureRate > this.failureRate && queries.length > this.requestsLengthToCheckFailureRate;

    this._updateAfterRequest(success, validationErrors, requestErrors, stopErrors);

    if (stopErrors.length || (failureRate > this.failureRate && this._repeatedFailure)) {
      this._stop = true;
      this._isStopErrorOccurred = !!stopErrors.length;
    } else if (failureRateExceeded && !this._repeatedFailure) {
      this._repeatedFailure = true;
      await new Promise((resolve) => setTimeout(resolve, this.timeToWaitBeforeNextAttempt));
    } else {
      this._repeatedFailure = false;
    }
  }

  _getQueryArray() {
    throw new Error('Must be implemented for sub classes.');
  }

  _getQueries(queryArray) {
    throw new Error('Must be implemented for sub classes.');
  }

  async _requests() {
    const queryArray = this._getQueryArray();

    while (queryArray.length) {
      if (this._stop) return;
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

  writeReport() {
    const stat = this._collectStat();
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

  writeErrors() {
    const selectErrors = this.db.prepare('SELECT inn FROM requests WHERE status = ?');
    const validationErrors = selectErrors.raw().all('invalid').flat();
    const retryErrors = selectErrors.raw().all('retry').flat();

    if (validationErrors.length) {
      if (!this._validationErrorStream)
        this._validationErrorStream = createWriteStream(this._validationErrorsPath);
      validationErrors.forEach((inn) => this._validationErrorStream.write(`${inn}\n`));
      this._validationErrorStream.end(`Отчет сформирован: ${this._getDate(true)}\n`);
    } else {
      if (existsSync(this._validationErrorsPath)) unlinkSync(this._validationErrorsPath);
    }

    if (retryErrors.length) {
      if (!this._retryErrorStream)
        this._retryErrorStream = createWriteStream(this._errorsToRetryPath);
      retryErrors.forEach((inn) => this._retryErrorStream.write(`${inn}\n`));
      this._retryErrorStream.end(`Отчет сформирован: ${this._getDate(true)}\n`);
    } else {
      if (existsSync(this._errorsToRetryPath)) unlinkSync(this._errorsToRetryPath);
    }
  }

  generateReport() {
    try {
      this.writeReport();
      this.writeErrors();
    } catch (err) {
      this.logger.log('generalError', err);
    }
  }

  async _cleanBeforeFinish() {
    try {
      await closeStreams(this._streams);
      await this.logger.closeStreams();
    } catch (err) {
      console.log(err);
    }
  }

  async start() {
    try {
      await this._processInput();
      await this._requests();
      this.generateReport();
      await this._cleanBeforeFinish();
    } catch (err) {
      this.logger.log('generalError', err);
      await this.generateReport();
      await this._cleanBeforeFinish();
    }
  }
}

module.exports = BaseRequestManagerDb;
