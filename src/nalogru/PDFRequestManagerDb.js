/**
 * PDFRequestManagerDb
 * PDF request manager class manages multiples requests to nalog.ru website by using sqlite database.
 * Downloads EGRUL pdf documents.
 * Uses only inn for search.
 * Inns must be given in text files, where each line is a single inn.
 * Creates a directory structure on the first run, after which it is required
 * to put the files with inns into input directory.
 * Offers reports on downloads after completion.
 * If network errors occurred during execution and there are requests with status 'retry',
 * it is required to restart the script when network problems are fixed.
 **/

const BaseRequestManagerDb = require('../common/BaseRequestManagerDb');
const MultiDownloader = require('./MultiDownloader');

class PDFRequestManagerDb extends BaseRequestManagerDb {
  /**
   * PDFRequestManagerDb class
   * @constructor
   * @param {Object} [options] - configuration settings
   * @param {string} [options.inputDir] - name of directory with input files
   * @param {string} [options.outputDir] - name of directory with output files
   * @param {string} [options.logsDir] - name of directory with logs files
   * @param {string} [options.reportsDir] - name of directory with reports
   * @param {string} [options.dbFile] - name of sqlite database file
   * @param {string} [options.workingDir] - path to directory where all other directories
   *  and files will be created
   * @param {number} [options.requestsLength] - number of requests simultaneously sent and processed
   * @param {number} [options.failureRate] - failure rate of request to wait or stop
   * @param {number} [options.requestsLengthToCheckFailureRate] - minimum number of requests sent
   *  simultaneously to check failure rate
   * @param {number} [options.timeToWaitBeforeNextAttempt] - time in milliseconds to wait
   *  for the first time failure rate is exceeded
   */
  constructor(options = {}) {
    super(options);
    this._stopErrorMessage =
      'Внимание. Произошла ошибка: The captcha is required. Рекомендуется проверить время паузы между запросами.';
    // Use instance of MultiDownloader class to make requests
    this.downloader = new MultiDownloader({ logger: this.logger, outputPath: this._outputPath });
    this._makeRequests = this.downloader.getDocsByInn.bind(this.downloader);
  }

  // Insert inn into requests table
  _insertRequest(inn) {
    this.db.prepare('INSERT INTO requests (inn, status) VALUES (?, ?)').run(inn, 'raw');
  }

  _getSuccessItemInn(item) {
    return item;
  }

  // Gets inns to request
  _getQueryArray() {
    return this.db
      .prepare('SELECT DISTINCT inn FROM requests WHERE status IN (?, ?) ORDER BY status')
      .bind('raw', 'retry')
      .raw()
      .all();
  }

  // Splits requests into batches
  _getQueries(queryArray) {
    return queryArray.splice(0, this.requestsLength).flat();
  }
}

module.exports = PDFRequestManagerDb;
