const { resolve } = require('path');
const Parser = require('./Parser');

new Parser().parse(resolve(__dirname, `../../docs/7804671668.pdf`)).then(console.log);
