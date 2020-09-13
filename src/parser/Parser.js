const { PdfReader } = require('pdfreader');

class Parser {
  constructor(options = {}) {
    this.reader = options.reader || new PdfReader();
    this.levelMap = {
      1610: 1,
      1611: 2,
      1500: 3,
    };
  }

  readPDF(path) {
    return new Promise((resolve, reject) => {
      const pages = [];
      let prevX, prevY, prevStyle;
      this.reader.parseFileItems(path, (err, item) => {
        if (err) reject(err);
        else if (!item) resolve(pages);
        else if (item.page) pages.push(new Map());
        else if (item.text) {
          // if (pages.length < 6) console.log(item.R[0].TS, item.text);
          const style = `${item.R[0].TS[1]}${item.R[0].TS[2]}${item.R[0].TS[3]}`;
          const page = pages[pages.length - 1];
          const prevPage = pages[pages.length - 2];
          const { x, y, text } = item;

          if (style === '1501' || style === '1100') return;

          if ((prevStyle !== '1500' && isNaN(text) && prevStyle === style) || prevX === x) {
            const cell = page.get(prevY).get(prevX);
            page.get(prevY).set(prevX, `${cell} ${text}`);
          } else {
            // console.log(prevY, pages[pages.length - 1]);
            // если это новая строка таблицы
            if (!page.get(y) && prevY) {
              // есть данные на текущей странице и предыдущая ячейка имеет длину 1
              if (page.size) {
                if (page.get(prevY).size === 1) {
                  const cell = page.get(prevY).get(prevX);
                  page.get(prevY).set(prevX, [cell, prevStyle]);
                }
                // нет данных на текущей страницы - ищем предыдущую страницу
              } else {
                if (prevPage.get(prevY).size === 1) {
                  const cell = prevPage.get(prevY).get(prevX);
                  prevPage.get(prevY).set(prevX, [cell, prevStyle]);
                }
              }
            }

            const row = page.get(y) || new Map();
            row.set(x, text);
            page.set(y, row);
            prevX = x;
            prevY = y;
            prevStyle = style;
          }
        }
      });
    });
  }

  _getTitleLevel(text, style) {
    if (!isNaN(text)) return style === '1610' ? 2 : 3;
    else return this.levelMap[style];
    // let l;
    // if (!isNaN(text)) {
    //   l = style === '1610' ? 2 : 3;
    // } else {
    //   l = levelMap[style];
    // }
    // // console.log(text, l);
    // return l;
  }

  _preparePDF(rowData) {
    const data = rowData.map((item) => Array.from(item.values())).flat();
    let count = 0;
    for (const item of data) {
      if (item.size === 1 && Array.from(item.values()).flat()[1] === '1610') break;
      count++;
    }
    data.splice(0, count);
    data.pop();
    return data;
  }

  parsePDF(rowData) {
    rowData = this._preparePDF(rowData);

    let prevTitleLevel = 1;
    let levels = [];
    const data = {};

    rowData.reduce((acc, item) => {
      if (item.size === 1) {
        const [text, style] = Array.from(item.values())[0];
        const level = this._getTitleLevel(text, style);
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
            const currentObj = levels[levels.length - 2];
            levels.length = 1;
            prevTitleLevel = level;
            currentObj[text] = {};
            return currentObj[text];
          }
        } else {
          const currentObj = levels[levels.length - 1] || data;
          currentObj[text] = {};
          return currentObj[text];
        }
      } else if (item.size === 3) {
        const row = Array.from(item.values());
        acc[row[1]] = row[2];
        return acc;
      }
    }, data);
    console.log('parse', JSON.stringify(data, null, 2));

    return data;
  }

  async parse(path) {
    const data = await this.readPDF(path);
    return this.parsePDF(data);
  }
}

module.exports = Parser;
