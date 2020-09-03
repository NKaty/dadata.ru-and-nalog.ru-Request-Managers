/**
 * MetaDataRequestManagerDb
 * Meta data request manager class manages multiples requests to nalog.ru website
 * by using sqlite database.
 * Collects json meta data into a database.
 * Uses only inn for search.
 * Inns must be given in text files, where each line is a single inn.
 * Creates a directory structure on the first run, after which it is required
 * to put the files with inns into input directory.
 * Offers reports on downloads after completion.
 * Writes json data to output files after successful completion.
 * If network errors occurred during execution and there are requests with status 'retry',
 * it is required to restart the script when network problems are fixed.
 * If some network errors cannot be fixed and so successful completion cannot be achieved,
 * the getCurrentResult method allows to write json data
 * for successful requests to output files at any time.
 */

const RequestManagerDb = require('../common/RequestManagerDb');
const MultiDownloader = require('./MultiDownloader');

class MetaDataRequestManagerDb extends RequestManagerDb {
  /**
   * MetaDataRequestManagerDb class
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
   * @param {boolean} [options.cleanDB=false] - clean or not the table with json data
   * @param {boolean} [options.updateMode=true] - update or not json data for inns if json data
   *  for these inns already exist in db
   * @param {number} [options.innPerFile=500] - number of json objects per output file
   */
  constructor(options = {}) {
    super(options);
    this._stopErrorMessage =
      'Внимание. Произошла ошибка: The captcha is required. Рекомендуется проверить время паузы между запросами.';
    // Use instance of MultiDownloader class to make requests and convert data
    this.downloader = new MultiDownloader({ logger: this.logger });
    this._makeRequests = this.downloader.getMetaDataByInn.bind(this.downloader);
    this._extractData = this.downloader.convertMetaDataItem.bind(this.downloader);
  }

  _getSuccessItemInn(item) {
    return item[0].i;
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

module.exports = MetaDataRequestManagerDb;
