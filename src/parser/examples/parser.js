const Parser = require('../Parser');

const parser = new Parser();

// Parse egrul or egrip pdf file
parser
  .parse('path_to_pdf_file')
  .then((data) => console.log(JSON.stringify(data, null, 2)))
  .catch((err) => console.log(err));
