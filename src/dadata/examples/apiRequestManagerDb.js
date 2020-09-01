const Manager = require('../APIRequestManagerDb');

const workingDir = process.argv[2];

const manager = new Manager({ workingDir, dbFile: 'dadata.db' });

// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again
// Or you can create input directory in your workingDir,
// put files with inns there and run the script
manager.start().catch(console.log);

// If inns in input files more than 10000 (free of charge) and request process takes some days
// and you want to write into output files json objects received so far
// manager.getCurrentResult();

// You have used the script several cycles (by putting new input files) and accumulated data
// in the database and now you want to get all the data from the database
// manager.getAllContent();
