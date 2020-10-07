// Extracts data from parsed egrul pdf files

let type = null;

const getData = (data, ...fields) => {
  let value = data;
  for (const field of fields) {
    if (value[field] === undefined) return null;
    value = value[field];
  }
  return value;
};

const getINN = (data) => {
  return (
    getData(data, 'Сведения об учете в налоговом органе', 'ИНН') ||
    getData(
      data,
      'Сведения об учете в налоговом органе',
      'Идентификационный номер налогоплательщика (ИНН)'
    )
  );
};

const getType = (inn) => {
  // There are organisations that do not have an inn
  if (inn === null) return 'legal';
  return inn.length === 10 ? 'legal' : 'individual';
};

const getNameObject = (data) => {
  let name = getData(data, 'Наименование');
  let fio, latin;
  if (name === null) {
    name = getData(data, 'Фамилия, имя, отчество (при наличии) индивидуального предпринимателя');
    if (name === null) return null;
    fio = [name['Фамилия'], name['Имя'], name['Отчество']].filter((item) => !!item).join(' ');
    latin = [name['Фамилия (латинскими буквами)'], name['Имя (латинскими буквами)']]
      .filter((item) => !!item)
      .join(' ');
    return {
      full: fio ? `ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ${fio}` : null,
      short: fio ? `ИП ${fio}` : null,
      latin: latin || null,
      fio: fio || null,
      sex: getData(name, 'Пол'),
      citizenship: getData(data, 'Сведения о гражданстве', 'Гражданство'),
      country: getData(
        data,
        'Сведения о гражданстве',
        'Государство гражданства иностранного гражданина'
      ),
    };
  }
  return {
    full: getData(name, 'Полное наименование'),
    short: getData(name, 'Сокращенное наименование'),
  };
};

const getAddressObject = (address) => {
  if (address === null) return null;
  const addressMap = new Map([
    ['postal_code', getData(address, 'Почтовый индекс')],
    ['region', getData(address, 'Субъект Российской Федерации')],
    ['area', getData(address, 'Район (улус и т.п.)')],
    ['city', getData(address, 'Город (волость и т.п.)')],
    ['settlement', getData(address, 'Населенный пункт (село и т.п.)')],
    ['street', getData(address, 'Улица (проспект, переулок и т.д.)')],
    ['house', getData(address, 'Дом (владение и т.п.)')],
    ['block', getData(address, 'Корпус (строение и т.п.)')],
    ['flat', getData(address, 'Офис (квартира и т.п.)')],
    ['additional', getData(address, 'Дополнительные сведения')],
  ]);
  let fullAddress = '';
  addressMap.forEach((value, key) => {
    if (value !== null && key !== 'additional') fullAddress += `${value}, `;
  });
  if (!fullAddress && !addressMap.get('additional')) return null;
  addressMap.set('full_address', fullAddress.slice(0, -2));
  return Object.fromEntries(addressMap.entries());
};

const getRegistrationObject = (data) => {
  const regField =
    type === 'legal'
      ? 'Сведения о регистрации'
      : getData(data, 'Сведения о регистрации индивидуального предпринимателя') !== null
      ? 'Сведения о регистрации индивидуального предпринимателя'
      : 'Сведения о регистрации крестьянского (фермерского) хозяйства';
  const prevRegNumberField =
    type === 'legal'
      ? 'Регистрационный номер, присвоенный до 1 июля 2002 года'
      : 'Регистрационный номер, присвоенный до 1 января 2004 года';
  const prevRegDateField =
    type === 'legal'
      ? 'Дата регистрации до 1 июля 2002 года'
      : 'Дата регистрации до 1 января 2004 года';
  const crimeaRegField =
    'Сведения о регистрации на территории Республики Крым или территории города федерального значения Севастополя на день принятия в Российскую Федерацию Республики Крым и образования в составе Российской Федерации новых субъектов - Республики Крым и города федерального значения Севастополя';
  const registrationObject = {
    method: getData(data, regField, 'Способ образования'),
    prev_reg_number: getData(data, regField, prevRegNumberField),
    prev_reg_date: getData(data, regField, prevRegDateField),
    prev_reg_authority: getData(
      data,
      regField,
      'Наименование органа, зарегистрировавшего юридическое лицо до 1 июля 2002 года'
    ),
    crimea_reg_number: getData(data, regField, crimeaRegField, 'Регистрационный номер'),
    crimea_reg_date: getData(data, regField, crimeaRegField, 'Дата регистрации'),
  };
  return Object.values(registrationObject).every((item) => item === null)
    ? null
    : registrationObject;
};

const getAuthoritiesObject = (data) => {
  const ftsRegFieldName =
    type === 'legal'
      ? 'Сведения о регистрирующем органе по месту нахождения юридического лица'
      : getData(
          data,
          'Сведения о регистрирующем органе по месту жительства индивидуального предпринимателя'
        ) !== null
      ? 'Сведения о регистрирующем органе по месту жительства индивидуального предпринимателя'
      : 'Сведения о регистрирующем органе по месту жительства главы крестьянского (фермерского) хозяйстве';
  const ftsRegistration = getData(data, ftsRegFieldName);
  const ftsReport = getData(data, 'Сведения об учете в налоговом органе');
  const pf = getData(
    data,
    'Сведения о регистрации в качестве страхователя в территориальном органе Пенсионного фонда Российской Федерации'
  );
  const sif = getData(
    data,
    'Сведения о регистрации в качестве страхователя в исполнительном органе Фонда социального страхования Российской Федерации'
  );
  return {
    fts_registration: ftsRegistration
      ? {
          name: getData(ftsRegistration, 'Наименование регистрирующего органа'),
          address: getData(ftsRegistration, 'Адрес регистрирующего органа'),
        }
      : null,
    fts_report: ftsReport
      ? {
          name: getData(ftsReport, 'Наименование налогового органа'),
          date: getData(ftsReport, 'Дата постановки на учет'),
        }
      : null,
    pf: pf
      ? {
          name: getData(pf, 'Наименование территориального органа Пенсионного фонда'),
          date: getData(pf, 'Дата регистрации'),
          registration_number: getData(pf, 'Регистрационный номер'),
        }
      : null,
    sif: sif
      ? {
          name: getData(sif, 'Наименование исполнительного органа Фонда социального страхования'),
          date: getData(sif, 'Дата регистрации'),
          registration_number: getData(sif, 'Регистрационный номер'),
        }
      : null,
  };
};

const getOKVEDObject = (okved) => {
  if (okved === null) return null;
  const value = getData(okved, 'Код и наименование вида деятельности');
  if (value === null) return null;
  const [code, ...name] = value.split(' ');
  return { code, name: name.join(' ') };
};

const getOKVEDObjects = (okved) => {
  if (okved === null) return null;
  const okvedType = getData(okved, 'Дополнительные сведения');
  return {
    type: okvedType ? okvedType.slice(1, -1) : null,
    main: getOKVEDObject(getData(okved, 'Сведения об основном виде деятельности')),
    additional: getObjects(
      getData(okved, 'Сведения о дополнительных видах деятельности'),
      getOKVEDObject
    ),
  };
};

const getLicenseObject = (license) => {
  if (license === null) return null;
  return {
    number: getData(license, 'Номер лицензии'),
    issue_date: getData(license, 'Дата лицензии'),
    issue_authority: getData(
      license,
      'Наименование лицензирующего органа, выдавшего или переоформившего лицензию'
    ),
    valid_from: getData(license, 'Дата начала действия лицензии'),
    valid_to: getData(license, 'Дата окончания действия лицензии'),
    activity: getData(license, 'Вид лицензируемой деятельности, на который выдана лицензия'),
  };
};

const getLiquidationObject = (data) => {
  const liquidationField =
    type === 'legal'
      ? 'Сведения о прекращении'
      : getData(
          data,
          'Сведения о прекращении деятельности в качестве индивидуального предпринимателя'
        ) !== null
      ? 'Сведения о прекращении деятельности в качестве индивидуального предпринимателя'
      : 'Сведения о прекращении крестьянского (фермерского) хозяйства';
  const dataField = type === 'legal' ? 'Дата прекращения' : 'Дата прекращения деятельности';
  const liquidation = getData(data, liquidationField);
  return liquidation
    ? {
        method: getData(liquidation, 'Способ прекращения'),
        date: getData(liquidation, dataField),
        authority: getData(
          liquidation,
          'Наименование органа, внесшего запись о прекращении юридического лица'
        ),
      }
    : null;
};

const getManagementObject = (data) => {
  const management = getData(
    data,
    'Сведения о лице, имеющем право без доверенности действовать от имени юридического лица'
  );
  if (management === null) return null;
  const name = [management['Фамилия'], management['Имя'], management['Отчество']]
    .filter((item) => !!item)
    .join(' ');
  return {
    post: getData(management, 'Должность'),
    name: name || null,
    inn: getData(management, 'ИНН'),
  };
};

const getFounderObject = (founder) => {
  if (founder === null) return null;
  const name = [founder['Фамилия'], founder['Имя'], founder['Отчество']]
    .filter((item) => !!item)
    .join(' ');
  return {
    name: name || getData(founder, 'Полное наименование'),
    inn: getData(founder, 'ИНН'),
    share_nominal: getData(founder, 'Номинальная стоимость доли (в рублях)'),
    share_percent: getData(founder, 'Размер доли (в процентах)'),
  };
};

const getBranchObject = (branch) => {
  if (branch === null) return null;
  const fts = getData(branch, 'Сведения об учете в налоговом органе по месту нахождения филиала');
  return {
    name: getData(branch, 'Наименование'),
    country: getData(branch, 'Страна места нахождения'),
    address_string: getData(branch, 'Адрес места нахождения'),
    address: getAddressObject(branch),
    fts_report: fts
      ? {
          kpp: getData(fts, 'КПП'),
          date: getData(fts, 'Дата постановки на учет'),
          name: getData(fts, 'Наименование налогового органа'),
        }
      : null,
  };
};

const getObjects = (data, getObject) => {
  if (data === null) return null;
  if (Object.keys(data)[0] !== '1') return getObject(data);
  return Object.values(data).map((item) => getObject(item));
};

/**
 * @desc Extracts data from parsed egrul pdf files
 * @param {Object} data - an object representing a parsed egrul pdf file
 * @returns {Object} - an object with data
 */
module.exports = (data) => {
  const inn = getINN(data);
  type = getType(inn);
  return {
    inn: inn,
    kpp: getData(data, 'Сведения об учете в налоговом органе', 'КПП'),
    ogrn:
      getData(data, 'Сведения о регистрации', 'ОГРН') ||
      getData(data, 'Сведения о регистрации индивидуального предпринимателя', 'ОГРНИП') ||
      getData(data, 'Сведения о регистрации крестьянского (фермерского) хозяйства', 'ОГРНИП'),
    ogrn_date:
      getData(data, 'Сведения о регистрации', 'Дата регистрации') ||
      getData(data, 'Сведения о регистрации', 'Дата присвоения ОГРН') ||
      getData(data, 'Сведения о регистрации индивидуального предпринимателя', 'Дата регистрации') ||
      getData(
        data,
        'Сведения о регистрации индивидуального предпринимателя',
        'Дата присвоения ОГРНИП'
      ) ||
      getData(
        data,
        'Сведения о регистрации крестьянского (фермерского) хозяйства',
        'Дата регистрации'
      ) ||
      getData(
        data,
        'Сведения о регистрации крестьянского (фермерского) хозяйства',
        'Дата присвоения ОГРНИП'
      ),
    type: type,
    name: getNameObject(data),
    address: getAddressObject(getData(data, 'Адрес (место нахождения)')),
    registration: getRegistrationObject(data),
    liquidation: getLiquidationObject(data),
    state: getData(data, 'Сведения о состоянии юридического лица', 'Состояние'),
    okveds: getOKVEDObjects(
      getData(
        data,
        'Сведения о видах экономической деятельности по Общероссийскому классификатору видов экономической деятельности'
      )
    ),
    licenses: getObjects(getData(data, 'Сведения о лицензиях'), getLicenseObject),
    authorities: getAuthoritiesObject(data),
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
          inn: getData(
            data,
            'Сведения о держателе реестра акционеров акционерного общества',
            'ИНН'
          ),
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
  };
};
