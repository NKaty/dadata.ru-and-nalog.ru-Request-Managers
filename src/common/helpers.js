const { resolve } = require('path');
const { readdirSync, unlinkSync, statSync } = require('fs');

/**
 * @desc Gets a current date object and convert it to a string
 * @param {boolean} [pretty=false] - defines the format of a date string
 * @returns {string} - current date and time as a string
 */
const getDate = (pretty = false) => {
  const date = new Date();
  const now = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();
  if (pretty) return now.substr(0, 19).split('T').join(' ');
  return now.substr(0, 23);
};

/**
 * @desc Removes files from directory
 * @param {string} dir - directory path
 * @returns {void}
 */
const cleanDir = (dir) => {
  const items = readdirSync(dir);
  items.forEach((item) => {
    const path = resolve(dir, item);
    const stat = statSync(path);
    if (stat.isFile()) unlinkSync(path);
  });
};

/**
 * @desc Closes writable streams
 * @param {Array.<stream.Writable>} streams - array of writable streams to close
 * @returns {Promise} - Promise object represents void
 */
const closeStreams = async (streams) => {
  const streamPromises = streams.map((stream) => {
    if (stream && !stream.writableEnded) {
      return new Promise((resolve) => {
        stream.once('close', () => {
          resolve();
          stream.removeAllListeners('close');
        });
        stream.end();
      });
    }
    return Promise.resolve();
  });

  await Promise.allSettled(streamPromises);
};

module.exports = { getDate, cleanDir, closeStreams };
