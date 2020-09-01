const Manager = require('../APIRequestManager');

const workingDir = process.argv[2];

const manager = new Manager({ workingDir });

// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again
// Or you can create input directory in your workingDir,
// put files with inns there and run the script
manager.start().catch(console.log);
