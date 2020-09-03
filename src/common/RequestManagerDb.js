/**
 * RequestManagerDb
 * Request manager class manages multiples requests to nalog.ru website
 * or dadata.ru api by using sqlite database.
 * Collects json data into a database.
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

const { resolve } = require('path');
const { createWriteStream } = require('fs');
const BaseRequestManagerDb = require('./BaseRequestManagerDb');

class RequestManagerDb extends BaseRequestManagerDb {
  /**
   * RequestManagerDb class
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
    if (new.target === RequestManagerDb)
      throw new TypeError('You cannot instantiate RequestManagerDb class directly');

    super(options);
    this._successOutputStream = null;
    this._streams = [
      this._validationErrorStream,
      this._retryErrorStream,
      this._successOutputStream,
    ];
    // Clean or not the table with json data before a new portion input files
    this.cleanDB = options.cleanDB || false;
    // If the table with json data was not cleaned and json data for certain inns already exist,
    // update json data for these inns or just mark these inns as a success
    // and do not make new requests
    this.updateMode = options.updateMode || true;
    // Number of json objects per output file
    this.innPerFile = options.innPerFile || 500;
    this._extractData = null;
  }

  _createDb() {
    super._createDb();

    // Create table to keep json data
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jsons (
             inn TEXT PRIMARY KEY,
             json TEXT)`
      )
      .run();
  }

  _prepareDb() {
    super._prepareDb();
    // If true, clean jsons table
    if (this.cleanDB) this.db.prepare('DELETE FROM jsons').run();
  }

  // Makes necessary checks and insert inn into requests table
  _insertRequest(inn) {
    let status = 'raw';
    // If keeping old data is chosen and data for a given inn is present in jsons table
    if (
      !this.updateMode &&
      this.db.prepare('SELECT inn FROM jsons WHERE inn = ?').get(inn) !== undefined
    )
      // mark status of this inn as a success and do not make a new request
      status = 'success';
    this.db.prepare('INSERT INTO requests (inn, status) VALUES (?, ?)').run(inn, status);
  }

  // Updates status of every made request
  _updateAfterRequest(success, validationErrors, requestErrors, stopErrors) {
    super._updateAfterRequest(success, validationErrors, requestErrors, stopErrors);
    // Insert received data into jsons table
    success.forEach((item) => {
      const inn = this._getSuccessItemInn(item);
      if (this.db.prepare('SELECT inn FROM jsons WHERE inn = ?').get(inn) === undefined) {
        this.db
          .prepare('INSERT INTO jsons (inn, json) VALUES (?, ?)')
          .run(inn, JSON.stringify(item));
      } else {
        this.db.prepare('UPDATE jsons SET json = ? WHERE inn = ?').run(JSON.stringify(item), inn);
      }
    });
  }

  // Writes json data from jsons tables to output files
  _writeJSONFiles(jsonSelect, getJSON) {
    let fileCount = 1;
    let lineCount = 0;
    this._successOutputStream = createWriteStream(
      resolve(this._outputPath, `${this._getDate()}_${fileCount}.json`)
    );
    this._successOutputStream.write('[');

    for (const item of jsonSelect.iterate()) {
      // If number of json objects in a file equals or greater than this.innPerFile,
      // start a new output file
      if (lineCount >= this.innPerFile) {
        lineCount = 0;
        this._successOutputStream.end('\n]\n');
        fileCount += 1;
        this._successOutputStream = createWriteStream(
          resolve(this._outputPath, `${this._getDate()}_${fileCount}.json`)
        );
        this._successOutputStream.write('[');
      }
      const json = getJSON(item);
      if (json !== undefined) {
        const items = JSON.parse(json);
        items.forEach((item, itemIndex) => {
          if (lineCount === 0 && itemIndex === 0)
            this._successOutputStream.write(`\n${JSON.stringify(this._extractData(item))}`);
          else this._successOutputStream.write(`,\n${JSON.stringify(this._extractData(item))}`);
        });
      }
      lineCount += 1;
    }

    this._successOutputStream.end('\n]\n');
  }

  /**
   * @desc Writes output files with json data for requests completed successfully so far
   * @returns {void}
   */
  getCurrentResult() {
    const innsSelect = this.db
      .prepare('SELECT DISTINCT inn FROM requests WHERE status = ?')
      .bind('success');
    this._writeJSONFiles(
      innsSelect,
      (item) => this.db.prepare('SELECT json FROM jsons WHERE inn = ?').get(item.inn).json
    );
  }

  // Writes output files with json data for successful requests after all requests
  // from requests table are made and there are no requests that must be retried
  _getResult() {
    if (
      !this.db
        .prepare('SELECT inn FROM requests WHERE status IN (?, ?)')
        .raw()
        .all('raw', 'retry')
        .flat().length &&
      this.db.prepare('SELECT inn FROM requests WHERE status = ?').raw().all('success').flat()
        .length
    )
      this.getCurrentResult();
  }

  /**
   * @desc Writes output files with all json data from jsons table
   * @returns {void}
   */
  getAllContent() {
    const jsonSelect = this.db.prepare('SELECT json FROM jsons');
    this._writeJSONFiles(jsonSelect, (item) => item.json);
  }

  /**
   * @desc Launches the download process
   * @returns {Promise} - Promise object represents void
   * @override
   */
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
