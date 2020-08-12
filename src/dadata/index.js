const Manager = require('./Manager');

const workingDir = process.argv[2];

new Manager(workingDir).start().catch(console.log);
