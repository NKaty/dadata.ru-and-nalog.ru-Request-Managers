// const Manager = require('./APIRequestManager');
const Manager = require('./APIRequestManagerDb');

const workingDir = process.argv[2];

new Manager({ workingDir, dbFile: 'dadata.db' }).start().catch(console.log);
