/**
 * ParsingManager
 * Parsing manager class manages parsing of egrul and egrip pdf documents
 * by using worker thread pool and sqlite database.
 * Keeps parsed data in a database.
 * Offers methods to write the data from a database to json files or
 * to get the data as a series of arrays of objects.
 * Offers reports on parsing after completion.
 */

const { resolve } = require('path');
const {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  createWriteStream,
  unlinkSync,
} = require('fs');
const Database = require('better-sqlite3');
const WorkerPool = require('./WorkerPool');
const Logger = require('../common/Logger');
const { closeStreams, getDate, cleanDir } = require('../common/helpers');

class ParsingManager {
  /**
   * ParsingManager class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {?string} [options.inputPath=null] - path to a directory with egrul pdf files to parse
   * @param {string} [options.outputDir='output'] - name of directory for output files
   * @param {string} [options.logsDir='logs'] - name of directory with logs files
   * @param {string} [options.reportsDir='reports'] - name of directory with reports
   * @param {string} [options.workingDir=process.cwd()] - path to directory where
   *  the all other directories and files will be created
   * @param {string} [options.dbFile='parsedPDF.db'] - name of a sqlite database file
   * @param {string} [options.dbPath=resolve(this.workingDir, this.dbFile)] - path
   *  to a sqlite database file
   * @param {boolean} [options.cleanDB=false] - clean or not the table with json data
   * @param {number} [options.numberOfThreads=os.cpus().length] - number of worker threads
   * @param {number} [options.pdfLength=100] - number of pdf files simultaneously sent to a worker pool
   * @param {number} [options.pdfObjectsPerFile=500] - number of json objects per an output file
   * @param {number} [options.pdfObjectsPerArray=500] - number of data objects per an output array
   * @param {?function} [options.extractData=null] - extracts the required fields from an egrul object
   */
  constructor(options = {}) {
    // Path to a directory with egrul pdf files to parse
    this.inputPath = options.inputPath || null;
    // Output directory for json files
    this.outputDir = options.outputDir || 'output';
    // Output directory for logs
    this.logsDir = options.logsDir || 'logs';
    // Output directory for reports
    this.reportsDir = options.reportsDir || 'reports';
    // Report with statistics on downloads
    this.reportFile = 'report.txt';
    // List of paths, on which an error occurred
    this.parsingErrorsFile = 'parsingErrors.txt';
    // Directory, where all the other directories and files will be created
    this.workingDir = options.workingDir || process.cwd();
    this.outputPath = resolve(this.workingDir, this.outputDir);
    this._logsPath = resolve(this.workingDir, this.logsDir);
    this._reportsPath = resolve(this.workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this._parsingErrorsPath = resolve(this._reportsPath, this.parsingErrorsFile);
    this._streams = { parsingErrorStream: null, successOutputStream: null };
    this.dbFile = options.dbFile || 'parsedPDF.db';
    this.dbPath = options.dbPath || resolve(this.workingDir, this.dbFile);
    // Clean or not the table with json data before a new portion of pdf files
    this.cleanDB = options.cleanDB || false;
    this.db = new Database(this.dbPath);
    // Worker implementation for worker thread pool
    this.workerFile = 'worker.js';
    // Number of worker threads
    this.numberOfThreads = options.numberOfThreads;
    // Number of pdf files simultaneously sent to a worker pool
    this.pdfLength = options.pdfLength || 100;
    // Instance of the worker thread pool
    this._parser = null;
    // Number of json objects per an output file
    this.pdfObjectsPerFile = options.pdfObjectsPerFile || 500;
    // Number of data objects per an output array
    this.pdfObjectsPerArray = options.pdfObjectsPerArray || 500;
    this.logger = new Logger({
      generalErrorPath: resolve(this._logsPath, `generalErrors_${getDate()}.log`),
      parsingErrorPath: resolve(this._logsPath, `parsingErrors_${getDate()}.log`),
      successPath: resolve(this._logsPath, `success_${getDate()}.log`),
      mode: 'a',
    });
    // Function to extract the required fields from an egrul object
    this.extractData = options.extractData || null;
    this._getResultAsArrays = this._getResultAsArrays.bind(this);
    this._getAllContentAsArrays = this._getAllContentAsArrays.bind(this);
    this._createDirStructure();
    this._createDb();
  }

  _createDirStructure() {
    if (!existsSync(this._logsPath)) mkdirSync(this._logsPath);
    if (!existsSync(this._reportsPath)) mkdirSync(this._reportsPath);
  }

  _createDb() {
    // Create table to keep the status of pdf files
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS paths (
             path TEXT PRIMARY KEY,
             ogrn TEXT DEFAULT NULL,
             status TEXT CHECK(status IN ('raw', 'success', 'error')))`
      )
      .run();
    // Create table to keep json data
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jsons (
             path TEXT,
             inn TEXT,
             ogrn TEXT,
             json TEXT,
             PRIMARY KEY(path, ogrn))`
      )
      .run();
  }

  _prepareDb() {
    this.db.prepare('DELETE FROM paths').run();
    // If true, clean jsons table
    if (this.cleanDB) this.db.prepare('DELETE FROM jsons').run();
  }

  _cleanBeforeStart() {
    cleanDir(this._reportsPath);
    cleanDir(this._logsPath);
  }

  // Gets pdf paths into a database
  _processInputDir() {
    if (!existsSync(this.inputPath)) return;

    // Read input directory and select files to parsed
    const inputPaths = readdirSync(this.inputPath).filter((file) => {
      const stat = statSync(resolve(this.inputPath, file));
      return stat.isFile() && file.endsWith('.pdf');
    });

    if (!inputPaths.length) return;

    this._prepareDb();
    this._cleanBeforeStart();

    inputPaths.forEach((path) => {
      this.db
        .prepare('INSERT INTO paths (path, status) VALUES (?, ?)')
        .run(resolve(this.inputPath, path), 'raw');
    });
  }

  // Creates instance of WorkerPool class
  _initParser() {
    if (!this._parser) {
      this._parser = new WorkerPool(resolve(__dirname, this.workerFile), this.numberOfThreads);
      // Log errors with no information about a task (file path) occurred in worker threads
      this._parser.on('error', (error) => this.logger.log('generalError', error));
    }
  }

  // Updates a status and inserts data
  _updateAfterParsing(results) {
    const updateStatus = this.db.prepare('UPDATE paths SET status = ?, ogrn = ? WHERE path = ?');
    // If an error occurs during the update, both tables will be updated or none
    const insertData = this.db.transaction((data, path) => {
      updateStatus.run('success', data.ogrn, path);
      if (
        this.db
          .prepare('SELECT ogrn FROM jsons WHERE path = ? AND ogrn = ?')
          .get(path, data.ogrn) === undefined
      ) {
        this.db
          .prepare('INSERT INTO jsons (path, inn, ogrn, json) VALUES (?, ?, ?, ?)')
          .run(path, data.inn, data.ogrn, JSON.stringify(data));
      } else {
        this.db
          .prepare('UPDATE jsons SET json = ? WHERE path = ? AND ogrn = ?')
          .run(JSON.stringify(data), path, data.ogrn);
      }
    });

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { data, path } = result.value;
        insertData(data, path);
        this.logger.log('success', 'Has been parsed.', path);
      } else {
        const { cause, path } = result.reason;
        updateStatus.run('error', null, path);
        this.logger.log('parsingError', cause, path);
      }
    });
  }

  // Parses a batch of pdf files
  async _batchParse(paths) {
    const results = await Promise.allSettled(paths.map((path) => this._parser.run(path)));
    this._updateAfterParsing(results);
  }

  // Manages parsing process
  async _parse() {
    // Generator for getting arrays (of file paths) of the required length
    const pathGen = this._getDataArrays(
      () =>
        this.db
          .prepare('SELECT path FROM paths WHERE status = ? LIMIT ?')
          .all('raw', this.pdfLength),
      (item) => item.path,
      this.pdfLength
    );

    for (const paths of pathGen) {
      await this._batchParse(paths);
    }
  }

  // Writes json data from jsons table to output files
  _writeJSONFiles(getResultArraysGen, outputPath) {
    if (outputPath !== null) this.outputPath = outputPath;
    if (!existsSync(this.outputPath)) mkdirSync(this.outputPath);

    let fileCount = 1;
    // Use generator for getting arrays (of data objects) of the required length
    for (const batch of getResultArraysGen(this.pdfObjectsPerFile)) {
      this._streams.successOutputStream = createWriteStream(
        resolve(this.outputPath, `${getDate()}_${fileCount}.json`)
      );
      this._streams.successOutputStream.write('[');
      batch.forEach((data, index) => {
        if (index === 0) this._streams.successOutputStream.write(`\n${JSON.stringify(data)}`);
        else this._streams.successOutputStream.write(`,\n${JSON.stringify(data)}`);
      });
      fileCount += 1;
      this._streams.successOutputStream.end('\n]\n');
    }
  }

  // Generates arrays of the required length with data from a database
  *_getDataArrays(getItems, getData, limit) {
    let offset = 0;
    let items = getItems(offset);
    while (items.length) {
      offset += limit;
      const dataArray = items.map(getData).filter((item) => item !== null && item !== undefined);
      yield dataArray;
      items = getItems(offset);
    }
  }

  // Generates arrays of the required length with data objects for paths from paths table
  *_getResultAsArrays(limit = this.pdfObjectsPerArray) {
    yield* this._getDataArrays(
      (offset) =>
        this.db
          .prepare('SELECT path, ogrn FROM paths WHERE status = ? ORDER BY path LIMIT ? OFFSET ?')
          .all('success', limit, offset),
      (item) => {
        const row = this.db
          .prepare('SELECT json FROM jsons WHERE path = ? AND ogrn = ?')
          .get(item.path, item.ogrn);
        if (row === undefined) return null;
        const data = JSON.parse(row.json);
        // If extractData function exists, extract the required fields
        // Otherwise return the entire data object
        return this.extractData ? this.extractData(item.path, data, true) : data;
      },
      limit
    );
  }

  // Generates arrays of the required length with data objects from jsons table
  *_getAllContentAsArrays(limit = this.pdfObjectsPerArray) {
    yield* this._getDataArrays(
      (offset) =>
        this.db
          .prepare('SELECT path, json FROM jsons ORDER BY path, ogrn LIMIT ? OFFSET ?')
          .all(limit, offset),
      (item) => {
        const data = JSON.parse(item.json);
        // If extractData function exists, extract the required fields
        // Otherwise return the entire data object
        return this.extractData ? this.extractData(item.path, data, true) : data;
      },
      limit
    );
  }

  /**
   * @desc Writes output files with json data for paths from paths table
   * @param {?string} [outputPath=null] - path to an output directory
   * @returns {Promise} - promise object represents void
   */
  async getResult(outputPath = null) {
    try {
      this._writeJSONFiles(this._getResultAsArrays, outputPath);
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  /**
   * @desc Writes output files with all json data from jsons table
   * @param {?string} [outputPath=null] - path to an output directory
   * @returns {Promise} - promise object represents void
   */
  async getAllContent(outputPath = null) {
    try {
      this._writeJSONFiles(this._getAllContentAsArrays, outputPath);
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  /**
   * @desc Generates arrays of the required length with data objects for paths from paths table
   * @generator
   * @yields {Promise} - promise object represents an array of the required length
   *  with data objects
   */
  async *getResultAsArrays() {
    try {
      yield* this._getResultAsArrays();
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  /**
   * @desc Generates arrays of the required length with data objects from jsons table
   * @generator
   * @yields {Promise} - promise object represents an array of the required length
   *  with data objects
   */
  async *getAllContentAsArrays() {
    try {
      yield* this._getAllContentAsArrays();
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  _collectStat() {
    const selectStatus = this.db.prepare('SELECT COUNT(path) AS count FROM paths WHERE status = ?');
    return {
      paths: this.db.prepare('SELECT COUNT(path) AS count FROM paths').get().count,
      success: selectStatus.get('success').count,
      parsingErrors: selectStatus.get('error').count,
    };
  }

  _writeReport() {
    const stat = this._collectStat();
    const report = `Общее количество pdf файлов: ${stat.paths}
Обработано файлов: ${stat.success + stat.parsingErrors}
  успешных: ${stat.success}
  неудачных: ${stat.parsingErrors}
Отчет сформирован: ${getDate(true)}`;

    writeFileSync(this._mainReportPath, report);
  }

  /**
   * @desc Writes a report with statistics on parsing
   * @returns {Promise} - promise object represents void
   */
  async writeReport() {
    try {
      this._writeReport();
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  _writeErrors() {
    const errorLength = 500;
    // Use generator for getting arrays (of parsing errors) of the required length
    const pathGen = this._getDataArrays(
      (offset) =>
        this.db
          .prepare('SELECT path FROM paths WHERE status = ? ORDER BY path LIMIT ? OFFSET ?')
          .all('error', errorLength, offset),
      (item) => item.path,
      errorLength
    );

    if (existsSync(this._parsingErrorsPath)) unlinkSync(this._parsingErrorsPath);

    for (const paths of pathGen) {
      if (!this._streams.parsingErrorStream) {
        this._streams.parsingErrorStream = createWriteStream(this._parsingErrorsPath);
      }
      paths.forEach((path) => this._streams.parsingErrorStream.write(`${path}\n`));
    }

    if (this._streams.parsingErrorStream) {
      this._streams.parsingErrorStream.end(`Отчет сформирован: ${getDate(true)}\n`);
    }
  }

  /**
   * @desc Writes a file with a list of paths, on which an error occurred
   * @returns {Promise} - promise object represents void
   */
  async writeErrors() {
    try {
      this._writeErrors();
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  _generateReport() {
    try {
      this._writeReport();
      this._writeErrors();
    } catch (err) {
      this.logger.log('generalError', err);
    }
  }

  /**
   * @desc Writes a report with statistics on parsing and a file
   *  with a list of paths, on which an error occurred
   * @returns {Promise} - promise object represents void
   */
  async generateReport() {
    this._generateReport();
    await this._cleanBeforeFinish();
  }

  async _cleanBeforeFinish() {
    try {
      await closeStreams(Object.values(this._streams));
      Object.keys(this._streams).forEach((key) => (this._streams[key] = null));
      await this.logger.closeStreams();
      if (this._parser) {
        await this._parser.clean();
        this._parser.removeAllListeners('error');
        this._parser = null;
      }
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * @desc Launches the parsing process
   * @param {boolean} [resume=false] - true, if resume the parsing process
   *  after it was interrupted for some reason
   * @returns {Promise} - promise object represents void
   */
  async start(resume = false) {
    try {
      if (!resume) this._processInputDir();
      this._initParser();
      await this._parse();
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      this._generateReport();
      await this._cleanBeforeFinish();
    }
  }
}

module.exports = ParsingManager;
