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
    this._parsingErrorStream = null;
    this._streams = [this._parsingErrorStream];
    // Number of pdf files simultaneously sent to worker pool
    this.pdfLength = options.pdfLength || 100;
    // Clean or not the table with json data before a new portion input files
    this.cleanDB = options.cleanDB || false;
    this.db = new Database(this.dbPath);
    this._parser = new WorkerPool(resolve(__dirname, 'worker.js'), this.dbPath, 2);
    this.logger = new Logger({
      generalErrorPath: resolve(this._logsPath, `generalErrors_${getDate()}.log`),
      parsingErrorPath: resolve(this._logsPath, `parsingErrors_${getDate()}.log`),
      successPath: resolve(this._logsPath, `success_${getDate()}.log`),
    });
    this._init();
  }

  _init() {
    this._createDirStructure();
    this._createDb();
    this._prepareDb();
    this._cleanBeforeStart();
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
             id INTEGER PRIMARY KEY,
             path TEXT,
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

    inputPaths.forEach((path) => {
      this.db
        .prepare('INSERT INTO paths (path, status) VALUES (?, ?)')
        .run(resolve(this._inputPath, path), 'raw');
    });
  }

  _updateAfterParsing(result) {
    const updateStatus = this.db.prepare('UPDATE paths SET status = ? WHERE path = ?');
    if (result.status === 'fulfilled') {
      const { data, path } = result.value;
      updateStatus.run('success', path);
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
      this.logger.log('success', 'Has been parsed.', path);
    } else {
      const { error, path } = result.reason;
      updateStatus.run('error', path);
      this.logger.log('parsingError', error, path);
    }
  }

  async _batchParse(paths) {
    const results = await Promise.allSettled(paths.map((path) => this._parser.run(path)));
    results.forEach((result) => this._updateAfterParsing(result));
  }

  async _parse() {
    const pathArray = this.db
      .prepare('SELECT DISTINCT path FROM paths WHERE status = ?')
      .raw()
      .all('raw');
    while (pathArray.length) {
      const paths = pathArray.splice(0, this.pdfLength).flat();
      await this._batchParse(paths);
    }
    // console.timeEnd('time');
  }

  _collectStat() {
    const selectStatus = this.db.prepare('SELECT COUNT(path) AS count FROM paths WHERE status = ?');
    return {
      paths: this.db.prepare('SELECT COUNT(path) AS count FROM paths').get().count,
      success: selectStatus.get('success').count,
      parsingErrors: selectStatus.get('error').count,
    };
  }

  /**
   * @desc Writes a report with statistics on downloads
   * @returns {void}
   */
  writeReport() {
    const stat = this._collectStat();
    const report = `Общее количество pdf файлов: ${stat.paths}
Обработано файлов: ${stat.success + stat.parsingErrors}
  успешных: ${stat.success}
  неудачных: ${stat.parsingErrors}
Отчет сформирован: ${getDate(true)}`;

    writeFileSync(this._mainReportPath, report);
  }

  /**
   * @desc Writes a file with a list of inns, on which some network error occurred
   * and they require re-request, and a file with a list of invalid inns
   * @returns {void}
   */
  writeErrors() {
    const errors = this.db
      .prepare('SELECT path FROM paths WHERE status = ?')
      .raw()
      .all('error')
      .flat();

    if (errors.length) {
      if (!this._parsingErrorStream)
        this._parsingErrorStream = createWriteStream(this._parsingErrorsPath);
      errors.forEach((path) => this._parsingErrorStream.write(`${path}\n`));
      this._parsingErrorStream.end(`Отчет сформирован: ${getDate(true)}\n`);
    } else {
      if (existsSync(this._parsingErrorsPath)) unlinkSync(this._parsingErrorsPath);
    }
  }

  /**
   * @desc Writes a report with statistics on downloads and files with lists of inns with errors
   * @returns {void}
   */
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
      await this._parser.close();
    } catch (err) {
      console.log(err);
    }
  }

  async start() {
    this._processInputDir();
    await this._parse();
    this.generateReport();
    await this._cleanBeforeFinish();
  }
}

module.exports = Manager;

const manager = new Manager({ inputDir: 'output' });
manager.start();

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
