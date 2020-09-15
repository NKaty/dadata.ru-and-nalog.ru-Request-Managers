const getData = (data, ...fields) => {
  let value = data;
  for (const field of fields) {
    if (value[field] === undefined) return null;
    value = value[field];
  }
  return value;
};

const getOKVEDObject = (okved) => {
  if (okved === null) return null;
  const [code, ...name] = okved['Код и наименование вида деятельности'].split(' ');
  return { code, name: name.join(' ') };
};

const getLicenseObject = (license) => {
  if (license === null) return null;
  return {
    number: license['Номер лицензии'] || null,
    issue_date: license['Дата лицензии'] || null,
    issue_authority:
      license['Наименование лицензирующего органа, выдавшего или переоформившего лицензию'] || null,
    valid_from: license['Дата начала действия лицензии'] || null,
    valid_to: license['Дата окончания действия лицензии'] || null,
    activity: license['Вид лицензируемой деятельности, на который выдана лицензия'] || null,
  };
};

const getManagementObject = (data) => {
  const management =
    data['Сведения о лице, имеющем право без доверенности действовать от имени юридического лица'];
  if (!management) return null;
  return {
    post: management['Должность'] || null,
    name: `${management['Фамилия']} ${management['Имя']} ${management['Отчество']}` || null,
    inn: management['ИНН'] || null,
  };
};

const getFounderObject = (founder) => {
  if (founder === null) return null;
  return {
    name:
      founder['Полное наименование'] ||
      `${founder['Фамилия']} ${founder['Имя']} ${founder['Отчество']}` ||
      null,
    inn: founder['ИНН'] || null,
    share_nominal: founder['Номинальная стоимость доли (в рублях)'] || null,
    share_percent: founder['Размер доли (в процентах)'] || null,
  };
};

const getObjects = (data, getObject) => {
  if (data === null) return null;
  if (Object.keys(data)[0] !== '1') return getObject(data);
  return Object.values(data).map((item) => getObject(item));
};

module.exports = (data) => ({
  inn: getData(data, 'Сведения об учете в налоговом органе', 'ИНН'),
  kpp: getData(data, 'Сведения об учете в налоговом органе', 'КПП'),
  ogrn: getData(data, 'Сведения о прекращении', 'ОГРН'),
  ogrn_date: getData(data, 'Сведения о регистрации', 'Дата регистрации'),
  liquidation_date: getData(data, 'Сведения о регистрации', 'Дата прекращения'),
  full_name: getData(data, 'Наименование', 'Полное наименование'),
  short_name: getData(data, 'Наименование', 'Сокращенное наименование'),
  address: {
    postal_code: getData(data, 'Адрес (место нахождения)', 'Почтовый индекс'),
    region: getData(data, 'Адрес (место нахождения)', 'Субъект Российской Федерации'),
    area: getData(data, 'Адрес (место нахождения)', 'Район (улус и т.п.)'),
    city: getData(data, 'Адрес (место нахождения)', 'Город (волость и т.п.)'),
    settlement: getData(data, 'Адрес (место нахождения)', 'Населенный пункт (село и т.п.)'),
    street: getData(data, 'Адрес (место нахождения)', 'Улица (проспект, переулок и т.д.)'),
    house: getData(data, 'Адрес (место нахождения)', 'Дом (владение и т.п.)'),
    flat: getData(data, 'Адрес (место нахождения)', 'Офис (квартира и т.п.)'),
  },
  okveds: {
    main: getOKVEDObject(
      getData(
        data,
        'Сведения о видах экономической деятельности по Общероссийскому классификатору видов экономической деятельности',
        'Сведения об основном виде деятельности'
      )
    ),
    additional: getObjects(
      getData(
        data,
        'Сведения о видах экономической деятельности по Общероссийскому классификатору видов экономической деятельности',
        'Сведения о дополнительных видах деятельности'
      ),
      getOKVEDObject
    ),
  },
  licenses: getObjects(getData(data, 'Сведения о лицензиях'), getLicenseObject),
  authorities: {
    fts_registration: {
      name: getData(
        data,
        'Сведения о регистрирующем органе по месту нахождения юридического лица',
        'Наименование регистрирующего органа'
      ),
      address: getData(
        data,
        'Сведения о регистрирующем органе по месту нахождения юридического лица',
        'Адрес регистрирующего органа'
      ),
    },
    fts_report: {
      name: getData(data, 'Сведения об учете в налоговом органе', 'Наименование налогового органа'),
      date: getData(data, 'Сведения об учете в налоговом органе', 'Дата постановки на учет'),
    },
    pf: {
      name: getData(
        data,
        'Сведения о регистрации в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации',
        'Наименование территориального органа Пенсионного фонда'
      ),
      date: getData(
        data,
        'Сведения о регистрации в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации',
        'Дата регистрации'
      ),
      registration_number: getData(
        data,
        'Сведения о регистрации в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации',
        'Регистрационный номер'
      ),
    },
    sif: {
      name: getData(
        data,
        'Сведения о регистрации в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации',
        'Наименование исполнительного органа Фонда социального страхования'
      ),
      date: getData(
        data,
        'Сведения о регистрации в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации',
        'Дата регистрации'
      ),
      registration_number: getData(
        data,
        'Сведения о регистрации в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации',
        'Регистрационный номер'
      ),
    },
  },
  management: getManagementObject(data),
  founders: getObjects(
    getData(data, 'Сведения об учредителях (участниках) юридического лица'),
    getFounderObject
  ),
  capital: {
    type: getData(
      data,
      'Сведения об уставном капитале (складочном капитале, уставном фонде, паевых взносах)',
      'Вид'
    ),
    value: getData(
      data,
      'Сведения об уставном капитале (складочном капитале, уставном фонде, паевых взносах)',
      'Размер (в рублях)'
    ),
  },
});
