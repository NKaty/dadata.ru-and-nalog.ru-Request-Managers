const Manager = require('../APIRequestManager');

const workingDir = process.argv[2];

// You must have dadata.ru token
const manager = new Manager({ workingDir, token: 'your token here' });

// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again
// Or you can create input directory in your workingDir,
// put files with inns there and run the script
manager.start().catch(console.log);
