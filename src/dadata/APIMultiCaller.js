const { Agent } = require('https');
const PromiseThrottle = require('promise-throttle');
const APICaller = require('./APICaller');
const { ValidationError, RequestError, StopError } = require('./customErrors');

class APIMultiCaller {
  constructor(options = {}) {
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 30,
      });
    this.throttle = new PromiseThrottle({
      requestsPerSecond: options.requestsPerSecond || 17,
      promiseImplementation: Promise,
    });
    this.logger = options.logger || console;
    this.apiCaller = new APICaller({
      httpsAgent: this.httpsAgent,
      logger: this.logger,
      isSuccessLogging: options.isSuccessLogging || false,
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
    return results.reduce(
      (acc, result) => {
        if (result.status === 'fulfilled') acc[0].push(result.value);
        else if (result.reason instanceof RequestError) acc[1].push(result.reason.message);
        else if (result.reason instanceof StopError) acc[2].push(result.reason.message);
        else if (result.reason instanceof ValidationError) acc[3].push(result.reason.message);
        return acc;
      },
      [[], [], [], []]
    );
  }
}

module.exports = APIMultiCaller;
