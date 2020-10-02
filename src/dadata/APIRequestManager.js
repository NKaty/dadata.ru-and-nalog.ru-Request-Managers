/**
 * APIRequestManager
 * API request manager class manages multiples requests to dadata.ru api.
 * Uses inn for search or inn and kpp for searching a certain branch.
 * Inns must be given in text files, where each line is a single inn or
 * an inn and kpp separated by a space.
 * Creates a directory structure on the first run, after which it is required
 * to put the files with inns into input directory.
 * Offers reports on requests after completion.
 * Writes json data to output files.
 * Due to the limitation of the number of requests per day for free,
 * it may take several days to restart the script depending on the total number of requests.
 * If network errors occurred during execution and there is errorsToRetry.txt in reports directory,
 * it is required to restart the script to repeat these requests when network problems are fixed.
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
  readFileSync,
  writeFileSync,
  copyFileSync,
  appendFileSync,
  statSync,
} = require('fs');
const { createInterface } = require('readline');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('../common/Logger');
const extractData = require('./extractData');
const { getDate, cleanDir, closeStreams } = require('../common/helpers');

class APIRequestManager {
  /**
   * APIRequestManager class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {string} [options.inputDir='input'] - name of directory with input files
   * @param {string} [options.outputDir='output'] - name of directory with output files
   * @param {string} [options.logsDir='logs'] - name of directory with logs files
   * @param {string} [options.reportsDir='reports'] - name of directory with reports
   * @param {string} [options.tempDir='temp'] - name of directory with with temporary files
   *  required for the process to run
   * @param {string} [options.workingDir=process.cwd()] - path to directory where
   *  all other directories and files will be created
   * @param {number} [options.requestsPerDay=8000] - number of requests per day
   * @param {boolean} [options.withBranches=false] - also get information for branches or not
   * @param {number} [options.branchesCount=20] - how many branches to get information for
   * @param {number} [options.innPerFile=500] - number of inns per prepared file for requesting
   *  and number of json objects per output file
   * @param {number} [options.requestsLength=100] - number of requests simultaneously sent and processed
   * @param {number} [options.failureRate=0.5] - failure rate of request to wait or stop
   * @param {number} [options.requestsLengthToCheckFailureRate=5] - minimum number of requests sent
   *  simultaneously to check failure rate
   * @param {number} [options.timeToWaitBeforeNextAttempt=30 * 60 * 1000] - time in milliseconds
   *  to wait for the first time failure rate is exceeded
   */
  constructor(options = {}) {
    // Directory with files to process. File names mustn't start with _
    // Every file must be text file, where each line is a single inn
    // or an inn and kpp separated by a space
    this.inputDir = options.inputDir || 'input';
    // Output directory for json files with data
    this.outputDir = options.outputDir || 'output';
    // Output directory for logs
    this.logsDir = options.logsDir || 'logs';
    // Output directory for reports
    this.reportsDir = options.reportsDir || 'reports';
    // Directory with temporary files required for the process to run
    // When all the inns and errors to retry are processed, the directory will be empty
    this.tempDir = options.tempDir || 'temp';
    // Directory with temporary files prepared for requesting
    this.tempInputDir = 'input';
    // Directory with a file of inns requiring re-request
    this.tempErrorsDir = 'errors';
    // Auxiliary file with inns requiring re-request
    this.tempErrorsFile = 'errors.txt';
    // Report with statistics on requests
    this.reportFile = 'report.txt';
    // Auxiliary file for keeping statistics
    this.statFile = 'stat.json';
    // List of inns, on which some network error occurred and they require re-request
    this.errorsToRetryFile = 'errorsToRetry.txt';
    // List of invalid inns
    this.validationErrorsFile = 'validationErrors.txt';
    // Directory, where all other directories and files will be created
    this.workingDir = options.workingDir || process.cwd();
    this._tempPath = resolve(this.workingDir, this.tempDir);
    this._tempInputPath = resolve(this._tempPath, this.tempInputDir);
    this._tempErrorsPath = resolve(this._tempPath, this.tempErrorsDir);
    this._mainTempErrorsPath = resolve(this._tempErrorsPath, this.tempErrorsFile);
    this._inputPath = resolve(this.workingDir, this.inputDir);
    this._outputPath = resolve(this.workingDir, this.outputDir);
    this._logsPath = resolve(this.workingDir, this.logsDir);
    this._reportsPath = resolve(this.workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this._mainStatPath = resolve(this._reportsPath, this.statFile);
    this._mainErrorsToRetryPath = resolve(this._reportsPath, this.errorsToRetryFile);
    this._mainValidationErrorsPath = resolve(this._reportsPath, this.validationErrorsFile);
    this._tempErrorStream = null;
    this._validationErrorStream = null;
    this._tempInputStream = null;
    this._successOutputStream = null;
    // Up to 10,000 requests to dadata.ru api per day are free of charge
    this.requestsPerDay = options.requestsPerDay || 8000;
    // Get company data with branch information or not
    this.withBranches = options.withBranches || false;
    // How many branches to get information for (maximum 20)
    this.branchesCount = options.branchesCount || 20;
    // Number of inns per prepared file for requesting and number of json objects per output file
    this.innPerFile = options.innPerFile || 500;
    this._filesPerDay = Math.floor(this.requestsPerDay / this.innPerFile);
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
    this._firstJSON = true;
    this._newCycle = false;
    this._totalRequestNumber = 0;
    this._currentRequestNumber = 0;
    this._successNumber = 0;
    this._validationErrorsNumber = 0;
    this._retryErrorsNumber = 0;
    this.logger = new Logger({
      retryErrorPath: resolve(this._logsPath, `retryErrors_${getDate()}.log`),
      validationErrorPath: resolve(this._logsPath, `validationErrors_${getDate()}.log`),
      generalErrorPath: resolve(this._logsPath, `generalErrors_${getDate()}.log`),
      successPath: resolve(this._logsPath, `success_${getDate()}.log`),
      mode: 'a',
    });
    // Use instance of APIMultiCaller class to make requests
    this.apiMultiCaller = new APIMultiCaller({ logger: this.logger });
    // Use extractData function to extract wanted data from dadata.ru object
    // extractData function in extractData module can be changed according to your needs
    this.extractData = extractData;
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

  _cleanBeforeStart() {
    // remove previous reports
    cleanDir(this._reportsPath);
    // remove previous logs
    cleanDir(this._logsPath);
    // remove previous prepared input files if for some reason they were not processed
    cleanDir(this._tempInputPath);
    // remove previous file with inns to retry if for some reason it was not processed
    cleanDir(this._tempErrorsPath);
  }

  // Divides input and error files into temporary files prepared for requesting,
  // so that each temporary file contains a certain number of inns
  // It is convenient for managing the number of requests per day
  // and for outputting a certain number of json objects per file
  async _processInput(checkingErrors) {
    let currentPaths;
    let currentDir;
    // We are dividing input files into temporary files prepared for requesting
    if (!checkingErrors) {
      currentDir = this._inputPath;
      // Read input directory and select files to process
      currentPaths = readdirSync(currentDir).filter((file) => {
        const stat = statSync(resolve(currentDir, file));
        // Select if it is a file and its name doesn't start with _
        // If a file name starts with _, it means it is was processed before
        return stat.isFile() && file[0] !== '_' && file.endsWith('.txt');
      });
      // If there are no files to process, go to make requests
      if (!currentPaths.length) return;
      // Otherwise, prepare directories
      this._cleanBeforeStart();
      // We have already made all the requests, and now if there are any errors to retry,
      // we are dividing them into temporary files prepared for requesting
    } else {
      currentDir = this._tempErrorsPath;
      currentPaths = readdirSync(currentDir);
      // If there are no errors to retry, there is nothing to do
      if (!currentPaths.length) return;
      this._newCycle = true;
    }

    let lineCount = 0;
    let fileCount = 1;

    this._tempInputStream = createWriteStream(
      resolve(this._tempInputPath, `${getDate()}_${fileCount}.txt`)
    );

    // Process each file
    for (const file of currentPaths) {
      const currentPath = resolve(currentDir, file);
      const rl = createInterface({
        input: createReadStream(currentPath, 'utf8'),
        crlfDelay: Infinity,
      });

      // For every inn in file
      for await (const line of rl) {
        this._totalRequestNumber += 1;
        // If number of inns in a file equals this.innPerFile, start a new temporary file
        if (lineCount === this.innPerFile) {
          lineCount = 0;
          this._tempInputStream.end();
          fileCount += 1;
          this._tempInputStream = createWriteStream(
            resolve(this._tempInputPath, `${getDate()}_${fileCount}.txt`)
          );
        }
        this._tempInputStream.write(`${line}\n`);
        lineCount += 1;
      }

      // Remove file, if it is a error file
      if (checkingErrors) unlinkSync(currentPath);
      // Mark input file as processed
      else renameSync(currentPath, resolve(currentDir, `_${file}`));
    }

    this._tempInputStream.end();
  }

  // Reads current temporary file prepared for requesting and splits requests into batches
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

  // Writes json object with data to output file
  _processResponse(response) {
    const json = JSON.stringify(this.extractData(response));
    if (this._firstJSON) {
      this._successOutputStream.write(`\n${json}`);
      this._firstJSON = false;
    } else {
      this._successOutputStream.write(`,\n${json}`);
    }
  }

  // Makes requests for inns from a temporary file prepared for requesting
  // by passing them to api multi caller class
  async _request(currentPath) {
    this._firstJSON = true;
    // Split requests into batches
    const queriesArray = await this._getQueriesArray(currentPath);
    const outputFileName = `${getDate()}.json`;
    this._successOutputStream = createWriteStream(resolve(this._outputPath, outputFileName));
    const successInn = [];
    let requestFailure = [];
    let validationFailure = [];
    // Variables to collect stats
    let currentRequestNumber = 0;
    let successNumber = 0;
    let retryErrorsNumber = 0;
    let validationErrorsNumber = 0;

    this._successOutputStream.write('[');

    // For each batch
    for (const arr of queriesArray) {
      // Make requests
      const response = await this.apiMultiCaller.makeRequests(arr);
      const success = response[0];
      const stopErrors = response[2];
      requestFailure = [...requestFailure, ...response[1]];
      validationFailure = [...validationFailure, ...response[3]];
      const failureRate = response[1].length / (success.length + response[1].length);
      const failureRateExceeded =
        failureRate > this.failureRate && arr.length > this.requestsLengthToCheckFailureRate;

      // If stop error occurs or the failure rate is exceeded again, stop
      if (stopErrors.length || (failureRate > this.failureRate && this._repeatedFailure)) {
        this._stop = true;
        this._isStopErrorOccurred = !!stopErrors.length;
        if (this._successOutputStream) {
          // Close output stream
          await closeStreams([this._successOutputStream]);
          // Remove output file, as a temporary file prepared for requesting is treated as a unit,
          // that can be either fully processed or not processed at all
          existsSync(resolve(this._outputPath, outputFileName)) &&
            unlinkSync(resolve(this._outputPath, outputFileName));
          const errorMessage = stopErrors.length
            ? `Due to StopError the script was stopped, ${outputFileName} was removed.`
            : `The maximum failure rate was exceeded. The script was stopped. ${outputFileName} was removed.`;
          this.logger.log('retryError', errorMessage);
        }
        return;
      }

      // Collect stats
      currentRequestNumber += arr.length;
      successNumber += success.length;
      retryErrorsNumber += response[1].length;
      validationErrorsNumber += response[3].length;

      success.flat().forEach((item) => {
        successInn.push(item.data.inn);
        // Write data into output file
        this._processResponse(item);
      });

      // If the failure rate is exceeded for the first time, mark it and
      // wait before making a next request in case it is a short-term issue
      if (failureRateExceeded && !this._repeatedFailure) {
        this._repeatedFailure = true;
        await new Promise((resolve) => setTimeout(resolve, this.timeToWaitBeforeNextAttempt));
        // Everything is ok
      } else {
        this._repeatedFailure = false;
      }
    }

    this._successOutputStream.end('\n]\n');

    // The entire temporary file prepared for requesting is now processed

    // Add local stats to global stats
    this._currentRequestNumber += currentRequestNumber;
    this._successNumber += successNumber;
    this._retryErrorsNumber += retryErrorsNumber;
    this._validationErrorsNumber += validationErrorsNumber;

    // Log success requests into success log file
    if (successInn.length)
      successInn.forEach((inn) => this.logger.log('success', `${inn} Data is received.`));

    // Write errors to retry into error file in temp directory
    if (requestFailure.length && !this._tempErrorStream)
      this._tempErrorStream = createWriteStream(this._mainTempErrorsPath, { flags: 'a' });
    requestFailure.forEach((item) => this._tempErrorStream.write(`${item}\n`));

    // Write validation errors into validation error file
    if (validationFailure.length && !this._validationErrorStream)
      this._validationErrorStream = createWriteStream(this._mainValidationErrorsPath, {
        flags: 'a',
      });
    validationFailure.forEach((item) => this._validationErrorStream.write(`${item}\n`));

    // Remove processed temporary file
    existsSync(currentPath) && unlinkSync(currentPath);
  }

  // Manages request process
  async _requests(currentFiles) {
    // For each file to process today
    for (const file of currentFiles) {
      // If stop error occurred or the failure rate is exceeded again, stop
      if (this._stop) break;
      await this._request(resolve(this._tempInputPath, file));
    }

    await closeStreams([this._tempErrorStream]);
  }

  // Gets temporary files prepared for requesting to process today
  _getCurrentFiles() {
    // Take some first ones
    return readdirSync(this._tempInputPath).slice(0, this._filesPerDay);
  }

  // Updates the auxiliary file, where stats are kept
  _updateStat() {
    // If stats file exists already, get previous stats
    let stat = existsSync(this._mainStatPath)
      ? JSON.parse(readFileSync(this._mainStatPath, 'utf8'))
      : null;
    const requestInfo = {
      requests: this._currentRequestNumber,
      success: this._successNumber,
      validationErrors: this._validationErrorsNumber,
      retryErrors: this._retryErrorsNumber,
    };

    // If stats don't exist, create a new stats object
    if (!stat) {
      stat = {
        totalRequestNumber: this._totalRequestNumber,
        requestDays: [requestInfo],
        retryErrorsDays: [],
      };
      // Otherwise, update it
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

  // Converts stats into the format required by a report
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

  // Writes a report with statistics on requests
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
Отчет сформирован: ${getDate(true)}`;

    writeFileSync(this._mainReportPath, report);
  }

  // Copies error file from temp directory into reports directory
  _writeErrorsToRetry() {
    // If error file in temp directory exists, copy it
    if (existsSync(this._mainTempErrorsPath)) {
      copyFileSync(this._mainTempErrorsPath, this._mainErrorsToRetryPath);
      appendFileSync(this._mainErrorsToRetryPath, `Отчет сформирован: ${getDate(true)}`);
      // If not, remove an existing error file in reports directory
    } else {
      existsSync(this._mainErrorsToRetryPath) && unlinkSync(this._mainErrorsToRetryPath);
    }
  }

  // Writes date into validation error file
  _writeDateToValidationErrors() {
    if (this._validationErrorStream) {
      this._validationErrorStream.write(`Отчет сформирован: ${getDate(true)}\n\n`);
    }
  }

  // Writes reports with statistics and errors
  _generateReport() {
    try {
      const stat = this._updateStat();
      this._writeReport(stat);
      this._writeErrorsToRetry();
      this._writeDateToValidationErrors();
    } catch (err) {
      this.logger.log('generalError', err);
    }
  }

  _reset() {
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
    this._tempInputStream = null;
    this._successOutputStream = null;
    this._tempErrorStream = null;
    this._validationErrorStream = null;
  }

  async _cleanBeforeFinish() {
    try {
      const streams = [
        this._tempInputStream,
        this._successOutputStream,
        this._tempErrorStream,
        this._validationErrorStream,
      ];
      await closeStreams(streams);
      await this.logger.closeStreams();
      this._reset();
    } catch (err) {
      console.log(err);
    }
  }

  async _start(checkingErrors = false) {
    // Get temporary files prepared for requesting
    await this._processInput(checkingErrors);
    // Pick some temporary files to process today
    const currentFiles = this._getCurrentFiles();
    // If such files exist
    if (currentFiles.length) {
      // Make requests
      await this._requests(currentFiles);
      // Otherwise, if error file exist, restart with error file
    } else if (existsSync(this._mainTempErrorsPath)) await this._start(true);
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
      this._generateReport();
      await this._cleanBeforeFinish();
    }
  }
}

module.exports = APIRequestManager;
