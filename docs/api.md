# API
- [class APICaller](#class-apicaller)
- [class APIMultiCaller](#class-apimulticaller)
- [class APIRequestManager](#class-apirequestmanager)
- [class APIRequestManagerDb](#class-apirequestmanagerdb)
- [class Downloader](#class-downloader)
- [class MultiDownloader](#class-multidownloader)
- [class MetadataRequestManagerDb](#class-metadatarequestmanagerdb)
- [class PDFRequestManagerDb](#class-pdfrequestmanagerdb)
- [class Parser](#class-parser)
- [class ParsingManager](#class-parsingmanager)
- [class WorkerPool](#class-workerpool)
- [class Logger](#class-logger)

## Class APICaller
### new APICaller([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.token] | <code>string</code> | <code>process.env.DADATA_API_KEY</code> | dadata.ru token |
| [options.httpsAgent] | <code>https.Agent</code> | <code>null</code> | https agent to manage connections |
| [options.logger] | <code>Logger</code> | <code>console</code> | logger to log errors and success requests |
| [options.isSuccessLogging] | <code>boolean</code> | <code>false</code> | log successful requests or not |

### apiCaller.makeRequest(query) ⇒ <code>Promise</code>
Gets information about the company found by query parameters

**Returns**: <code>Promise</code> - promise object represents data object  
**Throws**:

- <code>ValidationError</code> - if an invalid request was made
- <code>StopError</code> - if the rules of dadata.ru were violated
- <code>RequestError</code> - if network errors occurred

| Param | Type | Description |
| --- | --- | --- |
| query | <code>string&#124;Object</code> | query parameters to search. If params is a string, it will be treated as a query field |

## Class APIMultiCaller
### new APIMultiCaller([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.token] | <code>string</code> | <code>process.env.DADATA_API_KEY</code> | dadata.ru token |
| [options.sockets] | <code>number</code> | <code>30</code> | maximum number of sockets to allow |
| [options.requestsPerSecond] | <code>number</code> | <code>17</code> | maximum number of requests per second |
| [options.httpsAgent] | <code>https.Agent</code> | <code>new Agent()</code> | https agent to manage connections |
| [options.logger] | <code>Logger</code> | <code>console</code> | logger to log errors and success requests |
| [options.isSuccessLogging] | <code>boolean</code> | <code>false</code> | log successful requests or not |

### apiMultiCaller.makeRequests(queries) ⇒ <code>Promise</code>
Gets information for the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents an array of arrays of inns or arrays of data objects, composed by status of result and type of errors

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;(string&#124;Object)&gt;</code> | an array of query parameters to search. If query parameter is a string, it will be treated as a query field |

### apiMultiCaller.getDataObjects(queries) ⇒ <code>Promise</code>
Gets information about the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents an array of data objects

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;(string&#124;Object)&gt;</code> | an array of query parameters to search. If query parameter is a string, it will be treated as a query field |

## Class APIRequestManager
### new APIRequestManager([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.inputDir] | <code>string</code> | <code>&quot;input&quot;</code> | name of directory with input files |
| [options.outputDir] | <code>string</code> | <code>&quot;output&quot;</code> | name of directory with output files |
| [options.logsDir] | <code>string</code> | <code>&quot;logs&quot;</code> | name of directory with logs files |
| [options.reportsDir] | <code>string</code> | <code>&quot;reports&quot;</code> | name of directory with reports |
| [options.tempDir] | <code>string</code> | <code>&quot;temp&quot;</code> | name of directory with with temporary files  required for the process to run |
| [options.workingDir] | <code>string</code> | <code>process.cwd()</code> | path to directory where  all other directories and files will be created |
| [options.requestsPerDay] | <code>number</code> | <code>8000</code> | number of requests per day |
| [options.withBranches] | <code>boolean</code> | <code>false</code> | also get information for branches or not |
| [options.branchesCount] | <code>number</code> | <code>20</code> | how many branches to get information for |
| [options.innPerFile] | <code>number</code> | <code>500</code> | number of inns per prepared file for requesting  and number of json objects per output file |
| [options.requestsLength] | <code>number</code> | <code>100</code> | number of requests simultaneously sent and processed |
| [options.failureRate] | <code>number</code> | <code>0.5</code> | failure rate of request to wait or stop |
| [options.requestsLengthToCheckFailureRate] | <code>number</code> | <code>5</code> | minimum number of requests sent  simultaneously to check failure rate |
| [options.timeToWaitBeforeNextAttempt] | <code>number</code> | <code>30 * 60 * 1000</code> | time in milliseconds  to wait for the first time failure rate is exceeded |

### apiRequestManager.start() ⇒ <code>Promise</code>
Launches the request process

**Returns**: <code>Promise</code> - promise object represents void

## Class APIRequestManagerDb
### new APIRequestManagerDb([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.inputDir] | <code>string</code> | <code>&quot;input&quot;</code> | name of directory with input files |
| [options.outputDir] | <code>string</code> | <code>&quot;output&quot;</code> | name of directory with output files |
| [options.logsDir] | <code>string</code> | <code>&quot;logs&quot;</code> | name of directory with logs files |
| [options.reportsDir] | <code>string</code> | <code>&quot;reports&quot;</code> | name of directory with reports |
| [options.dbFile] | <code>string</code> | <code>&quot;data.db&quot;</code> | name of sqlite database file |
| [options.workingDir] | <code>string</code> | <code>process.cwd()</code> | path to directory where  all other directories and files will be created * @param {number} [options.requestsLength=100] - number of requests simultaneously sent and processed |
| [options.failureRate] | <code>number</code> | <code>0.5</code> | failure rate of request to wait or stop |
| [options.requestsLengthToCheckFailureRate] | <code>number</code> | <code>5</code> | minimum number of requests sent  simultaneously to check failure rate |
| [options.timeToWaitBeforeNextAttempt] | <code>number</code> | <code>30 * 60 * 1000</code> | time in milliseconds  to wait for the first time failure rate is exceeded |
| [options.cleanDB] | <code>boolean</code> | <code>false</code> | clean or not the table with json data |
| [options.updateMode] | <code>boolean</code> | <code>true</code> | update or not json data for inns if json data  for these inns already exist in db |
| [options.innPerFile] | <code>number</code> | <code>500</code> | number of json objects per output file |
| [options.requestsPerDay] | <code>number</code> | <code>8000</code> | number of requests per day |
| [options.withBranches] | <code>boolean</code> | <code>false</code> | also get information for branches or not |
| [options.branchesCount] | <code>number</code> | <code>20</code> | how many branches to get information for |

### apiRequestManagerDb.writeReport() ⇒ <code>void</code>
Writes a report with statistics on downloads

### apiRequestManagerDb.writeErrors() ⇒ <code>void</code>
Writes a file with a list of inns, on which some network error occurred and they require re-request, and a file with a list of invalid inns

### apiRequestManagerDb.generateReport() ⇒ <code>void</code>
Writes a report with statistics on downloads and files with lists of inns with errors

### apiRequestManagerDb.getCurrentResult() ⇒ <code>void</code>
Writes output files with json data for requests completed successfully so far

### apiRequestManagerDb.getAllContent() ⇒ <code>void</code>
Writes output files with all json data from jsons table

### apiRequestManagerDb.cleanBeforeFinish() ⇒ <code>void</code>
Cleans after the request process

### apiRequestManagerDb.start() ⇒ <code>Promise</code>
Launches the request process

**Returns**: <code>Promise</code> - promise object represents void

## Class Downloader
### new Downloader([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.outputPath] | <code>string</code> | <code>null</code> | path to download pdf files |
| [options.sockets] | <code>number</code> | <code>1</code> | maximum number of sockets to allow |
| [options.pause] | <code>number</code> | <code>1500</code> | pause between requests in milliseconds |
| [options.httpsAgent] | <code>https.Agent</code> | <code>new Agent()</code> | https agent to manage connections |
| [options.logger] | <code>Logger</code> | <code>console</code> | logger to log errors and success requests |

### downloader.getMetadataByInn(inn) ⇒ <code>Promise</code>
Gets company metadata by its inn. It is assumed, that only one company can be found, so length of the array of meta dada objects will be 1.

**Returns**: <code>Promise</code> - promise object represents an array of metadata objects  
**Throws**:

- <code>ValidationError</code> - if no company is found
- <code>StopError</code> - if the time limitation of nalog.ru were violated
- <code>RequestError</code> - if network errors occurred

| Param | Type | Description |
| --- | --- | --- |
| inn | <code>string</code> | company inn to search |

### downloader.getMetadata(params) ⇒ <code>Promise</code>
Gets metadata of the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents an array of metadata objects

| Param | Type | Description |
| --- | --- | --- |
| params | <code>string</code>&#124;<code>Object</code> | query parameters to search. If params is a string, it will be treated as params.query |
| params.query | <code>string</code> | inn, ogrn or company name |
| [params.region] | <code>string</code> | a string of region codes separated by a comma - '5,12' or '10' |
| [params.page] | <code>string</code> | page number - '2' or '10' |

### downloader.convertMetadataItem(item) ⇒ <code>Object</code>
Converts company metadata according to map

**Returns**: <code>Object</code> - converted metadata object

| Param | Type | Description |
| --- | --- | --- |
| item | <code>Object</code> | company metadata object to convert |

<a name="Downloader+convertMetadata"></a>

### downloader.convertMetadata(data) ⇒ <code>Array</code>
Converts metadata of the companies according to map

**Returns**: <code>Array</code> - array of converted metadata objects

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Array</code> | array of metadata objects to convert |

### downloader.getMetadataObjects(params) ⇒ <code>Promise</code>
Gets metadata of the companies by query parameters and convert it

**Returns**: <code>Promise</code> - promise object represents an array of converted metadata objects

| Param | Type | Description |
| --- | --- | --- |
| params | <code>string</code>&#124;<code>Object</code> | query parameters to search. If params is a string, it will be treated as params.query |
| params.query | <code>string</code> | inn, ogrn or company name |
| [params.region] | <code>string</code> | a string of region codes separated by a comma - '5,12' or '10' |
| [params.page] | <code>string</code> | page number - '2' or '10' |

### downloader.getDocByInn(inn) ⇒ <code>Promise</code>
Gets EGRUL pdf document on the company by its inn. It is assumed, that only one company or none can be found, so only one pdf file or none will be downloaded.

**Returns**: <code>Promise</code> - promise object represents company inn  
**Throws**:

- <code>ValidationError</code> - if no company is found
- <code>StopError</code> - if the time limitation of nalog.ru were violated
- <code>RequestError</code> - if network errors occurred

| Param | Type | Description |
| --- | --- | --- |
| inn | <code>string</code> | company inn to search |

### downloader.getDocs(params) ⇒ <code>Promise</code>
Gets EGRUL pdf documents on the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents void

| Param | Type | Description |
| --- | --- | --- |
| params | <code>string</code>&#124;<code>Object</code> | query parameters to search. If params is a string, it will be treated as params.query |
| params.query | <code>string</code> | inn, ogrn or company name |
| [params.region] | <code>string</code> | a string of region codes separated by a comma - '5,12' or '10' |
| [params.page] | <code>string</code> | page number - '2' or '10' |

## Class MultiDownloader
### new MultiDownloader([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.outputPath] | <code>string</code> | <code>null</code> | path to download pdf files |
| [options.sockets] | <code>number</code> | <code>1</code> | maximum number of sockets to allow |
| [options.pause] | <code>number</code> | <code>1500</code> | pause between requests in milliseconds |
| [options.httpsAgent] | <code>https.Agent</code> | <code>new Agent()</code> | https agent to manage connections |
| [options.logger] | <code>Logger</code> | <code>console</code> | logger to log errors and success requests |

### multiDownloader.getDocsByInn(queries) ⇒ <code>Promise</code>
Gets EGRUL pdf documents on the companies found by inns

**Returns**: <code>Promise</code> - promise object represents an array of arrays of inns, composed by status of result and type of errors

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;string&gt;</code> | inns of companies to search |

### multiDownloader.getMetadataByInn(queries) ⇒ <code>Promise</code>
Gets metadata of the companies found by inns

**Returns**: <code>Promise</code> - promise object represents an array of arrays of inns or arrays of metadata objects, composed by status of result and type of errors

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;string&gt;</code> | inns of companies to search |

### multiDownloader.getDocs(queries) ⇒ <code>Promise</code>
Gets EGRUL pdf documents on the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents void

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;(string&#124;Object)&gt;</code> | an array of query parameters to search. If query parameter is a string, it will be treated as queries[].query |
| queries[].query | <code>string</code> | inn, ogrn or company name |
| [queries[].region] | <code>string</code> | a string of region codes separated by a comma - '5,12' or '10' |
| [queries[].page] | <code>string</code> | page number - '2' or '10' |

### multiDownloader.getMetadata(queries) ⇒ <code>Promise</code>
Gets metadata of the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents an array of metadata objects

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;(string&#124;Object)&gt;</code> | an array of query parameters to search. If query parameter is a string, it will be treated as queries[].query |
| queries[].query | <code>string</code> | inn, ogrn or company name |
| [queries[].region] | <code>string</code> | a string of region codes separated by a comma - '5,12' or '10' |
| [queries[].page] | <code>string</code> | page number - '2' or '10' |

### multiDownloader.convertMetadataItem(item) ⇒ <code>Object</code>
Converts company metadata according to map

**Returns**: <code>Object</code> - converted metadata object

| Param | Type | Description |
| --- | --- | --- |
| item | <code>Object</code> | company metadata object to convert |

### multiDownloader.convertMetadata(data) ⇒ <code>Array</code>
Converts metadata of the companies according to map

**Returns**: <code>Array</code> - array of converted metadata objects

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Array</code> | array of metadata objects to convert |

### multiDownloader.getMetadataObjects(queries) ⇒ <code>Promise</code>
Gets converted metadata of the companies found by query parameters

**Returns**: <code>Promise</code> - promise object represents an array of converted metadata objects

| Param | Type | Description |
| --- | --- | --- |
| queries | <code>Array.&lt;(string&#124;Object)&gt;</code> | an array of query parameters to search. If query parameter is a string, it will be treated as queries[].query |
| queries[].query | <code>string</code> | inn, ogrn or company name |
| [queries[].region] | <code>string</code> | a string of region codes separated by a comma - '5,12' or '10' |
| [queries[].page] | <code>string</code> | page number - '2' or '10' |

## Class MetadataRequestManagerDb
### new MetadataRequestManagerDb([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.inputDir] | <code>string</code> | <code>&quot;input&quot;</code> | name of directory with input files |
| [options.outputDir] | <code>string</code> | <code>&quot;output&quot;</code> | name of directory with output files |
| [options.logsDir] | <code>string</code> | <code>&quot;logs&quot;</code> | name of directory with logs files |
| [options.reportsDir] | <code>string</code> | <code>&quot;reports&quot;</code> | name of directory with reports |
| [options.dbFile] | <code>string</code> | <code>&quot;data.db&quot;</code> | name of sqlite database file |
| [options.workingDir] | <code>string</code> | <code>process.cwd()</code> | path to directory where  all other directories and files will be created |
| [options.requestsLength] | <code>number</code> | <code>100</code> | number of requests simultaneously sent and processed |
| [options.failureRate] | <code>number</code> | <code>0.5</code> | failure rate of request to wait or stop |
| [options.requestsLengthToCheckFailureRate] | <code>number</code> | <code>5</code> | minimum number of requests sent  simultaneously to check failure rate |
| [options.timeToWaitBeforeNextAttempt] | <code>number</code> | <code>30 * 60 * 1000</code> | time in milliseconds  to wait for the first time failure rate is exceeded |
| [options.cleanDB] | <code>boolean</code> | <code>false</code> | clean or not the table with json data |
| [options.updateMode] | <code>boolean</code> | <code>true</code> | update or not json data for inns if json data  for these inns already exist in db |
| [options.innPerFile] | <code>number</code> | <code>500</code> | number of json objects per output file |

### metadataRequestManagerDb.writeReport() ⇒ <code>void</code>
Writes a report with statistics on downloads

### metadataRequestManagerDb.writeErrors() ⇒ <code>void</code>
Writes a file with a list of inns, on which some network error occurred and they require re-request, and a file with a list of invalid inns

### metadataRequestManagerDb.generateReport() ⇒ <code>void</code>
Writes a report with statistics on downloads and files with lists of inns with errors

### metadataRequestManagerDb.getCurrentResult() ⇒ <code>void</code>
Writes output files with json data for requests completed successfully so far

### metadataRequestManagerDb.getAllContent() ⇒ <code>void</code>
Writes output files with all json data from jsons table

### metadataRequestManagerDb.cleanBeforeFinish() ⇒ <code>void</code>
Cleans after the request process

### metadataRequestManagerDb.start() ⇒ <code>Promise</code>
Launches the request process

**Returns**: <code>Promise</code> - promise object represents void

## Class PDFRequestManagerDb
### new PDFRequestManagerDb([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.inputDir] | <code>string</code> | <code>&quot;input&quot;</code> | name of directory with input files |
| [options.outputDir] | <code>string</code> | <code>&quot;output&quot;</code> | name of directory with output files |
| [options.logsDir] | <code>string</code> | <code>&quot;logs&quot;</code> | name of directory with logs files |
| [options.reportsDir] | <code>string</code> | <code>&quot;reports&quot;</code> | name of directory with reports |
| [options.dbFile] | <code>string</code> | <code>&quot;data.db&quot;</code> | name of sqlite database file |
| [options.workingDir] | <code>string</code> | <code>process.cwd()</code> | path to directory where  all other directories and files will be created |
| [options.requestsLength] | <code>number</code> | <code>100</code> | number of requests simultaneously sent and processed |
| [options.failureRate] | <code>number</code> | <code>0.5</code> | failure rate of request to wait or stop |
| [options.requestsLengthToCheckFailureRate] | <code>number</code> | <code>5</code> | minimum number of requests sent  simultaneously to check failure rate |
| [options.timeToWaitBeforeNextAttempt] | <code>number</code> | <code>30 * 60 * 1000</code> | time in milliseconds  to wait for the first time failure rate is exceeded |

### pdfRequestManagerDb.writeReport() ⇒ <code>void</code>
Writes a report with statistics on downloads

### pdfRequestManagerDb.writeErrors() ⇒ <code>void</code>
Writes a file with a list of inns, on which some network error occurred, and they require re-request, and a file with a list of invalid inns

### pdfRequestManagerDb.generateReport() ⇒ <code>void</code>
Writes a report with statistics on downloads and files with lists of inns with errors

### pdfRequestManagerDb.cleanBeforeFinish() ⇒ <code>void</code>
Cleans after the request process

### pdfRequestManagerDb.start() ⇒ <code>Promise</code>
Launches the request process

**Returns**: <code>Promise</code> - promise object represents void

## Class Parser
### new Parser()

### parser.read(path) ⇒ <code>Promise</code>
Reads a pdf file and create a map with coordinate, style and content information for each page

**Returns**: <code>Promise</code> - promise object represents an array of maps with information about the file content

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | pdf file path |

<a name="Parser+convert"></a>

### parser.convert(rowData) ⇒ <code>Object</code>
Converts content into key: value object with consideration of headers

**Returns**: <code>Object</code> - object with file content (keys in Russian)

| Param | Type | Description |
| --- | --- | --- |
| rowData | <code>Array.&lt;Map&gt;</code> | array of maps with information about the file content |

### parser.parse(path) ⇒ <code>Promise</code>
Parses EGRUL (EGRIP) pdf file

**Returns**: <code>Promise</code> - promise object represents an object with normalized file content

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | pdf file path |

## Class ParsingManager
### new ParsingManager([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.inputPath] | <code>string</code> | <code>null</code> | path to a directory with egrul pdf files to parse |
| [options.outputDir] | <code>string</code> | <code>&quot;output&quot;</code> | name of directory for output files |
| [options.logsDir] | <code>string</code> | <code>&quot;logs&quot;</code> | name of directory with logs files |
| [options.reportsDir] | <code>string</code> | <code>&quot;reports&quot;</code> | name of directory with reports |
| [options.workingDir] | <code>string</code> | <code>process.cwd()</code> | path to directory where  the all other directories and files will be created |
| [options.dbFile] | <code>string</code> | <code>&quot;parsedPDF.db&quot;</code> | name of a sqlite database file |
| [options.dbPath] | <code>string</code> | <code>resolve(this.workingDir, this.dbFile)</code> | path  to a sqlite database file |
| [options.cleanDB] | <code>boolean</code> | <code>false</code> | clean or not the table with json data |
| [options.numberOfThreads] | <code>number</code> | <code>os.cpus().length</code> | number of worker threads |
| [options.pdfLength] | <code>number</code> | <code>100</code> | number of pdf files simultaneously sent to a worker pool |
| [options.pdfObjectsPerFile] | <code>number</code> | <code>500</code> | number of json objects per an output file |
| [options.pdfObjectsPerArray] | <code>number</code> | <code>500</code> | number of data objects per an output array |
| [options.extractData] | <code>function</code> | <code>null</code> | extracts the required fields from an egrul object |

### parsingManager.getResult([outputPath]) ⇒ <code>Promise</code>
Writes output files with json data for paths from paths table

**Returns**: <code>Promise</code> - promise object represents void

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [outputPath] | <code>string</code> | <code>null</code> | path to an output directory |

### parsingManager.getAllContent([outputPath]) ⇒ <code>Promise</code>
Writes output files with all json data from jsons table

**Returns**: <code>Promise</code> - promise object represents void

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [outputPath] | <code>string</code> | <code>null</code> | path to an output directory |

### parsingManager.getResultAsArrays() ⇒ <code>Promise</code>
Generates arrays of the required length with data objects for paths from paths table

**Yields**: <code>Promise</code> - promise object represents an array of the required length with data objects

### parsingManager.getAllContentAsArrays() ⇒ <code>Promise</code>
Generates arrays of the required length with data objects from jsons table

**Yields**: <code>Promise</code> - promise object represents an array of the required length with data objects

### parsingManager.writeReport() ⇒ <code>Promise</code>
Writes a report with statistics on parsing

**Returns**: <code>Promise</code> - promise object represents void

### parsingManager.writeErrors() ⇒ <code>Promise</code>
Writes a file with a list of paths, on which an error occurred

**Returns**: <code>Promise</code> - promise object represents void

### parsingManager.generateReport() ⇒ <code>Promise</code>
Writes a report with statistics on parsing and a file with a list of paths, on which an error occurred

**Returns**: <code>Promise</code> - promise object represents void

### parsingManager.start([resume]) ⇒ <code>Promise</code>
Launches the parsing process

**Returns**: <code>Promise</code> - promise object represents void

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [resume] | <code>boolean</code> | <code>false</code> | true, if resume the parsing process  after it was interrupted for some reason |

## Class WorkerPool
### new WorkerPool(workerPath, [numberOfThreads])

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| workerPath | <code>string</code> |  | file path to worker implementation |
| [numberOfThreads] | <code>number</code> | <code>os.cpus().length</code> | number of worker threads |

### workerPool.run(path) ⇒ <code>Promise</code>
Executes the task

**Returns**: <code>Promise</code> - promise object represents a data object received from a worker thread after the task was done

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | path to a pdf file |

### workerPool.clean() ⇒ <code>Promise</code>
Cleans before finishing

**Returns**: <code>Promise</code> - promise object represents void

## Class Logger
### new Logger([options])
| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options] | <code>Object</code> | <code>{}</code> | configuration settings |
| [options.mode] | <code>string</code> | <code>&quot;w&quot;</code> | flag, that indicates in what mode files  should be opened for logging |
| [options.retryErrorPath] | <code>string</code> | <code>null</code> | path to file to log network errors to retry |
| [options.validationErrorPath] | <code>string</code> | <code>null</code> | path to file to log validation errors |
| [options.generalErrorPath] | <code>string</code> | <code>null</code> | path to file to log general errors |
| [options.successPath] | <code>string</code> | <code>null</code> | path to file to log successful requests |

### logger.log(type, message, [...args]) ⇒ <code>void</code>
Logs a message to a specific file depending on the message type

| Param | Type | Description |
| --- | --- | --- |
| type | <code>string</code> | message type |
| message | <code>string</code>&#124;<code>Error</code> | message to log |
| [...args] | <code>string</code>&#124;<code>number</code> | additional information |

### logger.closeStreams() ⇒ <code>Promise</code>
Closes message streams

**Returns**: <code>Promise</code> - promise object represents void  
