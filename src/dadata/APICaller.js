const fetch = require('node-fetch');
const dotenv = require('dotenv');
const { ValidationError, RequestError } = require('./customErrors');

dotenv.config();

class APICaller {
  constructor(options = {}) {
    this.url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';
    this.token = options.token || process.env.DADATA_API_KEY;
    this.httpsAgent = options.httpsAgent || null;
    this.logger = options.logger || console;
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
      const json = await response.json();
      if (json.suggestions && json.suggestions.length === 0)
        throw new ValidationError('Invalid inn.');
      if (json.suggestions && json.suggestions[0].data)
        this.logger.log(`${json.suggestions[0].data.inn} Data is received.`);
      return json.suggestions;
    } catch (err) {
      this.logger.log(err, requestBody.query);
      if (err instanceof ValidationError) throw err;
      else throw new RequestError(requestBody.query);
    }
  }
}

module.exports = APICaller;
