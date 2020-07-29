// const { createReadStream, createWriteStream } = require('fs');
const { resolve } = require('path');
const { PdfReader } = require('pdfreader');

function readPDFPages(buffer, reader = new PdfReader()) {
  return new Promise((resolve, reject) => {
    const pages = [];
    let prevX, prevY, prevStyle;
    reader.parseFileItems(buffer, (err, item) => {
      if (err) reject(err);
      else if (!item) resolve(pages);
      else if (item.page) pages.push(new Map());
      else if (item.text) {
        // if (pages.length < 6) console.log(item.R[0].TS, item.text);
        if (
          `${item.R[0].TS[1]}${item.R[0].TS[2]}${item.R[0].TS[3]}` === '1501' ||
          `${item.R[0].TS[1]}${item.R[0].TS[2]}${item.R[0].TS[3]}` === '1100'
        )
          return;
        if (
          prevStyle !== '1500' &&
          isNaN(item.text) &&
          prevStyle === `${item.R[0].TS[1]}${item.R[0].TS[2]}${item.R[0].TS[3]}`
        ) {
          const cell = pages[pages.length - 1].get(prevY).get(prevX);
          pages[pages.length - 1].get(prevY).set(prevX, `${cell} ${item.text}`);
        } else if (prevX === item.x) {
          const cell = pages[pages.length - 1].get(prevY).get(prevX);
          pages[pages.length - 1].get(prevY).set(prevX, `${cell} ${item.text}`);
        } else {
          // console.log(prevY, pages[pages.length - 1]);
          if (!pages[pages.length - 1].get(item.y)) {
            if (pages[pages.length - 1].size) {
              if (prevY && pages[pages.length - 1].get(prevY).size === 1) {
                const cell = pages[pages.length - 1].get(prevY).get(prevX);
                pages[pages.length - 1].get(prevY).set(prevX, [cell, prevStyle]);
              }
            } else {
              if (prevY && pages[pages.length - 2].get(prevY).size === 1) {
                const cell = pages[pages.length - 2].get(prevY).get(prevX);
                pages[pages.length - 2].get(prevY).set(prevX, [cell, prevStyle]);
              }
            }
          }
          const row = pages[pages.length - 1].get(item.y) || new Map();
          row.set(item.x, item.text);
          // row.push(item.text);
          pages[pages.length - 1].set(item.y, row);
          prevX = item.x;
          prevY = item.y;
          prevStyle = `${item.R[0].TS[1]}${item.R[0].TS[2]}${item.R[0].TS[3]}`;
        }
      }
    });
  });
}

const dictionary = {
  start: {
    x: 16.279,
    text: 'Наименование',
  },
};

const convert = (rowData) => {
  rowData = rowData.map((item) => Array.from(item.values())).flat();

  let count = 0;
  for (const item of rowData) {
    if (
      item.size === 1 &&
      item.get(dictionary.start.x) &&
      item.get(dictionary.start.x)[0] === dictionary.start.text
    )
      break;
    count++;
  }

  const getTitleLevel = (text, style) => {
    const levelMap = {
      '1610': 1,
      '1611': 2,
      '1500': 3,
    };
    let l;
    if (!isNaN(text)) {
      l = style === '1610' ? 2 : 3;
    } else {
      l = levelMap[style];
    }
    // console.log(text, l);
    return l;
  };

  rowData.splice(0, count);
  rowData.pop();
  let prevTitleLevel = 1;
  let levels = [];
  const data = {};
  rowData.reduce((acc, item) => {
    if (item.size === 1) {
      const [text, style] = Array.from(item.values())[0];
      const level = getTitleLevel(text, style);
      if (level === undefined) {
        return acc;
      } else if (level > prevTitleLevel) {
        levels.push(acc);
        prevTitleLevel = level;
        acc[text] = {};
        return acc[text];
      } else if (level < prevTitleLevel) {
        if (level === 1) {
          data[text] = {};
          prevTitleLevel = level;
          levels = [];
          return data[text];
        } else if (level === 2) {
          const obj = levels[levels.length - 2];
          levels.length = 1;
          prevTitleLevel = level;
          obj[text] = {};
          return obj[text];
        }
      } else {
        const obj = levels[levels.length - 1] || data;
        obj[text] = {};
        return obj[text];
      }
    } else if (item.size === 3) {
      const row = Array.from(item.values());
      acc[row[1]] = row[2];
      return acc;
    }
  }, data);
  console.log(JSON.stringify(data, null, 2));

  return data;
};

async function parse(buf, reader) {
  const data = await readPDFPages(buf, reader);
  return data;
}

parse(resolve(__dirname, `../docs/7804671668.pdf`)).then((data) => convert(data));
