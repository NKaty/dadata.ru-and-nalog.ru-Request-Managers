const { resolve } = require('path');
const { existsSync, mkdirSync } = require('fs');

const Logger = require('../../common/Logger');
const APICaller = require('../APIMultiCaller');
const extractData = require('../extractData');

const logsDir = resolve(process.cwd(), 'logs');
if (!existsSync(logsDir)) mkdirSync(logsDir);

const logger = new Logger({
  retryErrorPath: resolve(logsDir, `retryErrors.log`),
  validationErrorPath: resolve(logsDir, `validationErrors.log`),
  generalErrorPath: resolve(logsDir, `generalErrors.log`),
  successPath: resolve(logsDir, `success.log`),
});

// If logger is not passed, console.log will be used
// You must have dadata.ru token
const apiCaller = new APICaller({ logger, token: 'your token here', isSuccessLogging: true });

// Queries is an array of objects and strings
// Search for a company with inn 7707083893, get 5 branches
// and for a company with ogrn 1173525034121
apiCaller
  .getDataObjects([
    {
      query: '7707083893',
      count: 5,
    },
    '1173525034121',
  ])
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch((err) => logger.log('generalError', err));
