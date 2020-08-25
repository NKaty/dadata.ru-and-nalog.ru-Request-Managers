const RequestManagerDb = require('../common/RequestManagerDb');
const MultiDownloader = require('./MultiDownloader');

class MetaDataRequestManagerDb extends RequestManagerDb {
  constructor(options) {
    super(options);
    this._stopErrorMessage =
      'Внимание. Произошла ошибка: The captcha is required. Рекомендуется проверить время паузы между запросами.';
    this.downloader = new MultiDownloader({ logger: this.logger });
    this._makeRequests = this.downloader.getMetaDataByInn.bind(this.downloader);
    this._extractData = this.downloader.convertMetaDataItem.bind(this.downloader);
  }

  _getSuccessItemInn(item) {
    return item[0].i;
  }

  _getQueryArray() {
    return this.db
      .prepare('SELECT inn FROM requests WHERE status IN (?, ?) ORDER BY status')
      .bind('raw', 'retry')
      .raw()
      .all();
  }

  _getQueries(queryArray) {
    return queryArray.splice(0, this.requestsLength).flat();
  }
}

module.exports = MetaDataRequestManagerDb;
