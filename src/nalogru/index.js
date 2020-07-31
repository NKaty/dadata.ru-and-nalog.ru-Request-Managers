const { resolve } = require('path');
const MultiDownloader = require('./MultiDownloader');
const Logger = require('../Logger');

const queries = [
  '1659096539',
  '5043052387',
  '7804671668',
  '7724322990',
  '3808202740',
  '1650391240',
  '1513041445',
  '7707083893',
];

const logger = new Logger(
  resolve(__dirname, `../../logs/error.log`),
  resolve(__dirname, `../../logs/success.log`),
  'a'
);
const downloader = new MultiDownloader({
  path: resolve(__dirname, `../../docs`),
  logger,
});
downloader.getDocs(queries).catch(logger.log);
// downloader.getMetaObject(queries).then(console.log).catch(logger.log);
