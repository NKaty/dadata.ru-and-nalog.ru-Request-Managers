/**
 * APIRequestManagerDb
 * API request manager class manages multiples requests to dadata.ru api by using sqlite database.
 * Collects json data into a database.
 * Uses only inn for search.
 * Inns must be given in text files, where each line is a single inn.
 * Creates a directory structure on the first run, after which it is required
 * to put the files with inns into input directory.
 * Offers reports on downloads after completion.
 * Writes json data to output files after successful completion.
 * Due to the limitation of the number of requests per day for free,
 * it may take several days to restart the script depending on the total number of requests.
 * If network errors occurred during execution and there are requests with status 'retry',
 * it is required to restart the script when network problems are fixed.
 * If some network errors cannot be fixed and so successful completion cannot be achieved,
 * the getCurrentResult method allows to write json data
 * for successful requests to output files at any time.
 **/

const RequestManagerDb = require('../common/RequestManagerDb');
const APIMultiCaller = require('./APIMultiCaller');
const extractData = require('./extractData');

class APIRequestManagerDb extends RequestManagerDb {
  /**
   * APIRequestManagerDb class
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
   * @param {boolean} [options.cleanDB] - clean or not the table with json data
   * @param {boolean} [options.updateMode] - update or not json data for inns if json data
   *  for these inns already exist in db
   * @param {number} [options.innPerFile] - number of json objects per output file
   * @param {number} [options.requestsPerDay] - number of requests per day
   * @param {boolean} [options.withBranches] - also get information for branches or not
   * @param {number} [options.branchesCount] - how many branches to get information for
   */
  constructor(options) {
    super(options);
    this._stopErrorMessage =
      'Внимание. Рекомендуется проверить лимиты на количество запросов в день, секунду и на количество новых соединений в минуту.';
    // Up to 10,000 requests to dadata.ru api per day are free of charge
    this.requestsPerDay = options.requestsPerDay || 8000;
    // Get company data with branch information or not
    this.withBranches = options.withBranches || false;
    // How many branches to get information for (maximum 20)
    this.branchesCount = options.branchesCount || 20;
    // Use instance of APIMultiCaller class to make requests
    this.downloader = new APIMultiCaller({ logger: this.logger, isSuccessLogging: true });
    this._makeRequests = this.downloader.makeRequests.bind(this.downloader);
    // Use extractData function to extract wanted data from dadata.ru object
    // extractData function in extractData module can be changed according to your needs
    this._extractData = extractData;
  }

  _getSuccessItemInn(item) {
    return item[0].data.inn;
  }

  // Gets inns to request
  _getQueryArray() {
    // With regards to the request limit per day
    return this.db
      .prepare('SELECT DISTINCT inn FROM requests WHERE status IN (?, ?) ORDER BY status LIMIT ?')
      .bind('raw', 'retry', this.requestsPerDay)
      .raw()
      .all();
  }

  // Splits requests into batches
  _getQueries(queryArray) {
    return queryArray
      .splice(0, this.requestsLength)
      .flat()
      .map((inn) =>
        this.withBranches
          ? { query: inn, count: this.branchesCount }
          : { query: inn, branch_type: 'MAIN' }
      );
  }
}

module.exports = APIRequestManagerDb;
