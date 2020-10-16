// Extracts data from parsed egrul pdf files

let type = null;

const getData = (data, ...fields) => {
  if (data === null || data === undefined) return null;
  let value = data;
  for (const field of fields) {
    if (value[field] === undefined) return null;
    value = value[field];
  }
  return value;
};

const checkIsObjectEmpty = (obj) => {
  return Object.values(obj).every((item) => item === null) ? null : obj;
};

const getName = (data) => {
  if (!data) return null;
  return [data['Фамилия'], data['Имя'], data['Отчество']].filter((item) => !!item).join(' ');
};

const getINN = (data) => {
  if (getData(data, 'Сведения о реорганизации'))
    console.log(getData(data, 'Сведения об учете в налоговом органе', 'ИНН'));
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
    fio = getName(name);
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
    ['additional_info', getData(address, 'Дополнительные сведения')],
  ]);
  let fullAddress = '';
  addressMap.forEach((value, key) => {
    if (value !== null && value !== '-' && value !== '--' && key !== 'additional_info')
      fullAddress += `${value}, `;
  });
  if (!fullAddress && !addressMap.get('additional_info')) return null;
  addressMap.set('full_address', fullAddress.slice(0, -2));
  return Object.fromEntries(addressMap.entries());
};

const getPreviousRegistrationObject = (prevReg, type) => {
  const prevRegNumberField =
    type === 'legal'
      ? 'Регистрационный номер, присвоенный до 1 июля 2002 года'
      : 'Регистрационный номер, присвоенный до 1 января 2004 года';
  const prevRegDateField =
    type === 'legal'
      ? 'Дата регистрации до 1 июля 2002 года'
      : 'Дата регистрации до 1 января 2004 года';
  return {
    prev_reg_number: getData(prevReg, prevRegNumberField),
    prev_reg_date: getData(prevReg, prevRegDateField),
    prev_reg_authority:
      getData(
        prevReg,
        'Наименование органа, зарегистрировавшего юридическое лицо до 1 июля 2002 года'
      ) ||
      getData(
        prevReg,
        'Наименование органа, зарегистрировавшего юридического лица до 1 июля 2002 года'
      ),
  };
};

const getRegistrationObject = (data) => {
  const regField =
    type === 'legal'
      ? 'Сведения о регистрации'
      : getData(data, 'Сведения о регистрации индивидуального предпринимателя') !== null
      ? 'Сведения о регистрации индивидуального предпринимателя'
      : 'Сведения о регистрации крестьянского (фермерского) хозяйства';
  const crimeaRegField =
    'Сведения о регистрации на территории Республики Крым или территории города федерального значения Севастополя на день принятия в Российскую Федерацию Республики Крым и образования в составе Российской Федерации новых субъектов - Республики Крым и города федерального значения Севастополя';
  const registrationObject = {
    method: getData(data, regField, 'Способ образования'),
    ...getPreviousRegistrationObject(getData(data, regField), type),
    crimea_reg_number: getData(data, regField, crimeaRegField, 'Регистрационный номер'),
    crimea_reg_date: getData(data, regField, crimeaRegField, 'Дата регистрации'),
  };
  return checkIsObjectEmpty(registrationObject);
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
  const okvedType = getData(okved, 'Дополнительный заголовок');
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
  return {
    post: getData(management, 'Должность'),
    name: getName(management) || null,
    inn: getData(management, 'ИНН'),
    additional_info: getData(management, 'Дополнительные сведения'),
  };
};

const getFounderObject = (founder) => {
  if (founder === null) return null;
  const managerField =
    'Сведения об органе государственной власти, органе местного самоуправления, юридическом лице, осуществляющем права учредителя (участника)';
  return {
    name: getName(founder) || getData(founder, 'Полное наименование'),
    inn: getData(founder, 'ИНН'),
    ogrn: getData(founder, 'ОГРН'),
    prev_reg: checkIsObjectEmpty(
      getPreviousRegistrationObject(founder, getType(getData(founder, 'ИНН')))
    ),
    region: getData(founder, 'Субъект Российской Федерации'),
    area: getData(founder, 'Муниципальное образование'),
    company_exercising_founder_rights: getObjects(getData(founder, managerField), (companies) => ({
      name: getData(companies, 'Полное наименование'),
      inn: getData(companies, 'ИНН'),
      ogrn: getData(companies, 'ОГРН'),
      prev_reg: checkIsObjectEmpty(
        getPreviousRegistrationObject(companies, getType(getData(companies, 'ИНН')))
      ),
    })),
    for_foreign_company: checkIsObjectEmpty({
      country: getData(founder, 'Страна происхождения'),
      reg_date: getData(founder, 'Дата регистрации'),
      reg_number: getData(founder, 'Регистрационный номер'),
      reg_authority: getData(founder, 'Наименование регистрирующего органа'),
      origin_address: getData(founder, 'Адрес (место нахождения) в стране происхождения'),
    }),
    share_nominal: getData(founder, 'Номинальная стоимость доли (в рублях)'),
    share_percent: getData(founder, 'Размер доли (в процентах)'),
    share_fraction: getData(founder, 'Размер доли (в виде простой дроби)'),
    pledge: checkIsObjectEmpty({
      type: getData(founder, 'Сведения об обременении', 'Вид обременения'),
      term: getData(
        founder,
        'Сведения об обременении',
        'Срок обременения или порядок определения срока'
      ),
      pledgee: checkIsObjectEmpty({
        ogrn: getData(founder, 'Сведения о залогодержателе', 'ОГРН'),
        inn: getData(founder, 'Сведения о залогодержателе', 'ИНН'),
        name:
          getData(founder, 'Сведения о залогодержателе', 'Полное наименование') ||
          getName(getData(founder, 'Сведения о залогодержателе')),
      }),
      contract: checkIsObjectEmpty({
        number: getData(
          founder,
          'Сведения о нотариальном удостоверении договора залога',
          'Номер договора'
        ),
        date: getData(
          founder,
          'Сведения о нотариальном удостоверении договора залога',
          'Дата договора'
        ),
        fio_notary: getData(
          founder,
          'Сведения о нотариальном удостоверении договора залога',
          'Фамилия, имя, отчество нотариуса, удостоверившего договор'
        ),
        inn_notary: getData(
          founder,
          'Сведения о нотариальном удостоверении договора залога',
          'ИНН нотариуса, удостоверившего договор'
        ),
      }),
    }),
    trustee: checkIsObjectEmpty({
      inheritance_opening_date: getData(
        founder,
        'Сведения о доверительном управляющем',
        'Дата открытия наследства'
      ),
      name: getName(getData(founder, 'Сведения о доверительном управляющем')),
      inn: getData(founder, 'Сведения о доверительном управляющем', 'ИНН'),
    }),
    additional_info: getData(founder, 'Дополнительные сведения'),
  };
};

const getCapitalObject = (capital) => {
  if (capital == null) return null;
  return {
    type: getData(capital, 'Вид'),
    value: getData(capital, 'Размер (в рублях)'),
    reducing: checkIsObjectEmpty({
      by: getData(
        capital,
        'Сведения об уменьшении уставного капитала',
        'Величина, на которую уменьшается уставный капитал'
      ),
      date: getData(
        capital,
        'Сведения об уменьшении уставного капитала',
        'Дата принятия решения об уменьшении уставного капитала'
      ),
    }),
    increasing: checkIsObjectEmpty({
      by: getData(
        capital,
        'Сведения об увеличении уставного капитала',
        'Величина, на которую увеличивается уставный капитал'
      ),
      date: getData(
        capital,
        'Сведения об увеличении уставного капитала',
        'Дата принятия решения об увеличении уставного капитала'
      ),
    }),
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

const getReorganizationObject = (reorganization) => {
  if (reorganization === null) return null;
  return {
    type: getData(reorganization, 'Форма реорганизации'),
    participants: getObjects(
      getData(reorganization, 'Сведения о юридических лицах, участвующих  в реорганизации'),
      (participant) => {
        if (participant === null) return null;
        return {
          ogrn: getData(participant, 'ОГРН'),
          inn: getData(participant, 'ИНН'),
          name: getData(participant, 'Полное наименование'),
          status_after: getData(
            participant,
            'Состояние юридического лица после завершения реорганизации'
          ),
        };
      }
    ),
  };
};

const getPredecessorObject = (predecessor) => {
  if (predecessor === null) return null;
  return {
    ogrn: getData(predecessor, 'ОГРН'),
    inn: getData(predecessor, 'ИНН'),
    name: getData(predecessor, 'Полное наименование'),
  };
};

const getSuccessorObject = (successor) => {
  if (successor === null) return null;
  return {
    ogrn: getData(successor, 'ОГРН'),
    inn: getData(successor, 'ИНН'),
    name: getData(successor, 'Полное наименование'),
  };
};

const getObjects = (data, getObject) => {
  if (data === null) return null;
  if (!Object.keys(data).filter((key) => key === '1').length) return [getObject(data)];
  return Object.keys(data)
    .filter((key) => key !== 'Дополнительный заголовок')
    .map((key) => getObject(data[key]));
};

/**
 * @desc Extracts data from parsed egrul and egrip pdf files
 * @param {Object} data - an object representing a parsed egrul (egrip) pdf file
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
    register_holder: checkIsObjectEmpty({
      ogrn: getData(data, 'Сведения о держателе реестра акционеров акционерного общества', 'ОГРН'),
      inn: getData(data, 'Сведения о держателе реестра акционеров акционерного общества', 'ИНН'),
      name: getData(
        data,
        'Сведения о держателе реестра акционеров акционерного общества',
        'Полное наименование'
      ),
    }),
    capital: getCapitalObject(
      getData(
        data,
        'Сведения об уставном капитале (складочном капитале, уставном фонде, паевых взносах)'
      )
    ),
    capital_owned_by_company: checkIsObjectEmpty({
      share_nominal: getData(
        data,
        'Сведения о доле в уставном капитале общества с ограниченной ответственностью, принадлежащей обществу',
        'Номинальная стоимость доли (в рублях)'
      ),
      share_percent: getData(
        data,
        'Сведения о доле в уставном капитале общества с ограниченной ответственностью, принадлежащей обществу',
        'Размер доли (в процентах)'
      ),
    }),
    managing_company: checkIsObjectEmpty({
      name: getData(data, 'Сведения об управляющей организации', 'Полное наименование'),
      ogrn: getData(data, 'Сведения об управляющей организации', 'ОГРН'),
      inn: getData(data, 'Сведения об управляющей организации', 'ИНН'),
      additional_info: getData(
        data,
        'Сведения об управляющей организации',
        'Дополнительные сведения'
      ),
    }),
    reorganization: getReorganizationObject(getData(data, 'Сведения о реорганизации')),
    predecessors: getObjects(
      getData(data, 'Сведения о правопредшественнике'),
      getPredecessorObject
    ),
    successors: getObjects(getData(data, 'Сведения о правопреемнике'), getSuccessorObject),
    subs: checkIsObjectEmpty({
      branches: getObjects(
        getData(data, 'Сведения о филиалах и представительствах', 'Филиалы'),
        getBranchObject
      ),
      representative_offices: getObjects(
        getData(data, 'Сведения о филиалах и представительствах', 'Представительства'),
        getBranchObject
      ),
    }),
  };
};
