/**
 * Parser
 * Parser class parses EGRUL pdf documents downloaded from nalog.ru.
 */

const { PdfReader } = require('pdfreader');

const normalizeData = require('./map');

class Parser {
  constructor() {
    this.reader = new PdfReader();
    // Links styles to header levels
    this._levelMap = {
      1610: 1,
      1611: 2,
      1500: 3,
    };
    // In some cases can be a header with additional information that has this style
    // This header does not add a new level to a data object
    this._additionalHeaderStyle = '1501';
    // Converts data to normalized object
    this.normalizeData = normalizeData;
  }

  /**
   * @desc Reads a pdf file and create a map with coordinate, style
   *  and content information for each page
   * @param {string} path - pdf file path
   * @returns {Promise} - promise object represents an array of maps
   *  with information about the file content
   */
  read(path) {
    return new Promise((resolve, reject) => {
      const pages = [];
      let prevX, prevY, prevStyle;
      this.reader.parseFileItems(path, (err, item) => {
        if (err) reject(err);
        // Parsing is over
        else if (!item) resolve(pages);
        // New page
        else if (item.page) pages.push(new Map());
        // Content
        else if (item.text) {
          // font size + 1/0 for bold + 1/0 for italic
          const style = `${item.R[0].TS[1]}${item.R[0].TS[2]}${item.R[0].TS[3]}`;
          const page = pages[pages.length - 1];
          const prevPage = pages[pages.length - 2];
          // Get coordinates and content
          const { x, y, text } = item;

          // Not interested in page footers
          if (style === '1100') return;

          // Current text is a continuation of the previous text
          if ((prevStyle !== '1500' && isNaN(text) && prevStyle === style) || prevX === x) {
            // Add it to the previous cell
            const cell = page.get(prevY).get(prevX);
            page.get(prevY).set(prevX, `${cell} ${text}`);
            // Current text starts a new cell and maybe a new row
          } else {
            // If a new row starts and there is the previous row,
            // we must check whether the previous row is a header
            // And if it is, add a style property
            if (!page.get(y) && prevY) {
              // The row can be on the current or the previous page
              const requiredPage = page.size ? page : prevPage;
              // If previous row is a header (header has to have only one property)
              if (requiredPage.get(prevY).size === 1) {
                // Add a style to the header
                const cell = requiredPage.get(prevY).get(prevX);
                requiredPage.get(prevY).set(prevX, [cell, prevStyle]);
              }
            }

            // Get the current row or create a new one
            const row = page.get(y) || new Map();
            // Update the current row
            row.set(x, text);
            // Update the current page
            page.set(y, row);
            // Update variables for next round
            prevX = x;
            prevY = y;
            prevStyle = style;
          }
        }
      });
    });
  }

  // Gets the header level
  // There can be 4 levels depending on style and type (text or number)
  // 1 - style: 1610, type: text
  // 2 - style: 1610, type: number or style: 1611, type: any
  // 3 - style: 1500, type: any
  // 4 - style: 1500, type: text, level of previous header (additional condition): 3
  _getTitleLevel(text, style, prevTitleLevel) {
    if (prevTitleLevel === 3 && this._levelMap[style] === 3 && isNaN(text)) return 4;
    else if (!isNaN(text) && style === '1610') return 2;
    else return this._levelMap[style];
  }

  // Cut unnecessary rows from the beginning (up to the first header) and the end of the document
  _preparePDF(rowData) {
    const data = rowData.map((item) => Array.from(item.values())).flat();
    let count = 0;
    for (const item of data) {
      // Find the first header
      if (item.size === 1 && Array.from(item.values()).flat()[1] === '1610') break;
      count++;
    }
    // Cut rows up to the first header
    data.splice(0, count);
    // Cut the last row
    data.pop();
    return data;
  }

  /**
   * @desc Converts content into key: value object with regards to headers
   * @param {Array.<Map>} rowData - array of maps with information about the file content
   * @returns {Object} - object with file content (keys in Russian)
   */
  convert(rowData) {
    const preparedRowData = this._preparePDF(rowData);
    let prevTitleLevel = 1;
    // Keeps a chain of objects up to the current level
    // Allows to return to previous levels
    const levels = [];
    // A data object, where all data will be saved
    const data = {};

    preparedRowData.reduce((acc, item) => {
      // Row is a header
      if (item.size === 1) {
        const [text, style] = Array.from(item.values())[0];
        const level = this._getTitleLevel(text, style, prevTitleLevel);
        // There is no level for this header
        if (level === undefined) {
          // If it is an additional header that does not add a new level to a data object
          if (style === this._additionalHeaderStyle) {
            // Add the header as an property to the data object
            const row = Array.from(item.values());
            acc['Дополнительные сведения'] = row[0][0];
          }
          // In other cases ignore the unknown header
          return acc;
          // Current header is subheader of the previous one
        } else if (level > prevTitleLevel) {
          // Add a new level to the level chain
          levels.push(acc);
          prevTitleLevel = level;
          // Create a new level in the data object
          acc[text] = {};
          return acc[text];
          // Up in the level chain or remain on the same level
        } else {
          // Find the required level in the level chain
          const levelsLength = levels.length - (prevTitleLevel - level);
          const currentObj = levels[levelsLength - 1] || data;
          // Update the level chain
          levels.length = levelsLength;
          prevTitleLevel = level;
          // Create a new level on the required level
          currentObj[text] = {};
          return currentObj[text];
        }
        // Row is a content
      } else if (item.size === 3) {
        // Add a new property
        const row = Array.from(item.values());
        acc[row[1]] = row[2];
        return acc;
      }
    }, data);

    return data;
  }

  /**
   * @desc Parses EGRUL pdf file
   * @param {string} path - pdf file path
   * @returns {Object} - promise object represents an object with normalized file content
   */
  async parse(path) {
    const data = await this.read(path);
    const parsedData = this.convert(data);
    return this.normalizeData(parsedData);
  }
}

module.exports = Parser;
