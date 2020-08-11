const fetch = require('node-fetch');
const dotenv = require('dotenv');
const { ValidationError, RequestError, StopError } = require('./customErrors');

dotenv.config();

class APICaller {
  constructor(options = {}) {
    this.url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';
    this.token = options.token || process.env.DADATA_API_KEY;
    this.httpsAgent = options.httpsAgent || null;
    this.logger = options.logger || console;
    this.isSuccessLogging = options.isSuccessLogging || false;
    this.requestOptions = {
      method: 'POST',
      // mode: 'cors',
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
    else return query;
  }

  async makeRequest(query) {
    const requestBody = this._getRequestBody(query);
    const options = { ...this.requestOptions, body: JSON.stringify(requestBody) };

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
        throw new ValidationError('Invalid inn.');

      if (this.isSuccessLogging) {
        if (json.suggestions && json.suggestions[0].data)
          this.logger.log('success', `${json.suggestions[0].data.inn} Data is received.`);
      }

      return json.suggestions;
    } catch (err) {
      if (err instanceof ValidationError) {
        this.logger.log('validationError', err, requestBody.query);
        throw new ValidationError(requestBody.query);
      } else if (err instanceof StopError) {
        this.logger.log('retryError', err, requestBody.query);
        throw new StopError(requestBody.query);
      } else {
        this.logger.log('retryError', err, requestBody.query);
        throw new RequestError(requestBody.query);
      }
    }
  }
}

module.exports = APICaller;
