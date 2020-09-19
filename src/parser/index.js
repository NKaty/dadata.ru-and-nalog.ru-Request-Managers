const { resolve } = require('path');
// const Parser = require('./Parser');
//
// new Parser()
//   .parse(resolve(__dirname, `../../docs/fl-315745600020425-20200916235037.pdf`))
//   .then(console.log);

const WorkerPool = require('./WorkerPool');
const arr = [
  '../../docs/7707083893.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/5406771317.pdf',
];
const pool = new WorkerPool(resolve(__dirname, 'worker.js'), 2);
Promise.all(
  arr.map(async (item) => {
    const res = await pool.run(item);
    console.log(res);
  })
);
