// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The PDFRequestManagerDb is designed to save the state between runs.
// So if you want to retry request errors, you can run the script multiple times,
// each time instantiating PDFRequestManagerDb class again.

const Manager = require('../PDFRequestManagerDb');

const workingDir = process.argv[2];

const manager = new Manager({ workingDir, dbFile: 'pdf.db' });

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
