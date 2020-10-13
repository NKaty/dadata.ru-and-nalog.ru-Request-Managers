const { resolve } = require('path');
const ParsingManager = require('../ParsingManager');
const extractData = require('../extractData');

const workingDir = process.argv[2];

// inputPath is a path to a directory with egrul pdf files to parse
// extractData is a function that allows to extract the required fields from data objects
const manager = new ParsingManager({
  workingDir,
  inputPath: resolve(workingDir, 'docs'),
  extractData,
});

manager.start().catch(console.log);

// The database can accumulate data parsed over several executions

// So you can get currently parsed data
// As json files
manager.getResult().catch(console.log);

// As arrays od data objects of required length
(async function () {
  for await (const data of manager.getResultAsArrays()) {
    console.log(data);
  }
})();

// Or you can get all data accumulated in the database
// As json files
manager.getAllContent().catch(console.log);

// As arrays od data objects of required length
(async function () {
  for await (const data of manager.getAllContentAsArrays()) {
    console.log(data);
  }
})();
