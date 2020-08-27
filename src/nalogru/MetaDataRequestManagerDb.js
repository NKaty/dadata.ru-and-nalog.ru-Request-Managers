/**
 * MetaDataRequestManagerDb
 * Meta data request manager class manages multiples requests to nalog.ru website
 * by using sqlite database.
 * Collects json meta data into a database.
 * Uses only inn for search.
 * Inns must be given in text files, where each line is a single inn.
 * Offers reports on downloads after completion.
 * Writes json data to output files after successful completion.
 * If network errors occurred during execution and there are requests with status 'retry',
 * it is required to restart the script when network problems are fixed.
 * If some network errors cannot be fixed and so successful completion cannot be achieved,
 * the getCurrentResult method allows to write json data
 * for successful requests to output files at any time.
 **/

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

module.exports = MetaDataRequestManagerDb;
