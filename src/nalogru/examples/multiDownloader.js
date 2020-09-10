const { resolve } = require('path');

const Logger = require('../../common/Logger');
const Downloader = require('../MultiDownloader');

const logsDir = resolve(process.cwd(), 'logs');

const logger = new Logger({
  retryErrorPath: resolve(logsDir, `retryErrors.log`),
  validationErrorPath: resolve(logsDir, `validationErrors.log`),
  generalErrorPath: resolve(logsDir, `generalErrors.log`),
  successPath: resolve(logsDir, `success.log`),
});

// If logger is not passed, console.log will be used
const downloader = new Downloader({ logger });

// If param passing to getMetaObjects or getDocs methods is an object,
// query property is required, region and page properties are optional
// If param is a string, it is treated as query property

// Search for a word 'вода' in company name in regions with code 10 and 12 and
// take companies listed only on the second page and for a company with inn 1659096539
downloader
  .getMetadataObjects([{ query: 'вода', region: '10,12', page: '2' }, '1659096539'])
  .then(console.log)
  .catch((err) => logger.log('generalError', err));

// Download pdf document for a company with ogrn 1173525034121 and for a company with inn 1659096539
downloader
  .getDocs(['1173525034121', { query: '1659096539' }])
  .catch((err) => logger.log('generalError', err));
