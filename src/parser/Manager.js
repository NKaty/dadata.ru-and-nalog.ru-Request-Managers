const { resolve } = require('path');
const { existsSync, mkdirSync, readdirSync, statSync } = require('fs');
const Database = require('better-sqlite3');

const WorkerPool = require('./WorkerPool');
const { cleanDir } = require('../common/helpers');

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
    this.dbFile = options.dbFile || 'data.db';
    // Directory, where all other directories and files will be created
    this.workingDir = options.workingDir || process.cwd();
    this._inputPath = resolve(this.workingDir, this.inputDir);
    this._outputPath = resolve(this.workingDir, this.outputDir);
    this._logsPath = resolve(this.workingDir, this.logsDir);
    this._reportsPath = resolve(this.workingDir, this.reportsDir);
    this._mainReportPath = resolve(this._reportsPath, this.reportFile);
    this.dbPath = resolve(this.workingDir, this.dbFile);
    // Number of requests simultaneously sent and processed
    this.requestsLength = options.requestsLength || 100;
    // Clean or not the table with json data before a new portion input files
    this.cleanDB = options.cleanDB || false;
    this.db = new Database(this.dbPath);
    this._parser = new WorkerPool(resolve(__dirname, 'worker.js'), this.dbPath, 2);
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

  async _parse() {
    const paths = this.db
      .prepare('SELECT DISTINCT path FROM paths WHERE status = ?')
      .bind('raw')
      .raw()
      .all();
    // console.log(paths);
    const result = await Promise.allSettled(paths.map((path) => this._parser.run(path[0])));
    result.forEach((item) => {
      if (item.status === 'fulfilled') console.log('value', item.value);
      else console.log(item.reason);
    });
  }

  async start() {
    this._processInputDir();
    await this._parse();
    await this._parser.close();
  }
}

module.exports = Manager;

const manager = new Manager({ inputDir: 'docs' });
manager.start();
