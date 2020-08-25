const { resolve } = require('path');
const Logger = require('../common/Logger');

const logger = new Logger(
  resolve(__dirname, '../../logs', `retryErrors.log`),
  resolve(__dirname, '../../logs', `validationErrors.log`),
  resolve(__dirname, '../../logs', `generalErrors.log`),
  resolve(__dirname, '../../logs', `success.log`)
);

const queries = ['1659096539', '5043052387', '7707083893', '770708389'];
// const queries = ['колодым', 'стог'];
// const queries = 'колодец';

// const Downloader = require('./Downloader');
// const downloader = new Downloader({ logger });
// downloader
//   .getMetaObjects(queries)
//   .then(console.log)
//   .catch((err) => logger.log('generalError', err));
// downloader.getDocs(queries).catch((err) => logger.log('generalError', err));

const MultiDownloader = require('./MultiDownloader');
const downloader = new MultiDownloader({ logger });
downloader
  .getMetaObjects(queries)
  .then(console.log)
  .catch((err) => logger.log('generalError', err));
downloader.getDocs(queries).catch((err) => logger.log('generalError', err));

// const MetaDataRequestManagerDb = require('./MetaDataRequestManagerDb');
// new MetaDataRequestManagerDb({ dbFile: 'nalogru.db' }).start();
// new MetaDataManager({ dbFile: 'nalogru.db' }).getAllContent();

// const PDFRequestManagerDb = require('./PDFRequestManagerDb');
// new PDFRequestManagerDb({ dbFile: 'pdf.db' }).start();
