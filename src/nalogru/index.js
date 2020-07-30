const MultiDownloader = require('./MultiDownloader');

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

const downloader = new MultiDownloader();
// downloader.getDocs(queries).catch(console.log);
downloader.getMetaObject(queries).then(console.log).catch(console.log);
