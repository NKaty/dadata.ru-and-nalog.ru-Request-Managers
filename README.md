# Request Managers, Parsing Manager
#### Реализованы классы, позволяющие получать сведения об организациях, ЕГРЮЛ и ЕГРИП pdf файлы путем обращения к dadata.ru api и к сайту nalog.ru и парсить полученные ЕГРЮЛ и ЕГРИП pdf файлы.
Проект состоит из 4 директорий:
- common - содержит базовые классы, logger и helpers 
- dadata - содержит классы для обращения к [dadata.ru](https://dadata.ru/api/find-party/) API
- nalogru - содержит классы для обращения к [nalog.ru](https://egrul.nalog.ru/index.html) сайту
- parser - содержит классы для парсинга ЕГРЮЛ и ЕГРИП pdf файлов, скаченных с [nalog.ru](https://egrul.nalog.ru/index.html)
## dadata.ru Классы
#### APICaller
Позволяет делать единичные запросы к api.

[Примеры использования](src/dadata/examples/apiCaller.js)
```javascript
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
```
#### APIMultiCaller
Позволяет делать несколько параллельных запросов к api.

[Примеры использования](src/dadata/examples/apiMultiCaller.js)
```javascript
const { resolve } = require('path');
const { existsSync, mkdirSync } = require('fs');

const Logger = require('../../common/Logger');
const APICaller = require('../APIMultiCaller');
const extractData = require('../extractData');

const logsDir = resolve(process.cwd(), 'logs');
if (!existsSync(logsDir)) mkdirSync(logsDir);

const logger = new Logger({
  retryErrorPath: resolve(logsDir, `retryErrors.log`),
  validationErrorPath: resolve(logsDir, `validationErrors.log`),
  generalErrorPath: resolve(logsDir, `generalErrors.log`),
  successPath: resolve(logsDir, `success.log`),
});

// If logger is not passed, console.log will be used
// You must have dadata.ru token
const apiCaller = new APICaller({ logger, token: 'your token here', isSuccessLogging: true });

// Queries is an array of objects and strings
// Search for a company with inn 7707083893, get 5 branches
// and for a company with ogrn 1173525034121
apiCaller
  .getDataObjects([
    {
      query: '7707083893',
      count: 5,
    },
    '1173525034121',
  ])
  .then((data) => data.forEach((item) => console.log(extractData(item))))
  .catch((err) => logger.log('generalError', err));
```
#### APIRequestManager
Позволяет управлять запросами к api по ИНН (ИНН и КПП) организаций, в том числе читать ИНН (ИНН и КПП) из файлов, делать запросы к api, записывать полученные данные в json файлы, логировать ошибки и успешные запросы (с помощью класса Logger), получать отчеты о выполненных запросах.

[Примеры использования](src/dadata/examples/apiRequestManager.js)
```javascript
// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The APIRequestManager is designed to save the state between runs.
// So if you have more than 10000 requests to make or you want to retry request errors,
// you can run the script multiple times (for example, using a scheduler),
// each time instantiating APIRequestManager class again.

const Manager = require('../APIRequestManager');

const workingDir = process.argv[2];

// You must have dadata.ru token
const manager = new Manager({ workingDir, token: 'your token here' });

manager.start().catch(console.log);

// Or you can run start method multiple times and check errors
// with help of endedWithRetryErrors and endedWithStopError properties
(async function () {
  let doStart = true;
  while (doStart) {
    await manager.start();
    if (manager.endedWithStopError) return;
    doStart = manager.endedWithRetryErrors;
  }
})();
```
#### APIRequestManagerDb
Позволяет управлять запросами к api по ИНН организаций с помощью sqlite базы данных, в том числе читать ИНН из файлов, делать запросы к api, записывать полученные данные в json файлы, логировать ошибки и успешные запросы (с помощью класса Logger), получать отчеты о выполненных запросах.
В отличие от APIRequestManager, не позволяет делать запросы по ИНН и КПП, но позволяет накапливать сведения об организациях в базе данных.

[Примеры использования](src/dadata/examples/apiRequestManagerDb.js)
```javascript
// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The APIRequestManagerDb is designed to save the state between runs.
// So if you have more than 10000 requests to make or you want to retry request errors,
// you can run the script multiple times (for example, using a scheduler),
// each time instantiating APIRequestManagerDb class again.

const Manager = require('../APIRequestManagerDb');

const workingDir = process.argv[2];

// You must have dadata.ru token
const manager = new Manager({ workingDir, token: 'your token here', dbFile: 'dadata.db' });

manager.start().catch(console.log);

// Or you can run start method multiple times and check errors
// with help of endedWithRetryErrors and endedWithStopError properties
(async function () {
  let doStart = true;
  while (doStart) {
    await manager.start();
    if (manager.endedWithStopError) return;
    doStart = manager.endedWithRetryErrors;
  }
})();

// If for some reasons not all requests were successful or
// a number of inns in input files are more than 10000 (free of charge),
// so request process will take some days,
// and if you want to write into output files json objects received so far
manager.getCurrentResult();
manager.cleanBeforeFinish().catch(console.log);

// You have used the script several cycles (by putting new input files) and accumulated data
// in the database and now you want to get all the data from the database
manager.getAllContent();
manager.cleanBeforeFinish().catch(console.log);
```
## nalog.ru Классы
#### Downloader
Позволяет делать единичный поиск и получать сведения и выписки для найденных организаций.

[Примеры использования](src/nalogru/examples/downloader.js)
```javascript
const { resolve } = require('path');
const { existsSync, mkdirSync } = require('fs');

const Logger = require('../../common/Logger');
const Downloader = require('../Downloader');

const logsDir = resolve(process.cwd(), 'logs');
if (!existsSync(logsDir)) mkdirSync(logsDir);

const logger = new Logger({
  retryErrorPath: resolve(logsDir, `retryErrors.log`),
  validationErrorPath: resolve(logsDir, `validationErrors.log`),
  generalErrorPath: resolve(logsDir, `generalErrors.log`),
  successPath: resolve(logsDir, `success.log`),
});

const outputPath = resolve(process.cwd(), 'output');
if (!existsSync(outputPath)) mkdirSync(outputPath);

// If logger is not passed, console.log will be used
const downloader = new Downloader({ outputPath, logger });

// If param passing to getMetadataObjects or getDocs methods is an object,
// query property is required, region and page properties are optional
// If param passing is a string, it is treated as query property

// Search for a word 'вода' in company name in regions with code 10 and 12 and
// take companies listed only on the second page
downloader
  .getMetadataObjects({ query: 'вода', region: '10,12', page: '2' })
  .then(console.log)
  .catch((err) => logger.log('generalError', err));

// Download pdf document for a company with inn 1659096539
downloader.getDocs('1659096539').catch((err) => logger.log('generalError', err));
```
#### MultiDownloader
Позволяет делать несколько параллельных (очень условно, так как приходится выдерживать паузы между запросами, чтобы сайт не начал запрашивать капчу) поисков и получать сведения и выписки для найденных организаций.

[Примеры использования](src/nalogru/examples/multiDownloader.js)
```javascript
const { resolve } = require('path');
const { existsSync, mkdirSync } = require('fs');

const Logger = require('../../common/Logger');
const Downloader = require('../MultiDownloader');

const logsDir = resolve(process.cwd(), 'logs');
if (!existsSync(logsDir)) mkdirSync(logsDir);

const logger = new Logger({
  retryErrorPath: resolve(logsDir, `retryErrors.log`),
  validationErrorPath: resolve(logsDir, `validationErrors.log`),
  generalErrorPath: resolve(logsDir, `generalErrors.log`),
  successPath: resolve(logsDir, `success.log`),
});

const outputPath = resolve(process.cwd(), 'output');
if (!existsSync(outputPath)) mkdirSync(outputPath);

// If logger is not passed, console.log will be used
const downloader = new Downloader({ outputPath, logger });

// If param passing to getMetadataObjects or getDocs methods is an object,
// query property is required, region and page properties are optional
// If param is a string, it is treated as query property

// Search for a word 'вода' in company name in regions with code 10 and 12 and
// take companies listed only on the second page and for a company with inn 1659096539
downloader
  .getMetadataObjects([{ query: 'вода', region: '10,12', page: '2' }, '1659096539'])
  .then(console.log)
  .catch((err) => logger.log('generalError', err));

// Download pdf document for a company with ogrn 1173525034121 and for a company with inn 1659096539
downloader
  .getDocs(['1173525034121', { query: '1659096539' }])
  .catch((err) => logger.log('generalError', err));
```
#### MetadataRequestManagerDb
Позволяет управлять процессом получения сведений об организациях по ИНН с помощью sqlite базы данных, в том числе читать ИНН из файлов, делать поиск, записывать полученные данные в json файлы, логировать ошибки и успешные запросы (с помощью класса Logger), получать отчеты о выполненных запросах.

Так как получаемые сведения являются побочным продуктом процесса скачивания выписок из ЕГРЮЛ и ЕГРИП, объем сведений ограничен следующими полями: полное наименование, сокращенное наименование, адрес, ОГРН, дата получения ОГРН, ИНН, КПП, должность и имя руководителя, тип организации, дата ликвидации, дата признания организации недействительной.

[Примеры использования](src/nalogru/examples/metadataRequestManagerDb.js)
```javascript
// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The MetadataRequestManagerDb is designed to save the state between runs.
// So if you want to retry request errors, you can run the script multiple times,
// each time instantiating MetadataRequestManagerDb class again.

const Manager = require('../MetadataRequestManagerDb');

const workingDir = process.argv[2];

const manager = new Manager({ workingDir, dbFile: 'nalogru.db' });

manager.start().catch(console.log);

// Or you can run start method multiple times and check errors
// with help of endedWithRetryErrors and endedWithStopError properties
(async function () {
  let doStart = true;
  while (doStart) {
    await manager.start();
    if (manager.endedWithStopError) return;
    doStart = manager.endedWithRetryErrors;
  }
})();

// If for some reasons not all requests were successful
// and you want to write into output files json objects received so far
manager.getCurrentResult();
manager.cleanBeforeFinish().catch(console.log);

// You have used the script several cycles (by putting new input files) and accumulated data
// in the database and now you want to get all the data from the database
manager.getAllContent();
manager.cleanBeforeFinish().catch(console.log);
```
#### PDFRequestManagerDb
Позволяет управлять процессом скачивания выписок из ЕГРЮЛ и ЕГРИП по ИНН с помощью sqlite базы данных, в том числе читать ИНН из файлов, делать поиск, скачивать найденные выписки, логировать ошибки и успешные скачивания (с помощью класса Logger), получать отчеты о выполненных скачиваниях.

[Примеры использования](src/nalogru/examples/pdfRequestManagerDb.js)
```javascript
// Run the script for the first time to create directory structure,
// then put files with inns into input directory and run the script again.
// Or you can create input directory in your workingDir,
// put files with inns there and run the script.
// The PDFRequestManagerDb is designed to save the state between runs.
// So if you want to retry request errors, you can run the script multiple times,
// each time instantiating PDFRequestManagerDb class again.

const Manager = require('../PDFRequestManagerDb');

const workingDir = process.argv[2];

const manager = new Manager({ workingDir, dbFile: 'pdf.db' });

manager.start().catch(console.log);

// Or you can run start method multiple times and check errors
// with help of endedWithRetryErrors and endedWithStopError properties
(async function () {
  let doStart = true;
  while (doStart) {
    await manager.start();
    if (manager.endedWithStopError) return;
    doStart = manager.endedWithRetryErrors;
  }
})();
```
## Parser Классы
#### Parser
Позволяет парсить скаченные с nalog.ru ЕГРЮЛ и ЕГРИП pdf файлы.

[Примеры использования](src/parser/examples/parser.js)
```javascript
const Parser = require('../Parser');

const parser = new Parser();

// Parse egrul or egrip pdf file
parser
  .parse('path_to_pdf_file')
  .then((data) => console.log(JSON.stringify(data, null, 2)))
  .catch((err) => console.log(err));
```
#### Parsing Manager
Позволяет управлять процессом парсинга скаченных с nalog.ru ЕГРЮЛ и ЕГРИП pdf файлов с помощью sqlite базы данных и worker thread pool, в том числе читать директорию с pdf файлами, парсить их в нескольких worker threads, логировать ошибки и успешный парсинг, получать отчеты о выполненном парсинге.

[Примеры использования](src/parser/examples/parsingManager.js)
```javascript
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
manager.getResult().catch(console.log);

// As arrays od data objects of required length
(async function () {
  for await (const data of manager.getResultAsArrays()) {
    for (const item of data) {
      console.log(JSON.stringify(item, null, 2));
    }
  }
})();

// Or you can get all data accumulated in the database
// As json files
manager.getAllContent().catch(console.log);

// As arrays od data objects of required length
(async function () {
  for await (const data of manager.getAllContentAsArrays()) {
    for (const item of data) {
      console.log(JSON.stringify(item, null, 2));
    }
  }
})();
```

## Установка
1. Клонируйте репозиторий

    ```git clone https://github.com/NKaty/dadata.ru-and-nalog.ru-Request-Managers.git managers```
2. Перейдите в директорию с проектом

    ```cd managers```
3. Установите зависимости

    ```npm install```

## Документация
- [API](docs/api.md)
- [Описание свойств объекта, получаемого при парсинге ЕГРЮЛ и ЕГРИП выписок](docs/map.md)
