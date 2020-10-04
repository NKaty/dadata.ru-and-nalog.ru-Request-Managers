// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The APIRequestManager is designed to save the state between runs.
// So if you have more than 10000 requests to make or you want to retry request errors,
// you can run the script multiple times (for example, using a scheduler),
// each time instantiating APIRequestManager class again.

const Manager = require('../APIRequestManager');

const workingDir = process.argv[2];

// You must have dadata.ru token
const manager = new Manager({ workingDir, token: 'your token here' });

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
