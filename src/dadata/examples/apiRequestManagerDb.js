// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The APIRequestManagerDb is designed to save the state between runs.
// So if you have more than 10000 requests to make or you want to retry request errors,
// you can run the script multiple times (for example, using a scheduler),
// each time instantiating APIRequestManagerDb class again.

const Manager = require('../APIRequestManagerDb');

const workingDir = process.argv[2];

// You must have dadata.ru token
const manager = new Manager({ workingDir, token: 'your token here', dbFile: 'dadata.db' });

manager.start().then(() => manager.start());

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

// If for some reasons not all requests were successful or
// a number of inns in input files are more than 10000 (free of charge),
// so request process will take some days,
// and if you want to write into output files json objects received so far
// manager.getCurrentResult();
// manager.cleanBeforeFinish().catch(console.log);

// You have used the script several cycles (by putting new input files) and accumulated data
// in the database and now you want to get all the data from the database
// manager.getAllContent();
// manager.cleanBeforeFinish().catch(console.log);
