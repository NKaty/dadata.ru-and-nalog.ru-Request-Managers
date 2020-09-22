const { resolve } = require('path');
// const Parser = require('./Parser');
const os = require('os');
console.log(os.cpus().length);
// const arr = ['../../docs/7707083893.pdf'];
const arr = [
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/7707083893.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/fl-315745600020425-20200916235037.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/5406771317.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/1650391240.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7721230268.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
  '../../docs/7804671668.pdf',
];

// const parser = new Parser();
// console.time('time1');
// Promise.all(
//   arr.map(async (item) => {
//     const res = await parser.parse(resolve(__dirname, item));
//     // console.log(res);
//   })
// ).then(() => console.timeEnd('time1'));

const WorkerPool = require('./WorkerPool');
const pool = new WorkerPool(resolve(__dirname, 'worker.js'), resolve(process.cwd(), 'docs'), 2);
// pool.on('error', () => console.log('error'));
console.time('time2');
Promise.allSettled(
  arr.map(async (item) => {
    // try {
    //   const res = await pool._run(item);
    //   console.log(res);
    // } catch (e) {
    //   console.log('catch');
    // }
    return pool.run(item);
  })
).then(() => console.timeEnd('time2'));
