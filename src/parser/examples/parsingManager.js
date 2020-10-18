const ParsingManager = require('../ParsingManager');
const extractData = require('../extractData');

// inputPath is a path to a directory with egrul and egrip pdf files to parse
// extractData is a function that allows to extract the required fields from data objects
const manager = new ParsingManager({
  inputPath: 'path_to_directory_with_pdf_files',
  extractData,
});

manager.start().catch(console.log);

// The database can accumulate data parsed over several executions

// So you can get currently parsed data
// As json files
// manager.getResult().catch(console.log);

// As arrays od data objects of required length
// (async function () {
//   for await (const data of manager.getResultAsArrays()) {
//     for (const item of data) {
//       console.log(JSON.stringify(item, null, 2));
//     }
//   }
// })();

// Or you can get all data accumulated in the database
// As json files
// manager.getAllContent().catch(console.log);

// As arrays od data objects of required length
// (async function () {
//   for await (const data of manager.getAllContentAsArrays()) {
//     for (const item of data) {
//       console.log(JSON.stringify(item, null, 2));
//     }
//   }
// })();
