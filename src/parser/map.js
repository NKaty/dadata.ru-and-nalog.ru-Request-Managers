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
      full: fio ? `Индивидуальный предприниматель ${fio}` : null,
      short: fio ? `ИП ${fio}` : null,
      latin: latin || null,
      fio: fio || null,
      sex: name['Пол'] || null,
      citizenship: getData(data, 'Сведения о гражданстве', 'Гражданство'),
      country: getData(
        data,
        'Сведения о гражданстве',
        'Государство гражданства иностранного гражданина'
      ),
    };
  }
  return {
    full: name['Полное наименование'] || null,
    short: name['Сокращенное наименование'] || null,
  };
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
    additional: address['Дополнительные сведения'] || null,
  };
  return Object.values(addressObject).every((item) => item === null) ? null : addressObject;
};

const getRegistrationObject = (data) => {
  const regField =
    type === 'legal'
      ? 'Сведения о регистрации'
      : 'Сведения о регистрации индивидуального предпринимателя';
  const prevRegNumberField =
    type === 'legal'
      ? 'Регистрационный номер, присвоенный до 1 июля 2002 года'
      : 'Регистрационный номер, присвоенный до 1 января 2004 года';
  const prevRegDateField =
    type === 'legal'
      ? 'Дата регистрации до 1 июля 2002 года'
      : 'Дата регистрации до 1 января 2004 года';
  const registrationObject = {
    method: getData(data, regField, 'Способ образования'),
    prev_reg_number: getData(data, regField, prevRegNumberField),
    prev_reg_date: getData(data, regField, prevRegDateField),
    prev_reg_authority: getData(
      data,
      regField,
      'Наименование органа, зарегистрировавшего юридическое лицо до 1 июля 2002 года'
    ),
  };
  return Object.values(registrationObject).every((item) => item === null)
    ? null
    : registrationObject;
};

const getAuthoritiesObject = (data) => {
  const ftsRegFieldName =
    type === 'legal'
      ? 'Сведения о регистрирующем органе по месту нахождения юридического лица'
      : 'Сведения о регистрирующем органе по месту жительства индивидуального предпринимателя';
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

const getLiquidationObject = (data) => {
  const liquidationField =
    type === 'legal'
      ? 'Сведения о прекращении'
      : 'Сведения о прекращении деятельности в качестве индивидуального предпринимателя';
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

module.exports = (data) => {
  const inn = getINN(data);
  type = getType(inn);
  return {
    inn: inn,
    kpp: getData(data, 'Сведения об учете в налоговом органе', 'КПП'),
    ogrn:
      getData(data, 'Сведения о регистрации', 'ОГРН') ||
      getData(data, 'Сведения о регистрации индивидуального предпринимателя', 'ОГРНИП'),
    ogrn_date:
      getData(data, 'Сведения о регистрации', 'Дата регистрации') ||
      getData(data, 'Сведения о регистрации', 'Дата присвоения ОГРН') ||
      getData(data, 'Сведения о регистрации индивидуального предпринимателя', 'Дата регистрации') ||
      getData(
        data,
        'Сведения о регистрации индивидуального предпринимателя',
        'Дата присвоения ОГРНИП'
      ),
    type: type,
    name: getNameObject(data),
    address: getAddressObject(getData(data, 'Адрес (место нахождения)')),
    registration: getRegistrationObject(data),
    liquidation: getLiquidationObject(data),
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
