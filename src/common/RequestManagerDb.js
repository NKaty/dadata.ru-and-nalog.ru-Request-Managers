const { resolve } = require('path');
const { createWriteStream } = require('fs');
const BaseRequestManagerDb = require('./BaseRequestManagerDb');

class RequestManagerDb extends BaseRequestManagerDb {
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
    this.cleanDB = options.cleanDB || false;
    this.updateMode = options.updateMode || true;
    this.innPerFile = options.innPerFile || 500;
    this._extractData = null;
  }

  _createDb() {
    super._createDb();

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
    if (this.cleanDB) this.db.prepare('DELETE FROM jsons').run();
  }

  _insertRequest(inn) {
    let status = 'raw';
    if (
      !this.updateMode &&
      this.db.prepare('SELECT inn FROM jsons WHERE inn = ?').get(inn) !== undefined
    )
      status = 'success';
    this.db.prepare('INSERT INTO requests (inn, status) VALUES (?, ?)').run(inn, status);
  }

  _updateAfterRequest(success, validationErrors, requestErrors, stopErrors) {
    super._updateAfterRequest(success, validationErrors, requestErrors, stopErrors);
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

  _writeJSONFiles(jsonSelect, getJSON) {
    let fileCount = 1;
    let lineCount = 0;
    this._successOutputStream = createWriteStream(
      resolve(this._outputPath, `${this._getDate()}_${fileCount}.json`)
    );
    this._successOutputStream.write('[');

    for (const item of jsonSelect.iterate()) {
      if (lineCount === this.innPerFile) {
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

  getCurrentResult() {
    const innsSelect = this.db
      .prepare('SELECT DISTINCT inn FROM requests WHERE status = ?')
      .bind('success');
    this._writeJSONFiles(
      innsSelect,
      (item) => this.db.prepare('SELECT json FROM jsons WHERE inn = ?').get(item.inn).json
    );
  }

  _getResult() {
    if (
      !this.db
        .prepare('SELECT inn FROM requests WHERE status IN (?, ?)')
        .raw()
        .all('raw', 'retry')
        .flat().length
    )
      this.getCurrentResult();
  }

  getAllContent() {
    const jsonSelect = this.db.prepare('SELECT json FROM jsons');
    this._writeJSONFiles(jsonSelect, (item) => item.json);
  }

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
