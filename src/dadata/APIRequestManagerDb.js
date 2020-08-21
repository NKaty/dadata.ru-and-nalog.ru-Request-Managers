const RequestManagerDb = require('../common/RequestManagerDb');
const APIMultiCaller = require('./APIMultiCaller');
const extractData = require('./extractData');

class APIRequestManagerDb extends RequestManagerDb {
  constructor(options) {
    super(options);
    this._stopErrorMessage =
      'Внимание. Рекомендуется проверить лимиты на количество запросов в день, секунду и на количество новых соединений в минуту.';
    this.requestsPerDay = options.requestsPerDay || 1500;
    this.withBranches = options.withBranches || false;
    this.branchesCount = options.branchesCount || 20;
    this.downloader = new APIMultiCaller({ logger: this.logger, isSuccessLogging: true });
    this._makeRequests = this.downloader.makeRequests.bind(this.downloader);
    this._extractData = extractData;
  }

  _getSuccessItemInn(item) {
    return item[0].data.inn;
  }

  _getQueryArray() {
    return this.db
      .prepare('SELECT inn FROM requests WHERE status IN (?, ?) ORDER BY status LIMIT ?')
      .bind('raw', 'retry', this.requestsPerDay)
      .raw()
      .all();
  }

  _getQueries(queryArray) {
    return queryArray
      .splice(0, this.requestsLength)
      .flat()
      .map((inn) =>
        this.withBranches
          ? { query: inn, count: this.branchesCount }
          : { query: inn, branch_type: 'MAIN' }
      );
  }
}

module.exports = APIRequestManagerDb;
