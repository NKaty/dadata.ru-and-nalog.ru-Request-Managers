const { isMainThread, parentPort, workerData } = require('worker_threads');
const Database = require('better-sqlite3');

const Parser = require('./Parser');

if (isMainThread) {
  throw new Error('It is not a worker');
}

const parser = new Parser();
const db = new Database(workerData.db);

parentPort.on('message', async (data) => {
  try {
    const result = await parser.parse(data);
    if (
      db.prepare('SELECT ogrn FROM jsons WHERE path = ? AND ogrn = ?').get(data, result.ogrn) ===
      undefined
    ) {
      db.prepare('INSERT INTO jsons (path, inn, ogrn, json) VALUES (?, ?, ?, ?)').run(
        data,
        result.inn,
        result.ogrn,
        JSON.stringify(result)
      );
    } else {
      db.prepare('UPDATE jsons SET json = ? WHERE path = ? AND ogrn = ?').run(
        JSON.stringify(result),
        data,
        result.ogrn
      );
    }
    parentPort.postMessage({ status: 'success' });
  } catch (error) {
    parentPort.postMessage({ status: 'error', error });
  }
});
