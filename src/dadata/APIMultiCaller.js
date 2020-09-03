/**
 * APIMultiCaller
 * Downloads information about companies and their branches from dadata.ru api.
 * Accepts array of queries.
 * Can search companies by inn, ogrn.
 * Can get information only for a main company (without branches).
 * Can search a specific branch of the company by kpp.
 * For more information see https://dadata.ru/api/find-party/
 **/

const { Agent } = require('https');
const PromiseThrottle = require('promise-throttle');
const APICaller = require('./APICaller');
const { ValidationError, RequestError, StopError } = require('../common/customErrors');

class APIMultiCaller {
  /**
   * APIMultiCaller class
   * @constructor
   * @param {Object} [options={}] - configuration settings
   * @param {string} [options.token=process.env.DADATA_API_KEY] - dadata.ru token
   * @param {number} [options.sockets=30] - maximum number of sockets to allow
   * @param {number} [options.requestsPerSecond=17] - maximum number of requests per second
   * @param {https.Agent} [options.httpsAgent=new Agent()] - https agent to manage connections
   * @param {Logger} [options.logger=console] - logger to log errors and success requests
   * @param {boolean} [options.isSuccessLogging=false] - log successful requests or not
   */
  constructor(options = {}) {
    // According to dadata.ru, maximum allowed number of new connections per minute is 60
    this.httpsAgent =
      options.httpsAgent ||
      new Agent({
        keepAlive: true,
        maxSockets: options.sockets || 30,
      });
    // According to dadata.ru, maximum allowed number of requests per second is 20
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

  /**
   * @desc Gets information for the companies found by query parameters
   * @param {Array.<(string|Object)>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as a query field
   * @returns {Promise} - Promise object represents an array of arrays of inns
   * or arrays of data objects, composed by status of result and type of errors
   */
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

  /**
   * @desc Gets information about the companies found by query parameters
   * @param {Array.<(string|Object)>} queries - an array of query parameters to search
   * If query parameter is a string, it will be treated as a query field
   * @returns {Promise} - Promise object represents an array of data objects
   */
  async getDataObjects(queries) {
    const results = await this.makeRequests(queries);
    return results[0].flat();
  }
}

module.exports = APIMultiCaller;
