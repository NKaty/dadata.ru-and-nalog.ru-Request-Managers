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
  readFileSync,
  writeFileSync,
  copyFileSync,
  appendFileSync,
  statSync,
} = require('fs');
const { createInterface } = require('readline');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('./Logger');

class Manager {
  constructor(workingDir = process.cwd()) {
    this.tempDir = 'temp';
    this.tempInputDir = 'input';
    this.tempErrorsDir = 'errors';
    this.inputDir = 'input';
    this.outputDir = 'output';
    this.logsDir = 'logs';
    this.reportsDir = 'reports';
    this.tempErrorsFile = 'errors.txt';
    this.reportFile = 'report.txt';
    this.statFile = 'stat.json';
    this.errorsToRetryFile = 'errorsToRetry.txt';
    this.validationErrorsFile = 'validationErrors.txt';
    this._workingDir = workingDir;
    this._tempPath = resolve(this._workingDir, this.tempDir);
    this._tempInputPath = resolve(this._tempPath, this.tempInputDir);
    this._tempErrorsPath = resolve(this._tempPath, this.tempErrorsDir);
    this._mainTempErrorsPath = resolve(this._tempErrorsPath, this.tempErrorsFile);
    this._inputPath = resolve(this._workingDir, this.inputDir);
    this._outputPath = resolve(this._workingDir, this.outputDir);
    this._logsPath = resolve(this._workingDir, this.logsDir);
    this._reportsPath = resolve(this._workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this._mainStatPath = resolve(this._reportsPath, this.statFile);
    this._mainErrorsToRetryPath = resolve(this._reportsPath, this.errorsToRetryFile);
    this._mainValidationErrorsPath = resolve(this._reportsPath, this.validationErrorsFile);
    this._tempErrorStream = null;
    this._validationErrorStream = null;
    this._tempInputStream = null;
    this._successOutput = null;
    this.withBranches = false;
    this.branchesCount = 20;
    this.requestsPerDay = 8000;
    this.innPerFile = 500;
    this.filesPerDay = Math.floor(this.requestsPerDay / this.innPerFile);
    this.requestsLength = 100;
    this.failureRate = 0.5;
    this.requestsLengthToCheckFailureRate = 5;
    this.timeToWaitBeforeNextAttempt = 30 * 60 * 1000;
    this._repeatedFailure = false;
    this._stop = false;
    this._isStopErrorOccurred = false;
    this._firstJSON = true;
    this._newCycle = false;
    this._totalRequestNumber = 0;
    this._currentRequestNumber = 0;
    this._successNumber = 0;
    this._validationErrorsNumber = 0;
    this._retryErrorsNumber = 0;
    this.logger = new Logger(
      resolve(this._logsPath, `retryErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `validationErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `generalErrors_${this._getDate()}.log`),
      resolve(this._logsPath, `success_${this._getDate()}.log`)
    );
    this.apiMultiCaller = new APIMultiCaller({ logger: this.logger });
    this._createDirStructure();
  }

  _createDirStructure() {
    if (!existsSync(this._tempPath)) mkdirSync(this._tempPath);
    if (!existsSync(this._tempInputPath)) mkdirSync(this._tempInputPath);
    if (!existsSync(this._tempErrorsPath)) mkdirSync(this._tempErrorsPath);
    if (!existsSync(this._inputPath)) mkdirSync(this._inputPath);
    if (!existsSync(this._outputPath)) mkdirSync(this._outputPath);
    if (!existsSync(this._logsPath)) mkdirSync(this._logsPath);
    if (!existsSync(this._reportsPath)) mkdirSync(this._reportsPath);
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
    if (existsSync(this._mainStatPath)) unlinkSync(this._mainStatPath);
    if (existsSync(this._mainValidationErrorsPath)) unlinkSync(this._mainValidationErrorsPath);
    if (existsSync(this._mainTempErrorsPath)) unlinkSync(this._mainTempErrorsPath);

    this._cleanDir(this._logsPath);
    this._cleanDir(this._tempInputPath);
  }

  async _processInput(checkingErrors) {
    let currentPaths;
    let currentDir;
    if (!checkingErrors) {
      currentDir = this._inputPath;
      currentPaths = readdirSync(currentDir).filter((file) => {
        const stat = statSync(resolve(currentDir, file));
        return stat.isFile() && file[0] !== '_';
      });
      if (!currentPaths.length) return;
      this._cleanBeforeStart();
    } else {
      currentDir = this._tempErrorsPath;
      currentPaths = readdirSync(currentDir);
      if (!currentPaths.length) return;
      this._newCycle = true;
    }

    let lineCount = 0;
    let fileCount = 1;

    this._tempInputStream = createWriteStream(
      resolve(this._tempInputPath, `${this._getDate()}_${fileCount}.txt`)
    );

    for (const file of currentPaths) {
      const currentPath = resolve(currentDir, file);
      const rl = createInterface({
        input: createReadStream(currentPath, 'utf8'),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        this._totalRequestNumber += 1;
        if (lineCount === this.innPerFile) {
          lineCount = 0;
          this._tempInputStream.end();
          fileCount += 1;
          this._tempInputStream = createWriteStream(
            resolve(this._tempInputPath, `${this._getDate()}_${fileCount}.txt`)
          );
        }
        this._tempInputStream.write(`${line}\n`);
        lineCount += 1;
      }

      if (checkingErrors) unlinkSync(currentPath);
      else renameSync(currentPath, resolve(currentDir, `_${file}`));
    }

    this._tempInputStream.end();
  }

  async _getQueriesArray(currentPath) {
    const queries = [[]];

    const rl = createInterface({
      input: createReadStream(currentPath, 'utf8'),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const [inn, kpp] = line.split(' ');
      let query;
      if (kpp) query = { query: inn, kpp };
      else
        query = this.withBranches
          ? { query: line, count: this.branchesCount }
          : { query: line, branch_type: 'MAIN' };
      if (queries[queries.length - 1].length === this.requestsLength) queries.push([query]);
      else queries[queries.length - 1].push(query);
    }

    return queries;
  }

  _getJson(response) {
    const data = response.data;
    return JSON.stringify({
      full_name: data.name.full_with_opf,
      short_name: data.name.short_with_opf,
      inn: data.inn,
      kpp: data.kpp,
      ogrn: data.ogrn,
      ogrn_date: data.ogrn_date,
      type: data.type,
      okpo: data.okpo,
      address: data.address.data.source,
      management: {
        post: data.management && data.management.post,
        name: data.management && data.management.name,
      },
      status: data.state && data.state.status,
    });
  }

  _processResponse(response) {
    const json = this._getJson(response);
    if (this._firstJSON) {
      this._successOutput.write(`\n${json}`);
      this._firstJSON = false;
    } else {
      this._successOutput.write(`,\n${json}`);
    }
  }

  async _request(currentPath) {
    this._firstJSON = true;
    const queriesArray = await this._getQueriesArray(currentPath);
    const outputFileName = `${this._getDate()}.json`;
    this._successOutput = createWriteStream(resolve(this._outputPath, outputFileName));
    const successInn = [];
    let requestFailure = [];
    let validationFailure = [];
    let currentRequestNumber = 0;
    let successNumber = 0;
    let retryErrorsNumber = 0;
    let validationErrorsNumber = 0;

    this._successOutput.write('[');

    for (const arr of queriesArray) {
      const response = await this.apiMultiCaller.makeRequests(arr);
      const success = response[0];
      const stopErrors = response[2];
      requestFailure = [...requestFailure, ...response[1]];
      validationFailure = [...validationFailure, ...response[3]];
      const failureRate = response[1].length / (success.length + response[1].length);
      const failureRateExceeded =
        failureRate > this.failureRate && arr.length > this.requestsLengthToCheckFailureRate;

      if (stopErrors.length || (failureRate > this.failureRate && this._repeatedFailure)) {
        this._stop = true;
        this._isStopErrorOccurred = !!stopErrors.length;
        if (this._successOutput) {
          this._successOutput.end();
          await new Promise((resolve) => this._successOutput.on('close', resolve));
          existsSync(resolve(this._outputPath, outputFileName)) &&
            unlinkSync(resolve(this._outputPath, outputFileName));
          const errorMessage = stopErrors.length
            ? `Due to StopError the script was stopped, ${outputFileName} was removed.`
            : `The maximum failure rate was exceeded. The script was stopped. ${outputFileName} was removed.`;
          this.logger.log('retryError', errorMessage);
        }
        return;
      }

      currentRequestNumber += arr.length;
      successNumber += success.length;
      retryErrorsNumber += response[1].length;
      validationErrorsNumber += response[3].length;

      success.flat().forEach((item) => {
        successInn.push(item.data.inn);
        this._processResponse(item);
      });

      if (failureRateExceeded && !this._repeatedFailure) {
        this._repeatedFailure = true;
        await new Promise((resolve) => setTimeout(resolve, this.timeToWaitBeforeNextAttempt));
      } else {
        this._repeatedFailure = false;
      }
    }

    this._successOutput.end('\n]\n');

    this._currentRequestNumber += currentRequestNumber;
    this._successNumber += successNumber;
    this._retryErrorsNumber += retryErrorsNumber;
    this._validationErrorsNumber += validationErrorsNumber;

    if (successInn.length)
      successInn.forEach((inn) => this.logger.log('success', `${inn} Data is received.`));

    if (requestFailure.length && !this._tempErrorStream)
      this._tempErrorStream = createWriteStream(this._mainTempErrorsPath, { flags: 'a' });
    requestFailure.forEach((item) => this._tempErrorStream.write(`${item}\n`));

    if (validationFailure.length && !this._validationErrorStream)
      this._validationErrorStream = createWriteStream(this._mainValidationErrorsPath, {
        flags: 'a',
      });
    validationFailure.forEach((item) => this._validationErrorStream.write(`${item}\n`));

    existsSync(currentPath) && unlinkSync(currentPath);
  }

  async _requests(currentFiles) {
    for (const file of currentFiles) {
      if (this._stop) break;
      await this._request(resolve(this._tempInputPath, file));
    }

    if (this._tempErrorStream) {
      this._tempErrorStream.end();
      await new Promise((resolve) => this._tempErrorStream.on('close', resolve));
    }
  }

  _getCurrentFiles() {
    return readdirSync(this._tempInputPath).slice(0, this.filesPerDay);
  }

  _updateStat() {
    let stat = existsSync(this._mainStatPath)
      ? JSON.parse(readFileSync(this._mainStatPath, 'utf8'))
      : null;
    const requestInfo = {
      requests: this._currentRequestNumber,
      success: this._successNumber,
      validationErrors: this._validationErrorsNumber,
      retryErrors: this._retryErrorsNumber,
    };

    if (!stat) {
      stat = {
        totalRequestNumber: this._totalRequestNumber,
        requestDays: [requestInfo],
        retryErrorsDays: [],
      };
    } else {
      if (this._newCycle || stat.retryErrorsDays.length) {
        stat.retryErrorsDays.push(requestInfo);
      } else {
        stat.requestDays.push(requestInfo);
      }
    }

    writeFileSync(this._mainStatPath, JSON.stringify(stat, null, 4));

    return stat;
  }

  _processStat(stat) {
    const requestInfo = {
      requests: 0,
      success: 0,
      validationErrors: 0,
      retryErrors: 0,
    };

    stat.requestDays.forEach((item) => {
      Object.keys(requestInfo).forEach((key) => (requestInfo[key] += item[key]));
    });
    stat.retryErrorsDays.forEach((item) => {
      requestInfo.success += item.success;
      requestInfo.validationErrors += item.validationErrors;
      requestInfo.retryErrors -= item.success + item.validationErrors;
    });

    return requestInfo;
  }

  _writeReport(stat) {
    const requestInfo = this._processStat(stat);
    const report = `Общее количество ИНН: ${stat.totalRequestNumber}
Выполнено запросов: ${requestInfo.requests}
  успешных: ${requestInfo.success}
  неудачных: ${requestInfo.validationErrors + requestInfo.retryErrors}
    с ошибками в теле запроса (ИНН): ${requestInfo.validationErrors}
    с сетевыми ошибками (будет повторный запрос): ${requestInfo.retryErrors}
${
  this._isStopErrorOccurred
    ? 'Внимание. Рекомендуется проверить лимиты на количество запросов в день, секунду и на количество новых соединений в минуту.'
    : ''
}
Отчет сформирован: ${this._getDate(true)}`;

    writeFileSync(this._mainReportPath, report);
  }

  _writeErrorsToRetry() {
    if (existsSync(this._mainTempErrorsPath)) {
      copyFileSync(this._mainTempErrorsPath, this._mainErrorsToRetryPath);
      appendFileSync(this._mainErrorsToRetryPath, `Отчет сформирован: ${this._getDate(true)}`);
    } else {
      existsSync(this._mainErrorsToRetryPath) && unlinkSync(this._mainErrorsToRetryPath);
    }
  }

  async _writeDateToValidationErrors() {
    if (this._validationErrorStream) {
      this._validationErrorStream.end(`Отчет сформирован: ${this._getDate(true)}\n\n`);
      await new Promise((resolve) => this._validationErrorStream.on('close', resolve));
    }
  }

  async _generateReport() {
    try {
      const stat = this._updateStat();
      this._writeReport(stat);
      this._writeErrorsToRetry();
      await this._writeDateToValidationErrors();
    } catch (err) {
      this.logger.log('generalError', err);
    }
  }

  async _cleanBeforeFinish() {
    const streams = [
      this._tempInputStream,
      this._successOutput,
      this._tempErrorStream,
      this._validationErrorStream,
    ];

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

  async start(checkingErrors = false) {
    try {
      await this._processInput(checkingErrors);
      const currentFiles = this._getCurrentFiles();
      if (currentFiles.length) {
        await this._requests(currentFiles);
        await this._generateReport();
        await this._cleanBeforeFinish();
      } else if (existsSync(this._mainTempErrorsPath)) await this.start(true);
    } catch (err) {
      this.logger.log('generalError', err);
      await this._generateReport();
      await this._cleanBeforeFinish();
    }
  }
}

module.exports = Manager;
