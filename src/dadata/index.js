const { resolve } = require('path');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('../Logger');

const queries = [
  '1659096539',
  '5043052387',
  '7804671668',
  '7724322990',
  '3808202740',
  '1650391240',
  '1513041445',
  { query: '7707083893', branch_type: 'MAIN' },
];

const logger = new Logger(
  resolve(__dirname, `../../logs/error.log`),
  resolve(__dirname, `../../logs/success.log`),
  'a'
);

const apiMultiCaller = new APIMultiCaller({ logger });
apiMultiCaller.makeRequests(queries).then(console.log).catch(logger.log);
