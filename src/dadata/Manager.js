const { resolve } = require('path');
const {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
} = require('fs');
const { createInterface } = require('readline');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('../Logger');

class Manager {
  constructor() {
    this.inputDir = '../../input';
    this.outputDir = '../../output';
    this.mainInputFile = 'input.txt';
    this.configPath = resolve(__dirname, '../../config/config.txt');
    this.currentFile = this._setCurrentFile();
    this.innPerFile = 800;
    this.requestsLength = 100;
    this.firstJSON = true;
    this.logger = new Logger(
      resolve(__dirname, `../../logs/error.log`),
      resolve(__dirname, `../../logs/success.log`),
      'a'
    );
    this.apiMultiCaller = new APIMultiCaller({ logger: this.logger });
  }

  _setCurrentFile() {
    const num =
      existsSync(this.configPath) && +readFileSync(this.configPath, { encoding: 'utf8' }).trim();
    return num && !isNaN(num) ? num : 1;
  }

  async _processInput() {
    const mainInputPath = resolve(__dirname, this.inputDir, this.mainInputFile);
    if (!existsSync(mainInputPath)) return;
    let lineCount = 0;
    let fileCount = 1;

    try {
      let output = createWriteStream(resolve(__dirname, this.inputDir, `${fileCount}.txt`));
      const rl = createInterface({
        input: createReadStream(mainInputPath),
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

      renameSync(mainInputPath, resolve(__dirname, this.inputDir, `_${this.mainInputFile}`));

      this.currentFile = 1;
      writeFileSync(this.configPath, `${this.currentFile}`);
    } catch (err) {
      this.logger.log(err);
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
      const output = createWriteStream(
        resolve(__dirname, this.outputDir, `${this.currentFile}.json`)
      );

      output.write('[');

      for (const arr of queriesArray) {
        const response = (await this.apiMultiCaller.makeRequests(arr)).flat();
        response.forEach((item) => this._processResponse(item, output));
      }

      output.end('\n]\n');

      renameSync(
        resolve(__dirname, this.inputDir, `${this.currentFile}.txt`),
        resolve(__dirname, this.inputDir, `_${this.currentFile}.txt`)
      );

      writeFileSync(this.configPath, this.currentFile + 1);
    } catch (err) {
      this.logger.log(err);
    }
  }

  async start() {
    await this._processInput();
    const currentPath = resolve(__dirname, this.inputDir, `${this.currentFile}.txt`);
    if (existsSync(currentPath)) await this._request(currentPath);
  }
}

module.exports = Manager;
