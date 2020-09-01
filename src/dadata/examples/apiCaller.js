const APICaller = require('../APICaller');
const extractData = require('../extractData');

const apiCaller = new APICaller();

// Query as an object
apiCaller
  .makeRequest({
    query: '7707083893',
    count: 5,
  })
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch(console.log);

// Query as a string
apiCaller
  .makeRequest('1659096539')
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch(console.log);
