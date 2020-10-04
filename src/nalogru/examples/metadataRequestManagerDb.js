// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The MetadataRequestManagerDb is designed to save the state between runs.
// So if you want to retry request errors, you can run the script multiple times,
// each time instantiating MetadataRequestManagerDb class again.

const Manager = require('../MetadataRequestManagerDb');

const workingDir = process.argv[2];

const manager = new Manager({ workingDir, dbFile: 'nalogru.db' });

manager.start().catch(console.log);

// Or you can run start method multiple times and check errors
// with help of endedWithRetryErrors and endedWithStopError properties
// (async function () {
//   let doStart = true;
//   while (doStart) {
//     await manager.start();
//     if (manager.endedWithStopError) return;
//     doStart = manager.endedWithRetryErrors;
//   }
// })();

// If for some reasons not all requests were successful
// and you want to write into output files json objects received so far
// manager.getCurrentResult();
// manager.cleanBeforeFinish().catch(console.log);

// You have used the script several cycles (by putting new input files) and accumulated data
// in the database and now you want to get all the data from the database
// manager.getAllContent();
// manager.cleanBeforeFinish().catch(console.log);
