const { resolve } = require('path');
const { readdirSync, unlinkSync, statSync } = require('fs');

const getDate = (pretty = false) => {
  const date = new Date();
  const now = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
  if (pretty) return now.substr(0, 19).split('T').join(' ');
  return now.substr(0, 23);
};

const cleanDir = (dir) => {
  const items = readdirSync(dir);
  items.forEach((item) => {
    const path = resolve(dir, item);
    const stat = statSync(path);
    if (stat.isFile()) unlinkSync(path);
  });
};

const closeStreams = async (streams) => {
  const streamPromises = streams.map((stream) => {
    if (stream) {
      stream.end();
      return new Promise((resolve) => stream.on('close', resolve));
    }
    return Promise.resolve();
  });

  await Promise.allSettled(streamPromises);
};

module.exports = { getDate, cleanDir, closeStreams };
