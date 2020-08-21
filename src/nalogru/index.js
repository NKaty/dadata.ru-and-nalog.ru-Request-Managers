// const { resolve } = require('path');
// const { createWriteStream } = require('fs');
// const MultiDownloader = require('./MultiDownloader');
// const Logger = require('../Logger');

// const queries = ['1659096539', '5043052387', '7707083893', '770708389'];

// const logger = new Logger(
//   resolve(__dirname, `../../logs/error.log`),
//   resolve(__dirname, `../../logs/success.log`),
//   'a'
// );
// const downloader = new MultiDownloader({
//   path: resolve(__dirname, `../../docs`),
//   logger,
// });
// downloader.getDocs(queries).catch(logger.log);
// downloader
//   .getMetaData(queries)
// .then((res) => {
//   const stream = createWriteStream(resolve(process.cwd(), 'input', 'input.txt'), { flags: 'a' });
//   res.forEach((item) => stream.write(`${item.inn}\n`));
// })
// .then(console.log)
// .catch(logger.log);

const MetaDataRequestManagerDb = require('./MetaDataRequestManagerDb');
new MetaDataRequestManagerDb({ dbFile: 'nalogru.db' }).start();
// new MetaDataManager({ dbFile: 'nalogru.db' }).getAllContent();
