// const Manager = require('./Manager');
const Manager = require('./ManagerDb');

const workingDir = process.argv[2];

new Manager(workingDir).start().catch(console.log);
