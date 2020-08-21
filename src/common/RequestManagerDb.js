const { resolve } = require('path');
const {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  mkdirSync,
  rmdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
  statSync,
} = require('fs');
const { createInterface } = require('readline');
const Database = require('better-sqlite3');
const Logger = require('./Logger');

class RequestManagerDb {
  constructor(options = {}) {
    if (new.target === RequestManagerDb)
      throw new TypeError('You cannot instantiate Graph class directly');

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
    this._successOutput = null;
    this.cleanDB = options.cleanDB || false;
    this.updateMode = options.updateMode || true;
    this.innPerFile = options.innPerFile || 500;
    this.requestsLength = options.requestsLength || 100;
    this.failureRate = options.failureRate || 0.5;
    this.requestsLengthToCheckFailureRate = options.requestsLengthToCheckFailureRate || 5;
    this.timeToWaitBeforeNextAttempt = options.timeToWaitBeforeNextAttempt || 30 * 60 * 1000;
    this._repeatedFailure = false;
    this._stop = false;
    this._isStopErrorOccurred = false;
    this._stopErrorMessage = '';
    this.db = new Database(this.dbFile);
    this.logger = new Logger(
      resolve(this._logsPath, `retryErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `validationErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `generalErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `success_${this._getDate()}.log`)
    );
    this._makeRequests = null;
    this._extractData = null;
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

    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jsons (
             inn TEXT PRIMARY KEY,
             json TEXT)`
      )
      .run();
  }

  _prepareDb() {
    this.db.prepare('DELETE FROM requests').run();
    if (this.cleanDB) this.db.prepare('DELETE FROM jsons').run();
  }

  _getDate(pretty = false) {
    const date = new Date();
    const now = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
    if (pretty) return now.substr(0, 19).split('T').join(' ');
    return now.substr(0, 23);
  }

  _cleanDir(dir) {
    const items = readdirSync(dir);
    items.forEach((item) => {
      const path = resolve(dir, item);
      const stat = statSync(path);
      if (stat.isFile()) unlinkSync(path);
      else rmdirSync(path);
    });
  }

  _cleanBeforeStart() {
    this._cleanDir(this._reportsPath);
    this._cleanDir(this._logsPath);
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
        let status = 'raw';
        if (
          !this.updateMode &&
          this.db.prepare('SELECT inn FROM jsons WHERE inn = ?').get(line) !== undefined
        )
          status = 'success';
        this.db.prepare('INSERT INTO requests (inn, status) VALUES (?, ?)').run(line, status);
      }

      renameSync(currentPath, resolve(this._inputPath, `_${file}`));
    }
  }

  _getSuccessItemInn(item) {
    throw new Error('Must be implemented for sub classes.');
  }

  _updateAfterRequest(success, validationErrors, requestErrors, stopErrors) {
    const updateStatus = this.db.prepare('UPDATE requests SET status = ? WHERE inn = ?');

    success.forEach((item) => {
      const inn = this._getSuccessItemInn(item);
      if (this.db.prepare('SELECT inn FROM jsons WHERE inn = ?').get(inn) === undefined) {
        this.db
          .prepare('INSERT INTO jsons (inn, json) VALUES (?, ?)')
          .run(inn, JSON.stringify(item));
      } else {
        this.db.prepare('UPDATE jsons SET json = ? WHERE inn = ?').run(JSON.stringify(item), inn);
      }
      updateStatus.run('success', inn);
    });

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

  _writeJSONFiles(jsonSelect, getJSON) {
    let fileCount = 1;
    let lineCount = 0;
    this._successOutput = createWriteStream(
      resolve(this._outputPath, `${this._getDate()}_${fileCount}.json`)
    );
    this._successOutput.write('[');

    for (const item of jsonSelect.iterate()) {
      if (lineCount === this.innPerFile) {
        lineCount = 0;
        this._successOutput.end('\n]\n');
        fileCount += 1;
        this._successOutput = createWriteStream(
          resolve(this._outputPath, `${this._getDate()}_${fileCount}.json`)
        );
        this._successOutput.write('[');
      }
      const json = getJSON(item);
      if (json !== undefined) {
        const items = JSON.parse(json);
        items.forEach((item, itemIndex) => {
          if (lineCount === 0 && itemIndex === 0)
            this._successOutput.write(`\n${JSON.stringify(this._extractData(item))}`);
          else this._successOutput.write(`,\n${JSON.stringify(this._extractData(item))}`);
        });
      }
      lineCount += 1;
    }

    this._successOutput.end('\n]\n');
  }

  getCurrentResult() {
    const innsSelect = this.db
      .prepare('SELECT DISTINCT inn FROM requests WHERE status = ?')
      .bind('success');
    this._writeJSONFiles(
      innsSelect,
      (item) => this.db.prepare('SELECT json FROM jsons WHERE inn = ?').get(item.inn).json
    );
  }

  _getResult() {
    if (
      !this.db
        .prepare('SELECT inn FROM requests WHERE status IN (?, ?)')
        .raw()
        .all('raw', 'retry')
        .flat().length
    )
      this.getCurrentResult();
  }

  getAllContent() {
    const jsonSelect = this.db.prepare('SELECT json FROM jsons');
    this._writeJSONFiles(jsonSelect, (item) => item.json);
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
    const streams = [this._successOutput, this._retryErrorStream, this._validationErrorStream];

    try {
      const streamPromises = streams.map((stream) => {
        if (stream) {
          stream.end();
          return new Promise((resolve) => stream.on('close', resolve));
        }
        return new Promise((resolve) => resolve());
      });

      await Promise.allSettled(streamPromises);
      await this.logger.closeStreams();
    } catch (err) {
      console.log(err);
    }
  }

  async start() {
    try {
      await this._processInput();
      await this._requests();
      this._getResult();
      this.generateReport();
      await this._cleanBeforeFinish();
    } catch (err) {
      this.logger.log('generalError', err);
      await this.generateReport();
      await this._cleanBeforeFinish();
    }
  }
}

module.exports = RequestManagerDb;
