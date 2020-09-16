const getData = (data, ...fields) => {
  let value = data;
  for (const field of fields) {
    if (value[field] === undefined) return null;
    value = value[field];
  }
  return value;
};

const getAddressObject = (address) => {
  if (address === null) return null;
  const addressObject = {
    postal_code: address['Почтовый индекс'] || null,
    region: address['Субъект Российской Федерации'] || null,
    area: address['Район (улус и т.п.)'] || null,
    city: address['Город (волость и т.п.)'] || null,
    settlement: address['Населенный пункт (село и т.п.)'] || null,
    street: address['Улица (проспект, переулок и т.д.)'] || null,
    house: address['Дом (владение и т.п.)'] || null,
    flat: address['Офис (квартира и т.п.)'] || null,
  };
  return Object.values(addressObject).every((item) => item === null) ? null : addressObject;
};

const getOKVEDObject = (okved) => {
  if (okved === null) return null;
  const value = okved['Код и наименование вида деятельности'];
  if (!value) return null;
  const [code, ...name] = value.split(' ');
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

const getBranchObject = (branch) => {
  if (branch === null) return null;
  const fts = branch['Сведения об учете в налоговом органе по месту нахождения филиала'];
  return {
    name: branch['Наименование'] || null,
    country: branch['Страна места нахождения'] || null,
    address_string: branch['Адрес места нахождения'] || null,
    address: getAddressObject(branch),
    fts_report: fts
      ? {
          kpp: fts['КПП'],
          date: fts['Дата постановки на учет'],
          name: fts['Наименование налогового органа'],
        }
      : null,
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
  ogrn: getData(data, 'Сведения о регистрации', 'ОГРН'),
  ogrn_date: getData(data, 'Сведения о регистрации', 'Дата регистрации'),
  full_name: getData(data, 'Наименование', 'Полное наименование'),
  short_name: getData(data, 'Наименование', 'Сокращенное наименование'),
  address: getAddressObject(getData(data, 'Адрес (место нахождения)')),
  registration: {
    method: getData(data, 'Сведения о регистрации', 'Способ образования'),
    prev_reg_number: getData(
      data,
      'Сведения о регистрации',
      'Регистрационный номер, присвоенный до 1 июля 2002 года'
    ),
    prev_reg_date: getData(data, 'Сведения о регистрации', 'Дата регистрации до 1 июля 2002 года'),
    prev_reg_authority: getData(
      data,
      'Сведения о регистрации',
      'Наименование органа, зарегистрировавшего юридическое лицо до 1 июля 2002 года'
    ),
  },
  liquidation: getData(data, 'Сведения о прекращении')
    ? {
        method: getData(data, 'Сведения о прекращении', 'Способ прекращения'),
        date: getData(data, 'Сведения о прекращении', 'Дата прекращения'),
        authority: getData(
          data,
          'Сведения о прекращении',
          'Наименование органа, внесшего запись о прекращении юридического лица'
        ),
      }
    : null,
  state: getData(data, 'Сведения о состоянии юридического лица', 'Состояние'),
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
    fts_registration: getData(
      data,
      'Сведения о регистрирующем органе по месту нахождения юридического лица'
    )
      ? {
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
        }
      : null,
    fts_report: getData(data, 'Сведения об учете в налоговом органе')
      ? {
          name: getData(
            data,
            'Сведения об учете в налоговом органе',
            'Наименование налогового органа'
          ),
          date: getData(data, 'Сведения об учете в налоговом органе', 'Дата постановки на учет'),
        }
      : null,
    pf: getData(
      data,
      'Сведения о регистрации в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации'
    )
      ? {
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
        }
      : null,
    sif: getData(
      data,
      'Сведения о регистрации в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации'
    )
      ? {
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
        }
      : null,
  },
  management: getManagementObject(data),
  founders: getObjects(
    getData(data, 'Сведения об учредителях (участниках) юридического лица'),
    getFounderObject
  ),
  register_holder: getData(data, 'Сведения о держателе реестра акционеров акционерного общества')
    ? {
        ogrn: getData(
          data,
          'Сведения о держателе реестра акционеров акционерного общества',
          'ОГРН'
        ),
        inn: getData(data, 'Сведения о держателе реестра акционеров акционерного общества', 'ИНН'),
        name: getData(
          data,
          'Сведения о держателе реестра акционеров акционерного общества',
          'Полное наименование'
        ),
      }
    : null,
  capital: getData(
    data,
    'Сведения об уставном капитале (складочном капитале, уставном фонде, паевых взносах)'
  )
    ? {
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
      }
    : null,
  subs: getData(data, 'Сведения о филиалах и представительствах')
    ? {
        branches: getObjects(
          getData(data, 'Сведения о филиалах и представительствах', 'Филиалы'),
          getBranchObject
        ),
        representative_offices: getObjects(
          getData(data, 'Сведения о филиалах и представительствах', 'Представительства'),
          getBranchObject
        ),
      }
    : null,
});
