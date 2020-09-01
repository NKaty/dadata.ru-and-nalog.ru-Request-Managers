const { resolve } = require('path');

const Logger = require('../../common/Logger');
const APICaller = require('../APIMultiCaller');
const extractData = require('../extractData');

const logsDir = resolve(process.cwd(), 'logs');

const logger = new Logger({
  retryErrorPath: resolve(logsDir, `retryErrors.log`),
  validationErrorPath: resolve(logsDir, `validationErrors.log`),
  generalErrorPath: resolve(logsDir, `generalErrors.log`),
  successPath: resolve(logsDir, `success.log`),
});

// If logger is not passed, console.log will be used
const apiCaller = new APICaller({ logger, isSuccessLogging: true });

// Queries is an array of objects and strings
apiCaller
  .getDataObjects([
    {
      query: '7707083893',
      count: 5,
    },
    '1659096539',
  ])
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch((err) => logger.log('generalError', err));
