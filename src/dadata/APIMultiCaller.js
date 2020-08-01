const { Agent } = require('https');
const PromiseThrottle = require('promise-throttle');
const APICaller = require('./APICaller');

class APIMultiCaller {
  constructor(options = {}) {
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 60,
      });
    this.throttle = new PromiseThrottle({
      requestsPerSecond: options.requestsPerSecond || 20,
      promiseImplementation: Promise,
    });
    this.logger = options.logger || console;
    this.apiCaller = new APICaller({
      httpsAgent: this.httpsAgent,
      logger: this.logger,
      token: options.token,
    });
  }

  _getRequestArray(queries) {
    return queries.map((query) =>
      this.throttle.add(this.apiCaller.makeRequest.bind(this.apiCaller, query))
    );
  }

  async makeRequests(queries) {
    const requestArray = this._getRequestArray(queries);
    const results = await Promise.allSettled(requestArray);
    return results.reduce((acc, result) => {
      if (result.status === 'fulfilled') acc.push(result.value);
      return acc;
    }, []);
  }
}

module.exports = APIMultiCaller;
