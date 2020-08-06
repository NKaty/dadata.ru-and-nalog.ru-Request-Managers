const { resolve } = require('path');
const {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmdirSync,
} = require('fs');
const { createInterface } = require('readline');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('../Logger');

class Manager {
  constructor() {
    this.inputDir = '../../input';
    this.outputDir = '../../output';
    this.errorsDir = '../../errors';
    this.mainInputFile = 'input.txt';
    this.errorFile = 'errors.txt';
    this.mainInputPath = resolve(__dirname, this.inputDir, this.mainInputFile);
    this.errorsPath = resolve(__dirname, this.errorsDir, this.errorFile);
    this.configPath = resolve(__dirname, '../../config/config.txt');
    this.currentFile = this._setCurrentFile();
    this.innPerFile = 4;
    this.requestsLength = 2;
    this.cycleNumber = 4;
    this.firstJSON = true;
    this.checkingErrors = false;
    this.logger = new Logger(
      resolve(__dirname, `../../logs/error.log`),
      resolve(__dirname, `../../logs/success.log`),
      'a'
    );
    this.apiMultiCaller = new APIMultiCaller({ logger: this.logger });
  }

  _setCurrentFile() {
    const value =
      existsSync(this.configPath) && +readFileSync(this.configPath, { encoding: 'utf8' }).trim();
    return value && !isNaN(value) ? value : 1;
  }

  _getDate() {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
      .toISOString()
      .substr(0, 23);
  }

  _moveFilesToNewDir(oldDirPath, newDir) {
    mkdirSync(resolve(__dirname, oldDirPath, newDir));
    const inputFiles = readdirSync(resolve(__dirname, oldDirPath));
    let dirCount = 0;
    inputFiles.forEach((file) => {
      const stats = statSync(resolve(__dirname, oldDirPath, file));
      if (stats.isFile())
        renameSync(
          resolve(__dirname, oldDirPath, file),
          resolve(__dirname, oldDirPath, newDir, file)
        );
      else dirCount += 1;
    });
    return dirCount;
  }

  _startNewCycle() {
    const date = this._getDate();
    const dirCount = this._moveFilesToNewDir(this.inputDir, date);
    if (dirCount >= this.cycleNumber) {
      if (existsSync(resolve(__dirname, this.inputDir, date)))
        rmdirSync(resolve(__dirname, this.inputDir, date));
      process.exit(0);
    }
    this._moveFilesToNewDir(this.outputDir, date);
    this.checkingErrors = false;
    if (existsSync(this.errorsPath)) renameSync(this.errorsPath, this.mainInputPath);
  }

  async _processInput() {
    try {
      if (!this.checkingErrors && !existsSync(this.mainInputPath)) return;
      if (this.checkingErrors && existsSync(this.errorsPath)) this._startNewCycle();

      let lineCount = 0;
      let fileCount = 1;

      let output = createWriteStream(resolve(__dirname, this.inputDir, `${fileCount}.txt`));
      const rl = createInterface({
        input: createReadStream(this.mainInputPath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (lineCount === this.innPerFile) {
          fileCount += 1;
          lineCount = 0;
          output.end();
          output = createWriteStream(resolve(__dirname, this.inputDir, `${fileCount}.txt`));
        }
        output.write(`${line}\n`);
        lineCount += 1;
      }

      renameSync(this.mainInputPath, resolve(__dirname, this.inputDir, `_${this.mainInputFile}`));

      this.currentFile = 1;
      writeFileSync(this.configPath, `${this.currentFile}`);
    } catch (err) {
      this.logger.log(err);
      process.exit(1);
    }
  }

  async _getQueriesArray(currentPath) {
    const rl = createInterface({
      input: createReadStream(currentPath),
      crlfDelay: Infinity,
    });
    const queries = [[]];

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
    if (this.firstJSON) {
      output.write(`\n${json}`);
      this.firstJSON = false;
    } else {
      output.write(`,\n${json}`);
    }
  }

  async _request(currentPath) {
    try {
      const queriesArray = await this._getQueriesArray(currentPath);
      const successOutput = createWriteStream(
        resolve(__dirname, this.outputDir, `${this.currentFile}.json`)
      );
      let failureOutput = null;

      successOutput.write('[');

      for (const arr of queriesArray) {
        const response = await this.apiMultiCaller.makeRequests(arr);
        const success = response[0];
        const failure = response[1];
        const failureRate = failure.length / (success.length + failure.length);

        success.flat().forEach((item) => this._processResponse(item, successOutput));

        if (failureRate > 0.5) {
          successOutput.end('\n]\n');
          if (failureOutput) failureOutput.end();
          process.exit(1);
        }

        if (failure.length && !failureOutput)
          failureOutput = createWriteStream(this.errorsPath, { flags: 'a' });
        if (failureOutput) failure.forEach((item) => failureOutput.write(`${item}\n`));
      }

      successOutput.end('\n]\n');
      if (failureOutput) failureOutput.end();

      renameSync(
        resolve(__dirname, this.inputDir, `${this.currentFile}.txt`),
        resolve(__dirname, this.inputDir, `_${this.currentFile}.txt`)
      );

      writeFileSync(this.configPath, this.currentFile + 1);
    } catch (err) {
      this.logger.log(err);
      process.exit(1);
    }
  }

  async start() {
    await this._processInput();
    const currentPath = resolve(__dirname, this.inputDir, `${this.currentFile}.txt`);
    if (existsSync(currentPath)) await this._request(currentPath);
    else if (existsSync(this.errorsPath)) {
      this.checkingErrors = true;
      await this.start();
    }
  }
}

module.exports = Manager;
