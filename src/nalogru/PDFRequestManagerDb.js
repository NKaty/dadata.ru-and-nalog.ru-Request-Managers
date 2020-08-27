/**
 * PDFRequestManagerDb
 * PDF request manager class manages multiples requests to nalog.ru website by using sqlite database.
 * Downloads EGRUL pdf documents.
 * Uses only inn for search.
 * Inns must be given in text files, where each line is a single inn.
 * Offers reports on downloads after completion.
 * If network errors occurred during execution and there are requests with status 'retry',
 * it is required to restart the script when network problems are fixed.
 **/

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
