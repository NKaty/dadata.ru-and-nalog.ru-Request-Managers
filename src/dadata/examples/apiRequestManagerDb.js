const Manager = require('../APIRequestManagerDb');

const workingDir = process.argv[2];

// You must have dadata.ru token
const manager = new Manager({ workingDir, token: 'your token here', dbFile: 'dadata.db' });

// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again
// Or you can create input directory in your workingDir,
// put files with inns there and run the script
manager.start().catch(console.log);

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
