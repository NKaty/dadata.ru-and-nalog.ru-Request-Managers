const APICaller = require('../APICaller');
const extractData = require('../extractData');

// If logger is not passed, console.log will be used
// You must have dadata.ru token
const apiCaller = new APICaller({ token: 'your token here' });

// Query as an object
// Search for a company with inn 7707083893, get 5 branches
apiCaller
  .makeRequest({
    query: '7707083893',
    count: 5,
  })
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch(console.log);

// Query as a string
// Search for a company with ogrn 1173525034121
apiCaller
  .makeRequest('1173525034121')
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch(console.log);
