const { resolve } = require('path');
const { createReadStream, createWriteStream, existsSync, renameSync } = require('fs');
const { createInterface } = require('readline');
const APIMultiCaller = require('./APIMultiCaller');
const Logger = require('../Logger');
const config = require('./config');

async function processLineByLine(num) {
  if (!existsSync(resolve(__dirname, '../../input/input.txt'))) return;
  let lineCount = 0;
  let fileCount = 1;
  let output = createWriteStream(resolve(__dirname, `../../input/${fileCount}.txt`));
  try {
    const rl = createInterface({
      input: createReadStream(resolve(__dirname, '../../input/input.txt')),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (lineCount === num) {
        fileCount += 1;
        lineCount = 0;
        output.end();
        output = createWriteStream(resolve(__dirname, `../../input/${fileCount}.txt`));
      }
      output.write(`${line}\n`);
      lineCount += 1;
    }

    renameSync(
      resolve(__dirname, '../../input/input.txt'),
      resolve(__dirname, '../../input/_input.txt')
    );

    config.current_file = 1;
  } catch (err) {
    console.log(err);
  }
}

const logger = new Logger(
  resolve(__dirname, `../../logs/error.log`),
  resolve(__dirname, `../../logs/success.log`),
  'a'
);

const apiMultiCaller = new APIMultiCaller({ logger });
const request = async () => {
  await processLineByLine(4);
  const currentFile = `${config.current_file}.txt`;
  console.log(currentFile);
  const currentPath = resolve(__dirname, `../../input/${currentFile}`);
  if (!existsSync(currentPath)) return;
  const output = createWriteStream(resolve(__dirname, `../../output/${currentFile}`), {
    flags: 'a',
  });
  config.current_file += 1;
  const rl = createInterface({
    input: createReadStream(currentPath),
    crlfDelay: Infinity,
  });
  const queries = [[]];
  for await (const line of rl) {
    if (queries[queries.length - 1].length === 2)
      queries.push([{ query: line, branch_type: 'MAIN' }]);
    else queries[queries.length - 1].push({ query: line, branch_type: 'MAIN' });
  }
  console.log(queries);
  output.write('[');
  let first = true;
  for (const query of queries) {
    let response = await apiMultiCaller.makeRequests(query);
    response = response.flat(2);
    console.log(response);
    response.forEach((data) => {
      const obj = {
        full_name: data.data.name.full_with_opf,
        short_name: data.data.name.short_with_opf,
        inn: data.data.inn,
        kpp: data.data.kpp,
        ogrn: data.data.ogrn,
        ogrn_date: data.data.ogrn_date,
        type: data.data.type,
        okpo: data.data.okpo,
        address: data.data.address.data.source,
        management: {
          post: data.data.management.post,
          name: data.data.management.name,
        },
        status: data.data.state.status,
      };
      if (first) {
        output.write(`\n${JSON.stringify(obj)}`);
        first = false;
      } else {
        output.write(`,\n${JSON.stringify(obj)}`);
      }
    });
  }
  output.write('\n]\n');
  output.end();
  renameSync(
    resolve(__dirname, `../../input/${currentFile}`),
    resolve(__dirname, `../../input/_${currentFile}`)
  );
};
request();
