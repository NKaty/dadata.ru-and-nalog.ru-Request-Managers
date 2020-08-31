/**
 * APICaller
 * Downloads information about a company and its branches from dadata.ru api.
 * Can search companies by inn, ogrn.
 * Can get information only about a main company (without branches).
 * Can search a specific branch of the company by kpp.
 * For more information see https://dadata.ru/api/find-party/
 **/

const fetch = require('node-fetch');
const dotenv = require('dotenv');
const { ValidationError, RequestError, StopError } = require('../common/customErrors');

dotenv.config();

class APICaller {
  /**
   * APICaller class
   * @constructor
   * @param {Object} [options] - configuration settings
   * @param {string} [options.token] - dadata.ru token
   * @param {https.Agent} [options.httpsAgent] - https agent to manage connections
   * @param {Logger} [options.logger] - logger to log errors and success requests
   * @param {boolean} [options.isSuccessLogging] - log successful requests or not
   */
  constructor(options = {}) {
    this.url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';
    // In order to make requests to dadata.ru api, token is required
    this.token = options.token || process.env.DADATA_API_KEY;
    this.httpsAgent = options.httpsAgent || null;
    this.logger = options.logger || console;
    // Log successful requests or not
    this.isSuccessLogging = options.isSuccessLogging || false;
    this.requestOptions = {
      method: 'POST',
      agent: this.httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${this.token}`,
      },
    };
  }

  _getRequestBody(query) {
    if (typeof query === 'string') return { query };
    return query;
  }

  /**
   * @desc Gets information about the company found by query parameters
   * @param {(string|Object)} query - query parameters to search
   * If params is a string, it will be treated as a query field
   * @returns {Promise} - Promise object represents data object
   */
  async makeRequest(query) {
    const requestBody = this._getRequestBody(query);
    const options = { ...this.requestOptions, body: JSON.stringify(requestBody) };
    const info = requestBody.kpp ? `${requestBody.query} ${requestBody.kpp}` : requestBody.query;

    try {
      const response = await fetch(this.url, options);

      if (response.status === 403) throw new StopError('Daily request limit is exceeded.');
      if (response.status === 429) {
        throw new StopError('Request frequency or number of new connections is exceeded.');
      }
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 405 ||
        response.status === 413
      ) {
        throw new ValidationError(`Invalid request. ${response.statusText}`);
      }
      if (!response.ok) throw new RequestError(response.statusText);

      const json = await response.json();

      if (json.suggestions && json.suggestions.length === 0)
        throw new ValidationError('Invalid inn or there is no data in dadata.');

      if (this.isSuccessLogging) {
        if (json.suggestions && json.suggestions[0].data)
          this.logger.log('success', `${json.suggestions[0].data.inn} Data is received.`);
      }

      return json.suggestions;
    } catch (err) {
      if (err instanceof ValidationError) {
        this.logger.log('validationError', err, info);
        throw new ValidationError(info);
      } else if (err instanceof StopError) {
        this.logger.log('retryError', err, info);
        throw new StopError(info);
      } else {
        this.logger.log('retryError', err, info);
        throw new RequestError(info);
      }
    }
  }
}

module.exports = APICaller;
