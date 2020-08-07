const { resolve } = require('path');
const {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} = require('fs');
const { createInterface } = require('readline');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('../Logger');

class Manager {
  constructor() {
    this.tempDir = '../../temp';
    this.tempInputDir = 'input';
    this.tempErrorsDir = 'errors';
    this.inputDir = '../../input';
    this.outputDir = '../../output';
    this.logsDir = '../../logs';
    this.mainInputFile = 'input.txt';
    this.tempErrorsFile = 'errors.txt';
    this._tempPath = resolve(__dirname, this.tempDir);
    this._tempInputPath = resolve(this._tempPath, this.tempInputDir);
    this._tempErrorsPath = resolve(this._tempPath, this.tempErrorsDir);
    this._mainTempErrorsPath = resolve(this._tempErrorsPath, this.tempErrorsFile);
    this._inputPath = resolve(__dirname, this.inputDir);
    this._mainInputPath = resolve(this._inputPath, this.mainInputFile);
    this._outputPath = resolve(__dirname, this.outputDir);
    this._logsPath = resolve(__dirname, this.logsDir);
    this.requestsPerDay = 15;
    this.innPerFile = 5;
    this.filesPerDay = Math.floor(this.requestsPerDay / this.innPerFile);
    this.requestsLength = 3;
    this.failureRate = 0.5;
    this._firstJSON = true;
    this.logger = new Logger(
      resolve(this._logsPath, 'error.log'),
      resolve(this._logsPath, 'success.log'),
      'a'
    );
    this.apiMultiCaller = new APIMultiCaller({ logger: this.logger });
    this._createDirStructure();
  }

  _createDirStructure() {
    if (!existsSync(this._tempPath)) mkdirSync(this._tempPath);
    if (!existsSync(this._tempInputPath)) mkdirSync(this._tempInputPath);
    if (!existsSync(this._tempErrorsPath)) mkdirSync(this._tempErrorsPath);
    if (!existsSync(this._inputPath)) mkdirSync(this._inputPath);
    if (!existsSync(this._outputPath)) mkdirSync(this._outputPath);
    if (!existsSync(this._logsPath)) mkdirSync(this._logsPath);
  }

  _getDate() {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
      .toISOString()
      .substr(0, 23);
  }

  async _processInput(checkingErrors) {
    try {
      let currentPath;
      if (!checkingErrors && existsSync(this._mainInputPath)) currentPath = this._mainInputPath;
      else if (checkingErrors && existsSync(this._mainTempErrorsPath))
        currentPath = this._mainTempErrorsPath;
      else return;

      let lineCount = 0;
      let fileCount = 1;

      let output = createWriteStream(resolve(this._tempInputPath, `${fileCount}.txt`));
      const rl = createInterface({
        input: createReadStream(currentPath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (lineCount === this.innPerFile) {
          lineCount = 0;
          output.end();
          fileCount += 1;
          output = createWriteStream(resolve(this._tempInputPath, `${fileCount}.txt`));
        }
        output.write(`${line}\n`);
        lineCount += 1;
      }

      if (currentPath === this._mainTempErrorsPath) unlinkSync(this._mainTempErrorsPath);
      else renameSync(this._mainInputPath, resolve(this._inputPath, `_${this.mainInputFile}`));
    } catch (err) {
      this.logger.log(err);
      process.exit(1);
    }
  }

  async _getQueriesArray(currentPath) {
    const queries = [[]];

    const rl = createInterface({
      input: createReadStream(currentPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (queries[queries.length - 1].length === this.requestsLength)
        queries.push([{ query: line, branch_type: 'MAIN' }]);
      else queries[queries.length - 1].push({ query: line, branch_type: 'MAIN' });
    }

    return queries;
  }

  _getJson(response) {
    const data = response.data;
    return JSON.stringify({
      full_name: data.name.full_with_opf,
      short_name: data.name.short_with_opf,
      inn: data.inn,
      kpp: data.kpp,
      ogrn: data.ogrn,
      ogrn_date: data.ogrn_date,
      type: data.type,
      okpo: data.okpo,
      address: data.address.data.source,
      management: {
        post: data.management && data.management.post,
        name: data.management && data.management.name,
      },
      status: data.state && data.state.status,
    });
  }

  _processResponse(response, output) {
    const json = this._getJson(response);
    if (this._firstJSON) {
      output.write(`\n${json}`);
      this._firstJSON = false;
    } else {
      output.write(`,\n${json}`);
    }
  }

  async _request(currentPath) {
    try {
      this._firstJSON = true;
      const queriesArray = await this._getQueriesArray(currentPath);
      const successOutput = createWriteStream(resolve(this._outputPath, `${this._getDate()}.json`));
      let failureOutput = null;

      successOutput.write('[');

      for (const arr of queriesArray) {
        const response = await this.apiMultiCaller.makeRequests(arr);
        const success = response[0];
        const failure = response[1];
        const stop = response[2];
        const failureRate = failure.length / (success.length + failure.length);

        if (stop.length || failureRate >= this.failureRate) {
          successOutput.end('\n]\n');
          if (failureOutput) failureOutput.end();
          process.exit(1);
        }

        success.flat().forEach((item) => this._processResponse(item, successOutput));

        if (failure.length && !failureOutput)
          failureOutput = createWriteStream(this._mainTempErrorsPath, { flags: 'a' });
        if (failureOutput) failure.forEach((item) => failureOutput.write(`${item}\n`));
      }

      successOutput.end('\n]\n');
      if (failureOutput) failureOutput.end();

      existsSync(currentPath) && unlinkSync(currentPath);
    } catch (err) {
      this.logger.log(err);
      process.exit(1);
    }
  }

  async _requests(currentFiles) {
    for (const file of currentFiles) {
      await this._request(resolve(this._tempInputPath, file));
    }
  }

  _getCurrentFiles() {
    return readdirSync(this._tempInputPath).slice(0, this.filesPerDay);
  }

  async start(checkingErrors = false) {
    try {
      await this._processInput(checkingErrors);
      const currentFiles = this._getCurrentFiles();
      if (currentFiles.length) await this._requests(currentFiles);
      else if (existsSync(this._mainTempErrorsPath)) await this.start(true);
    } catch (err) {
      this.logger.log(err);
      process.exit(1);
    }
  }
}

module.exports = Manager;
