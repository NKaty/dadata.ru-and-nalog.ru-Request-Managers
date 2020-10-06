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
// const { performance } = require('perf_hooks');

const WorkerPool = require('./WorkerPool');
const Logger = require('../common/Logger');
const { closeStreams, getDate, cleanDir } = require('../common/helpers');
// const extractData = require('./extractData');

class Manager {
  constructor(options) {
    // Directory with files to process. File names mustn't start with _
    // Every file must be text file, where each line is a single inn
    this.inputDir = options.inputDir;
    // Output directory for pdf files and json files
    this.outputDir = options.outputDir || 'output';
    // Output directory for logs
    this.logsDir = options.logsDir || 'logs';
    // Output directory for reports
    this.reportsDir = options.reportsDir || 'reports';
    // Report with statistics on downloads
    this.reportFile = 'report.txt';
    // List of inns, on which some network error occurred and they require re-request
    this.parsingErrorsFile = 'parsingErrors.txt';
    this.workerFile = 'worker.js';
    this.dbFile = options.dbFile || 'data.db';
    // Directory, where all other directories and files will be created
    this.workingDir = options.workingDir || process.cwd();
    this._inputPath = resolve(this.workingDir, this.inputDir);
    this._outputPath = resolve(this.workingDir, this.outputDir);
    this._logsPath = resolve(this.workingDir, this.logsDir);
    this._reportsPath = resolve(this.workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this._parsingErrorsPath = resolve(this._reportsPath, this.parsingErrorsFile);
    this.dbPath = resolve(this.workingDir, this.dbFile);
    this._streams = { parsingErrorStream: null, successOutputStream: null };
    // Number of pdf files simultaneously sent to worker pool
    this.pdfLength = options.pdfLength || 100;
    // Clean or not the table with json data before a new portion input files
    // Number of json objects per output file
    this.pdfObjectsPerFile = options.pdfObjectsPerFile || 500;
    this.pdfObjectsPerArray = options.pdfObjectsPerArray || 500;
    this.cleanDB = options.cleanDB || false;
    this.db = new Database(this.dbPath);
    this._parser = null;
    this.numberOfThreads = options.numberOfThreads || null;
    this.logger = new Logger({
      generalErrorPath: resolve(this._logsPath, `generalErrors_${getDate()}.log`),
      parsingErrorPath: resolve(this._logsPath, `parsingErrors_${getDate()}.log`),
      successPath: resolve(this._logsPath, `success_${getDate()}.log`),
    });
    this.extractData = options.extractData || null;
    this._getResultAsArrays = this._getResultAsArrays.bind(this);
    this._getAllContentAsArrays = this._getAllContentAsArrays.bind(this);
    this._createDirStructure();
    this._createDb();
  }

  _createDirStructure() {
    if (!existsSync(this._outputPath)) mkdirSync(this._outputPath);
    if (!existsSync(this._logsPath)) mkdirSync(this._logsPath);
    if (!existsSync(this._reportsPath)) mkdirSync(this._reportsPath);
  }

  _createDb() {
    // Create table to keep status of files
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

  _processInputDir() {
    // Read input directory and select files to process
    const inputPaths = readdirSync(this._inputPath).filter((file) => {
      const stat = statSync(resolve(this._inputPath, file));
      return stat.isFile() && file.endsWith('pdf');
    });

    // If there are no files to process, go to make requests by inns (if there are unprocessed requests)
    if (!inputPaths.length) return;

    this._prepareDb();
    this._cleanBeforeStart();

    inputPaths.forEach((path) => {
      this.db
        .prepare('INSERT INTO paths (path, status) VALUES (?, ?)')
        .run(resolve(this._inputPath, path), 'raw');
    });
  }

  _initParser() {
    if (!this._parser) {
      this._parser = new WorkerPool(
        resolve(__dirname, this.workerFile),
        this.dbPath,
        this.numberOfThreads
      );
      this._parser.on('error', (error) => this.logger.log('generalError', error));
    }
  }

  _updateAfterParsing(results) {
    const updateStatus = this.db.prepare('UPDATE paths SET status = ?, ogrn = ? WHERE path = ?');
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
        const { error, path } = result.reason;
        updateStatus.run('error', null, path);
        this.logger.log('parsingError', error, path);
      }
    });
  }

  async _batchParse(paths) {
    const results = await Promise.allSettled(paths.map((path) => this._parser.run(path)));
    this._updateAfterParsing(results);
  }

  async _parse() {
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
    // console.timeEnd('time');
  }

  _updatePromise(results) {
    return new Promise((resolve) => {
      setImmediate(() => {
        this._updateAfterParsing(results);
        resolve();
      });
    });
  }

  async _parseAsync() {
    const pathArray = this.db.prepare('SELECT path FROM paths WHERE status = ?').raw().all('raw');
    while (pathArray.length) {
      const paths = pathArray.splice(0, this.pdfLength).flat();
      const results = await Promise.allSettled(paths.map((path) => this._parser.run(path)));
      if (pathArray.length) this._updatePromise(results);
      else await this._updatePromise(results);
    }
    // console.timeEnd('time');
  }

  // Writes json data from jsons tables to output files
  _writeJSONFiles(getResultArraysGen) {
    let fileCount = 1;
    for (const batch of getResultArraysGen(this.pdfObjectsPerFile)) {
      this._streams.successOutputStream = createWriteStream(
        resolve(this._outputPath, `${getDate()}_${fileCount}.json`)
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

  /**
   * @desc Writes output files with json data for requests completed successfully so far
   * @returns {void}
   */
  async getResult() {
    try {
      this._writeJSONFiles(this._getResultAsArrays);
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  /**
   * @desc Writes output files with all json data from jsons table
   * @returns {void}
   */
  async getAllContent() {
    try {
      this._writeJSONFiles(this._getAllContentAsArrays);
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  // Writes json data from jsons tables to output files
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

  *_getResultAsArrays(limit) {
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
        return this.extractData ? this.extractData(item.path, data, true) : data;
      },
      limit
    );
  }

  /**
   * @desc Writes output files with json data for requests completed successfully so far
   * @returns {void}
   */
  async *getResultAsArrays(limit = this.pdfObjectsPerArray) {
    try {
      yield* this._getResultAsArrays(limit);
    } catch (err) {
      this.logger.log('generalError', err);
    } finally {
      await this._cleanBeforeFinish();
    }
  }

  *_getAllContentAsArrays(limit) {
    yield* this._getDataArrays(
      (offset) =>
        this.db
          .prepare('SELECT path, json FROM jsons ORDER BY path, ogrn LIMIT ? OFFSET ?')
          .all(limit, offset),
      (item) => {
        const data = JSON.parse(item.json);
        return this.extractData ? this.extractData(item.path, data, true) : data;
      },
      limit
    );
  }

  /**
   * @desc Writes output files with all json data from jsons table
   * @returns {void}
   */
  async *getAllContentAsArrays(limit = this.pdfObjectsPerArray) {
    try {
      yield* this._getAllContentAsArrays(limit);
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
   * @desc Writes a report with statistics on downloads
   * @returns {void}
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
    const errors = this.db
      .prepare('SELECT path FROM paths WHERE status = ?')
      .raw()
      .all('error')
      .flat();

    if (errors.length) {
      if (!this._streams.parsingErrorStream) {
        this._streams.parsingErrorStream = createWriteStream(this._parsingErrorsPath);
      }
      errors.forEach((path) => this._streams.parsingErrorStream.write(`${path}\n`));
      this._streams.parsingErrorStream.end(`Отчет сформирован: ${getDate(true)}\n`);
    } else {
      if (existsSync(this._parsingErrorsPath)) unlinkSync(this._parsingErrorsPath);
    }
  }

  /**
   * @desc Writes a file with a list of inns, on which some network error occurred
   * and they require re-request, and a file with a list of invalid inns
   * @returns {void}
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
   * @desc Writes a report with statistics on downloads and files with lists of inns with errors
   * @returns {void}
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

module.exports = Manager;

const manager = new Manager({ inputDir: 'output', numberOfThreads: 2 });
manager.start();
// manager.getResult();
// (async function () {
//   for await (const data of manager.getResultAsArrays()) {
//     console.log(data);
//   }
// })();

// (async function () {
//   const times = [];
//   for (let i = 0; i < 10; i++) {
//     const t = performance.now();
//     console.time('time');
//     console.log(i);
//     await manager.start();
//     times.push(performance.now() - t);
//   }
//   console.log(times.reduce((acc, item) => acc + item, 0) / 10);
// })();
