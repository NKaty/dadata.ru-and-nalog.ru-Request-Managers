/**
 * @desc Extracts the desired fields from a pdf object
 * @param {String} path - a pdf path
 * @param {Object} item - an object parsed from pdf file
 * @param {Boolean} withPath - include or not path into returning object
 * @returns {Object} - an object with the desired fields
 */
module.exports = (path, item, withPath = false) => {
  // If all the fields are needed, just
  // return item;
  const data = {
    full_name: item.name.full,
    short_name: item.name.short,
    inn: item.inn,
    kpp: item.kpp,
    ogrn: item.ogrn,
    ogrn_date: item.ogrn_date,
    type: item.type,
    address: item.address,
    management: {
      post: item.management && item.management.post,
      name: item.management && item.management.name,
      inn: item.management && item.management.inn,
    },
    status: item.state,
  };
  if (!withPath) return data;
  return { path, data };
};
