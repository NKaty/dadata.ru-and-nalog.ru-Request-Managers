// Extract the desired fields from a dadata object
/**
 * @desc Extracts the desired fields from a dadata object
 * @param {Object} item - an object received from dadata.ru api
 * @returns {Object} - an object with the desired fields
 */
module.exports = (item) => {
  // If all the fields are needed, just
  // return item.data;
  const data = item.data;
  return {
    full_name: data.name.full_with_opf,
    short_name: data.name.short_with_opf,
    inn: data.inn,
    kpp: data.kpp,
    ogrn: data.ogrn,
    ogrn_date: data.ogrn_date,
    type: data.type,
    okpo: data.okpo,
    address: data.address.data.source,
    management: {
      post: data.management && data.management.post,
      name: data.management && data.management.name,
    },
    status: data.state && data.state.status,
  };
};
