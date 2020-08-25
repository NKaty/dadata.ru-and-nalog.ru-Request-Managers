const BaseRequestManagerDb = require('../common/BaseRequestManagerDb');
const MultiDownloader = require('./MultiDownloader');

class PDFRequestManagerDb extends BaseRequestManagerDb {
  constructor(options = {}) {
    super(options);
    this._stopErrorMessage =
      'Внимание. Произошла ошибка: The captcha is required. Рекомендуется проверить время паузы между запросами.';
    this.downloader = new MultiDownloader({ logger: this.logger, outputPath: this._outputPath });
    this._makeRequests = this.downloader.getDocsByInn.bind(this.downloader);
  }

  _insertRequest(inn) {
    this.db.prepare('INSERT INTO requests (inn, status) VALUES (?, ?)').run(inn, 'raw');
  }

  _getSuccessItemInn(item) {
    return item;
  }

  _getQueryArray() {
    return this.db
      .prepare('SELECT DISTINCT inn FROM requests WHERE status IN (?, ?) ORDER BY status')
      .bind('raw', 'retry')
      .raw()
      .all();
  }

  _getQueries(queryArray) {
    return queryArray.splice(0, this.requestsLength).flat();
  }
}

module.exports = PDFRequestManagerDb;
