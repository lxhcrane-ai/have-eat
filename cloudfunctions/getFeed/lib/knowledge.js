// 运动营养知识库（供规则引擎引用 + 小程序内浏览）
// 每条都带 sources 数组，反馈里的建议必须能溯源到条目，不凭空生成。
// 来源字段说明：
// - sourceType：position_stand / consensus / systematic_review / narrative_review / textbook /
//   guideline / reference_data / regulation / official_report
// - sourceTier：primary（立场声明、共识、系统综述、指南、法规）/ secondary（教材、叙述性综述）
// - verificationStatus：verified / version_pending / chapter_pending / isbn_pending / pages_pending
// - 未核实的版本、章节号、页码一律写“待核实”，不编造。
// 数值区间来自下列公开共识声明与教材，具体个体仍需教练/营养师调整。

const CATEGORIES = [
  { id: 'weightcut', name: '赛前减重', desc: '分级、控重节奏、称重后恢复' },
  { id: 'protein', name: '蛋白质', desc: '总量、分配、质量' },
  { id: 'carb', name: '碳水与能量', desc: '训练日碳水、能量可用性' },
  { id: 'hydration', name: '水合与电解质', desc: '脱水判定、补液量、钠' },
  { id: 'recovery', name: '恢复与睡眠', desc: '睡眠时长、酸痛、负荷管理' },
  { id: 'fightday', name: '赛前与比赛日', desc: '赛前餐、称重后 24h、上场前' },
  { id: 'supplement', name: '补剂', desc: '有证据的少数几种' },
  { id: 'basic', name: '基础营养', desc: '食物选择、餐次结构' },
  { id: 'bodycomp', name: '体成分与能量消耗', desc: '测量方法、去脂体重、代谢率、青少年与女性' },
  { id: 'assessment', name: '营养评估', desc: '膳食记录、能量与蛋白评估、水合与铁状态' },
  { id: 'food', name: '食物与膳食指导', desc: '餐盘、宝塔、食物成分表、外食与备赛食物' }
];

// ---------- 公用书目 ----------
// J()：期刊/声明类默认值；B()：教材类默认值。条目只覆盖与本条相关的章节与核实状态。
function J(o) {
  return {
    sourceType: o.sourceType || 'position_stand',
    sourceTier: o.sourceTier || 'primary',
    citation: o.citation,
    year: o.year,
    doi: o.doi || '',
    url: o.url || '',
    authors: o.authors || '',
    editors: '',
    title: o.title || '',
    edition: '',
    publisher: o.publisher || '',
    isbn: '',
    chapterNo: '不适用',
    chapterTitle: '不适用',
    pages: o.pages || '不适用',
    language: o.language || 'en',
    verificationStatus: o.verificationStatus || 'verified',
    note: o.note || ''
  };
}

function B(o) {
  return {
    sourceType: o.sourceType || 'textbook',
    sourceTier: o.sourceTier || 'secondary',
    citation: o.citation,
    year: o.year || '待核实',
    doi: '',
    url: o.url || '',
    authors: o.authors || '',
    editors: o.editors || '',
    title: o.title,
    edition: o.edition || '待核实',
    publisher: o.publisher || '待核实',
    isbn: o.isbn || '待核实',
    chapterNo: o.chapterNo || '待核实',
    chapterTitle: o.chapterTitle || '待核实',
    pages: o.pages || '待核实',
    language: o.language || 'zh',
    verificationStatus: o.verificationStatus || 'pages_pending',
    note: o.note || ''
  };
}

const SRC = {
  acsm2021: J({
    sourceType: 'consensus', year: 2021,
    authors: 'American College of Sports Medicine',
    title: 'ACSM Expert Consensus Statement on Weight Loss in Weight-Category Sports',
    citation: 'American College of Sports Medicine. ACSM Expert Consensus Statement on Weight Loss in Weight-Category Sports. Curr Sports Med Rep. 2021.',
    doi: '10.1249/JSR.0000000000000831',
    url: 'https://doi.org/10.1249/JSR.0000000000000831',
    publisher: 'Current Sports Medicine Reports',
    pages: '待核实',
    verificationStatus: 'pages_pending',
    note: 'DOI 已核实；卷期与页码待核实。该共识取代 1996 年 ACSM 摔跤减重立场声明。'
  }),
  acsm2016: J({
    sourceType: 'position_stand', year: 2016,
    authors: 'Thomas DT, Erdman KA, Burke LM',
    title: 'Nutrition and athletic performance: position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine',
    citation: 'Thomas DT, Erdman KA, Burke LM. Nutrition and athletic performance: position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine. Med Sci Sports Exerc. 2016;48(3):543-568.',
    doi: '10.1249/MSS.0000000000000852',
    url: 'https://doi.org/10.1249/MSS.0000000000000852',
    publisher: 'Medicine & Science in Sports & Exercise',
    pages: '543-568'
  }),
  acsm2007: J({
    sourceType: 'position_stand', year: 2007,
    authors: 'Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS',
    title: 'Exercise and fluid replacement: ACSM position stand',
    citation: 'Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS; American College of Sports Medicine. Exercise and fluid replacement: ACSM position stand. Med Sci Sports Exerc. 2007;39(2):377-390.',
    doi: '10.1249/mss.0b013e31802ca597',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17277604/',
    publisher: 'Medicine & Science in Sports & Exercise',
    pages: '377-390'
  }),
  issn2025: J({
    sourceType: 'position_stand', year: 2025,
    authors: 'Ricci AA, Evans C, Stull C, Peacock CA, French DN, Stout JR, et al.',
    title: 'International Society of Sports Nutrition position stand: nutrition and weight cut strategies for mixed martial arts and other combat sports',
    citation: 'Ricci AA, Evans C, Stull C, Peacock CA, French DN, Stout JR, Fukuda DH, Galpin AJ, Tartar J, Johnson S, Kreider RB, Kerksick CM. International Society of Sports Nutrition position stand: nutrition and weight cut strategies for mixed martial arts and other combat sports. J Int Soc Sports Nutr. 2025;22(1):2467909.',
    doi: '10.1080/15502783.2025.2467909',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11894756/',
    publisher: 'Journal of the International Society of Sports Nutrition',
    pages: '2467909'
  }),
  issn2017: J({
    sourceType: 'position_stand', year: 2017,
    authors: 'Jäger R, Kerksick CM, Campbell BI, Cribb PJ, Wells SD, Skwiat TM, et al.',
    title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
    citation: 'Jäger R, Kerksick CM, Campbell BI, Cribb PJ, Wells SD, Skwiat TM, et al. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
    doi: '10.1186/s12970-017-0177-8',
    url: 'https://doi.org/10.1186/s12970-017-0177-8',
    publisher: 'Journal of the International Society of Sports Nutrition',
    pages: '20'
  }),
  issn_timing2017: J({
    sourceType: 'position_stand', year: 2017,
    authors: 'Kerksick CM, Arent S, Schoenfeld BJ, et al.',
    title: 'International Society of Sports Nutrition position stand: nutrient timing',
    citation: 'Kerksick CM, Arent S, Schoenfeld BJ, et al. International Society of Sports Nutrition position stand: nutrient timing. J Int Soc Sports Nutr. 2017;14:33.',
    doi: '10.1186/s12970-017-0189-z',
    url: 'https://doi.org/10.1186/s12970-017-0189-z',
    publisher: 'Journal of the International Society of Sports Nutrition',
    pages: '33'
  }),
  issn_creatine2017: J({
    sourceType: 'position_stand', year: 2017,
    authors: 'Kreider RB, Kalman DS, Antonio J, et al.',
    title: 'International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine',
    citation: 'Kreider RB, Kalman DS, Antonio J, et al. International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine. J Int Soc Sports Nutr. 2017;14:18.',
    doi: '10.1186/s12970-017-0173-z',
    url: 'https://doi.org/10.1186/s12970-017-0173-z',
    publisher: 'Journal of the International Society of Sports Nutrition',
    pages: '18'
  }),
  issn_caffeine2021: J({
    sourceType: 'position_stand', year: 2021,
    authors: 'Guest NS, VanDusseldorp TA, Nelson MT, et al.',
    title: 'International Society of Sports Nutrition position stand: caffeine and exercise performance',
    citation: 'Guest NS, VanDusseldorp TA, Nelson MT, et al. International Society of Sports Nutrition position stand: caffeine and exercise performance. J Int Soc Sports Nutr. 2021;18(1):1.',
    doi: '10.1186/s12970-020-00383-4',
    url: 'https://doi.org/10.1186/s12970-020-00383-4',
    publisher: 'Journal of the International Society of Sports Nutrition',
    pages: '1'
  }),
  issn_diets2017: J({
    sourceType: 'position_stand', year: 2017,
    authors: 'Aragon AA, Schoenfeld BJ, Wildman R, et al.',
    title: 'International Society of Sports Nutrition position stand: diets and body composition',
    citation: 'Aragon AA, Schoenfeld BJ, Wildman R, et al. International Society of Sports Nutrition position stand: diets and body composition. J Int Soc Sports Nutr. 2017;14:16.',
    doi: '10.1186/s12970-017-0174-y',
    url: 'https://doi.org/10.1186/s12970-017-0174-y',
    publisher: 'Journal of the International Society of Sports Nutrition',
    pages: '16'
  }),
  refalo2025: J({
    sourceType: 'systematic_review', year: 2025,
    authors: 'Refalo MC, Trexler ET, Helms ER, et al.',
    title: 'Effect of dietary protein on fat-free mass in energy restricted, resistance-trained individuals: an updated systematic review with meta-regression',
    citation: 'Refalo MC, Trexler ET, Helms ER, et al. Effect of dietary protein on fat-free mass in energy restricted, resistance-trained individuals: an updated systematic review with meta-regression. Strength Cond J. 2025 (published online 22 Jan 2025).',
    doi: '10.1519/SSC.0000000000000888',
    url: 'https://doi.org/10.1519/SSC.0000000000000888',
    publisher: 'Strength and Conditioning Journal',
    pages: '待核实',
    verificationStatus: 'pages_pending'
  }),
  reds2023: J({
    sourceType: 'consensus', year: 2023,
    authors: 'Mountjoy M, Ackerman KE, Bailey DM, Burke LM, Constantini N, Hackney AC, et al.',
    title: '2023 International Olympic Committee’s (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs)',
    citation: 'Mountjoy M, Ackerman KE, Bailey DM, Burke LM, Constantini N, Hackney AC, et al. 2023 International Olympic Committee’s (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs). Br J Sports Med. 2023;57(17):1073-1097.',
    doi: '10.1136/bjsports-2023-106860',
    url: 'https://bjsm.bmj.com/content/57/17/1073',
    publisher: 'British Journal of Sports Medicine',
    pages: '1073-1097'
  }),
  ioc2018: J({
    sourceType: 'consensus', year: 2018,
    authors: 'Maughan RJ, Burke LM, Dvorak J, Larson-Meyer DE, Peeling P, Phillips SM, et al.',
    title: 'IOC consensus statement: dietary supplements and the high-performance athlete',
    citation: 'Maughan RJ, Burke LM, Dvorak J, Larson-Meyer DE, Peeling P, Phillips SM, et al. IOC consensus statement: dietary supplements and the high-performance athlete. Br J Sports Med. 2018;52(7):439-455.',
    doi: '10.1136/bjsports-2018-099027',
    url: 'https://bjsm.bmj.com/content/52/7/439',
    publisher: 'British Journal of Sports Medicine',
    pages: '439-455'
  }),
  walsh2021: J({
    sourceType: 'consensus', year: 2021,
    authors: 'Walsh NP, Halson SL, Sargent C, Roach GD, Nédélec M, Gupta L, et al.',
    title: 'Sleep and the athlete: narrative review and 2021 expert consensus recommendations',
    citation: 'Walsh NP, Halson SL, Sargent C, Roach GD, Nédélec M, Gupta L, et al. Sleep and the athlete: narrative review and 2021 expert consensus recommendations. Br J Sports Med. 2021;55(7):356-368.',
    doi: '10.1136/bjsports-2020-102025',
    url: 'https://bjsm.bmj.com/content/55/7/356',
    publisher: 'British Journal of Sports Medicine',
    pages: '356-368'
  }),
  meeusen2013: J({
    sourceType: 'consensus', year: 2013,
    authors: 'Meeusen R, Duclos M, Foster C, Fry A, Gleeson M, Nieman D, et al.',
    title: 'Prevention, diagnosis and treatment of the overtraining syndrome',
    citation: 'Meeusen R, Duclos M, Foster C, Fry A, Gleeson M, Nieman D, et al. Prevention, diagnosis and treatment of the overtraining syndrome: joint consensus statement of the European College of Sport Science and the American College of Sports Medicine. Med Sci Sports Exerc. 2013;45(1):186-205.',
    doi: '10.1249/MSS.0b013e318279a10a',
    url: 'https://doi.org/10.1249/MSS.0b013e318279a10a',
    publisher: 'Medicine & Science in Sports & Exercise',
    pages: '186-205'
  }),
  buchheit2014: J({
    sourceType: 'narrative_review', sourceTier: 'secondary', year: 2014,
    authors: 'Buchheit M',
    title: 'Monitoring training status with HR measures: do all roads lead to Rome?',
    citation: 'Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol. 2014;5:73.',
    doi: '10.3389/fphys.2014.00073',
    url: 'https://doi.org/10.3389/fphys.2014.00073',
    publisher: 'Frontiers in Physiology',
    pages: '73'
  }),
  gemming2015: J({
    sourceType: 'systematic_review', year: 2015,
    authors: 'Gemming L, Utter J, Ni Mhurchu C',
    title: 'Image-assisted dietary assessment: a systematic review of the evidence',
    citation: 'Gemming L, Utter J, Ni Mhurchu C. Image-assisted dietary assessment: a systematic review of the evidence. J Acad Nutr Diet. 2015;115(1):64-77.',
    doi: '10.1016/j.jand.2014.09.015',
    url: 'https://doi.org/10.1016/j.jand.2014.09.015',
    publisher: 'Journal of the Academy of Nutrition and Dietetics',
    pages: '64-77'
  }),
  mifflin1990: J({
    sourceType: 'reference_data', year: 1990,
    authors: 'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO',
    title: 'A new predictive equation for resting energy expenditure in healthy individuals',
    citation: 'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.',
    doi: '10.1093/ajcn/51.2.241',
    url: 'https://doi.org/10.1093/ajcn/51.2.241',
    publisher: 'American Journal of Clinical Nutrition',
    pages: '241-247'
  }),
  foster2001: J({
    sourceType: 'reference_data', year: 2001,
    authors: 'Foster C, Florhaug JA, Franklin J, et al.',
    title: 'A new approach to monitoring exercise training',
    citation: 'Foster C, Florhaug JA, Franklin J, Gottschall L, Hrovatin LA, Parker S, et al. A new approach to monitoring exercise training. J Strength Cond Res. 2001;15(1):109-115.',
    publisher: 'Journal of Strength and Conditioning Research',
    pages: '109-115',
    note: 'sRPE 方法学原始文献，无 DOI，可按期刊卷期检索。'
  }),
  wada: J({
    sourceType: 'regulation', year: 2026,
    authors: 'World Anti-Doping Agency (WADA)',
    title: 'WADA Prohibited List',
    citation: 'World Anti-Doping Agency. WADA Prohibited List. 2026 edition.',
    url: 'https://www.wada-ama.org/en/prohibited-list',
    publisher: 'World Anti-Doping Agency',
    pages: '不适用',
    verificationStatus: 'version_pending',
    note: '禁用清单每年 1 月更新，引用与采购前必须核对当年版本。'
  }),
  gibson2: B({
    authors: 'Gibson RS',
    title: 'Principles of Nutritional Assessment',
    edition: '2nd',
    publisher: 'Oxford University Press',
    isbn: '待核实',
    year: 2005,
    verificationStatus: 'isbn_pending'
  }),
  cscn6: B({
    editors: 'Burke L, Deakin V, Minehan M',
    title: "Brukner & Khan's Clinical Sports Nutrition",
    edition: '6th',
    publisher: 'McGraw-Hill Education (Australia)',
    year: 2021,
    isbn: '待核实',
    verificationStatus: 'isbn_pending'
  }),
  sport_nutrition4: B({
    authors: 'Jeukendrup A, Gleeson M',
    title: 'Sport Nutrition',
    edition: '4th',
    publisher: 'Human Kinetics',
    year: 2024,
    isbn: '待核实',
    verificationStatus: 'isbn_pending'
  }),
  acsm_bc: B({
    authors: 'American College of Sports Medicine',
    editors: '待核实',
    title: "ACSM's Body Composition Assessment",
    edition: '待核实',
    publisher: 'Human Kinetics',
    year: '待核实',
    isbn: '待核实',
    verificationStatus: 'version_pending',
    note: '版次与出版年待核实；章节按清单定位，章节标题与页码待核实。'
  }),
  acsm_getp11: B({
    authors: 'American College of Sports Medicine',
    editors: '待核实',
    title: "ACSM's Guidelines for Exercise Testing and Prescription",
    edition: '11th',
    publisher: 'Wolters Kluwer',
    year: 2018,
    isbn: '待核实',
    verificationStatus: 'isbn_pending'
  }),
  female_athlete2022: B({
    editors: '待核实',
    title: 'The Female Athlete',
    edition: '待核实',
    publisher: 'Elsevier',
    year: 2022,
    isbn: '待核实',
    verificationStatus: 'version_pending'
  }),
  young_female_athlete2016: B({
    editors: '待核实',
    title: 'The Young Female Athlete',
    edition: '待核实',
    publisher: 'Springer',
    year: 2016,
    isbn: '待核实',
    verificationStatus: 'version_pending'
  }),
  cn_dietary2022: B({
    sourceType: 'guideline', sourceTier: 'primary',
    authors: '中国营养学会',
    title: '中国居民膳食指南（2022）',
    edition: '2022版',
    publisher: '人民卫生出版社',
    year: 2022,
    isbn: '待核实',
    language: 'zh',
    verificationStatus: 'isbn_pending'
  }),
  cn_food_comp6_1: B({
    sourceType: 'reference_data', sourceTier: 'primary',
    authors: '杨月欣（主编）',
    title: '中国食物成分表（标准版）第6版 第一册',
    edition: '第6版',
    publisher: '北京大学医学出版社',
    year: 2018,
    isbn: '待核实',
    language: 'zh',
    verificationStatus: 'isbn_pending'
  }),
  cn_food_comp6_2: B({
    sourceType: 'reference_data', sourceTier: 'primary',
    authors: '杨月欣（主编）',
    title: '中国食物成分表（标准版）第6版 第二册',
    edition: '第6版',
    publisher: '北京大学医学出版社',
    year: 2019,
    isbn: '待核实',
    language: 'zh',
    verificationStatus: 'isbn_pending'
  }),
  cn_dris2023: B({
    sourceType: 'reference_data', sourceTier: 'primary',
    authors: '中国营养学会',
    title: '中国居民膳食营养素参考摄入量（2023版）',
    edition: '2023版',
    publisher: '人民卫生出版社',
    year: 2023,
    isbn: '待核实',
    language: 'zh',
    verificationStatus: 'isbn_pending'
  }),
  cn_sports_nutrition2019: B({
    authors: '待核实',
    title: '运动营养学',
    edition: '待核实',
    publisher: '待核实',
    year: 2019,
    isbn: '待核实',
    language: 'zh',
    verificationStatus: 'version_pending',
    note: '作者、版次与出版社待核实；章节按清单定位。'
  })
};

function src(key, overrides) {
  var base = SRC[key];
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  if (overrides) Object.keys(overrides).forEach(function (k) { out[k] = overrides[k]; });
  return out;
}

// 教材章节：已知章节号但标题/页码未核实时用 pages_pending；章节号也未核实时用 chapter_pending。
function chap(key, no, extra) {
  var o = {
    chapterNo: no,
    chapterTitle: '待核实',
    pages: '待核实',
    verificationStatus: no === '待核实' ? 'chapter_pending' : 'pages_pending'
  };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return src(key, o);
}

const ITEMS = [
  // ---------- 赛前减重 ----------
  {
    id: 'wc-rate', cat: 'weightcut', title: '安全减重速率：每周 0.5–1% 体重',
    body: '备赛期减重应控制在每周 0.5–1% 体重（58kg 拳手约 0.3–0.6kg/周）。超过这个速度，减掉的相当比例是肌肉和水分，出拳力量与耐力会同步下降。距称重不足 2 周时不要再启动新的减重计划，只做水盐与胃肠内容物的微调。',
    sources: [src('acsm2021'), src('acsm2016')],
    tags: ['weightRate', 'cut']
  },
  {
    id: 'wc-phases', cat: 'weightcut', title: '备赛四个阶段，策略完全不同',
    body: '维持期（非赛季）：体重稳定在参赛级别 +3–5%，正常吃。减脂期（赛前 8–12 周）：每周 0.5–1%，蛋白提到 2.0–2.4 g/kg 保肌。微调期（赛前 1–2 周）：只动水、钠、纤维和胃肠内容物，不再动热量缺口。恢复期（称重后 12–24h）：补液补糖，把体重拉回 3–5%。把阶段写进 App，规则才知道该给你哪套建议。',
    sources: [src('acsm2021'), src('acsm2016')],
    tags: ['phase']
  },
  {
    id: 'wc-dehydration-risk', cat: 'weightcut', title: '赛前脱水减重（sauna/限制饮水）的代价',
    body: '通过出汗或限水在 24h 内掉 2–4% 体重，会带来血浆容量下降、心率升高、出拳速度下降和抗打击能力下降。研究一致显示：脱水 2% 以上就开始损失无氧表现。如果必须用，限在 2–3% 以内，并保证称重后有 12h 以上恢复窗口，同时有人在旁边盯着。',
    sources: [src('acsm2007'), src('reds2023')],
    tags: ['dehydration', 'cut']
  },
  {
    id: 'wc-refeed', cat: 'weightcut', title: '减脂期不要一路减到底：安排 refeed',
    body: '连续 8 周以上热量缺口会让瘦素、甲状腺激素和训练表现一起下滑。每 2–3 周安排 1–2 天回到维持热量（碳水为主），体重会短期回升 0.5–1kg，那是糖原和水，不是脂肪。日记里看到体重反弹先别慌，看 7 日移动平均。',
    sources: [src('issn_diets2017')],
    tags: ['refeed', 'weightRate']
  },
  {
    id: 'wc-weighin-recovery', cat: 'weightcut', title: '称重后 12–24 小时怎么把身体拉回来',
    body: '称重后按每流失 1kg 体重补 1.25–1.5L 含钠液体，分次喝，别一次灌。碳水按 1.0–1.2 g/kg/h 补前 4 小时（58kg 约 58–70g/h），优先低纤维、易消化的米面、香蕉、运动饮料。蛋白同步补 20–40g。目标是称重后 12h 内恢复体重 3–5%，胃不胀。',
    sources: [src('acsm2016'), src('issn2025')],
    tags: ['weighin', 'recovery']
  },

  // ---------- 蛋白质 ----------
  {
    id: 'pro-total', cat: 'protein', title: '总量：1.6–2.2 g/kg/天',
    body: '力量与格斗类项目建议每天 1.6–2.2 g/kg（58kg 约 93–128g）。减脂期热量不足时提到 2.3–3.1 g/kg 去脂体重，用来对抗肌肉流失。超过 2.2 g/kg 对增肌没有额外好处，但在减脂期有意义。',
    sources: [src('issn2017'), src('refalo2025')],
    tags: ['protein']
  },
  {
    id: 'pro-spread', cat: 'protein', title: '分配：每餐 0.3–0.4 g/kg，3–5 餐',
    body: '把总量摊到 3–5 餐，每餐 0.3–0.4 g/kg（58kg 约 17–23g，实战建议 25–35g）。一次吃 60g 蛋白并不会浪费，但分次对合成刺激更均匀。睡前一餐 30–40g 缓释蛋白（牛奶、酸奶、酪蛋白）对夜间修复有用。',
    sources: [src('issn_timing2017')],
    tags: ['protein', 'timing']
  },
  {
    id: 'pro-quality', cat: 'protein', title: '来源：优先乳清、蛋、鱼虾、瘦肉',
    body: '动物蛋白氨基酸评分高，含足量亮氨酸（每餐 2.5–3g 亮氨酸是合成阈值，约等于 25g 乳清或 100g 鸡胸）。植物蛋白可以吃，但总量要再加 10–20%，或做谷物+豆类搭配。减重期红肉选瘦的，脂肪留给必须脂肪酸。',
    sources: [src('issn2017')],
    tags: ['protein', 'food']
  },
  {
    id: 'pro-timing', cat: 'protein', title: '训练后 2 小时内补 25–40g 蛋白',
    body: '所谓"30 分钟窗口"被夸大了，真正重要的是全天总量。但训练后 2h 内吃 25–40g 蛋白 + 碳水，对一天只吃 3 餐的人确实有用。实战课/对练后优先液体（牛奶、蛋白粉+香蕉），因为这时候嚼不动。',
    sources: [src('issn_timing2017')],
    tags: ['protein', 'timing']
  },

  // ---------- 碳水与能量 ----------
  {
    id: 'carb-training', cat: 'carb', title: '训练日碳水：3–7 g/kg，看负荷',
    body: '格斗项目训练日建议 4–7 g/kg（58kg 约 230–400g），技术课日取下限，一天两练或实战日取上限。碳水低于 3 g/kg 连续多日，会出现"低能量可用性"，表现为反应变慢、情绪低落、易受伤。',
    sources: [src('acsm2016'), src('reds2023')],
    tags: ['carb']
  },
  {
    id: 'carb-timing', cat: 'carb', title: '训练前 1–3h 吃 1–2 g/kg 碳水',
    body: '训练前 1–3 小时吃 1–2 g/kg 易消化碳水（58kg 约 60–115g），比如米饭+鸡蛋、面包+香蕉。训练前 30 分钟内避免大量纤维和脂肪。空腹晨练对减脂没有额外好处，反而让技术课质量下降。',
    sources: [src('acsm2016')],
    tags: ['carb', 'timing']
  },
  {
    id: 'carb-recovery', cat: 'carb', title: '两练之间：1.0–1.2 g/kg/h 补糖',
    body: '如果一天两练或训练超过 90 分钟，训练后 4 小时内按 1.0–1.2 g/kg/h 补碳水（58kg 约 60–70g/h），能明显加快糖原恢复。加 20–30g 蛋白一起补效果更好。只练一次、间隔 24h 的话，吃够全天总量就够。',
    sources: [src('issn_timing2017')],
    tags: ['carb', 'recovery']
  },
  {
    id: 'carb-energy-availability', cat: 'carb', title: '能量可用性低于 30 kcal/kg 去脂体重/天 = 红灯',
    body: '长期低能量可用性（LEA）会损伤激素轴、骨密度、免疫和恢复能力，女性常见月经紊乱，男性常见睾酮下降和性欲减退。粗算：58kg、体脂 12% 的拳手去脂体重约 51kg，安全下限约 1530 kcal 的可利用能量（总摄入减运动消耗）。减重期不要把摄入压到这个线以下太久。',
    sources: [src('reds2023')],
    tags: ['energy', 'red']
  },
  {
    id: 'carb-fightweek', cat: 'fightday', title: '赛前 24–48h：碳水提到 8–10 g/kg',
    body: '格斗项目不需要传统 3 天碳水负荷，但称重后到比赛前的 24h 内把碳水提到 8–10 g/kg（58kg 约 460–580g）能补满糖原。选低纤维、低脂、体积小的碳水，避免赛前腹胀。',
    sources: [src('acsm2016')],
    tags: ['fightday', 'carb']
  },
  {
    id: 'fightday-meal', cat: 'fightday', title: '赛前 3–4h 正餐，赛前 60–90min 加餐',
    body: '赛前 3–4 小时吃熟悉的正餐：碳水 1–2 g/kg + 蛋白 25–40g + 低脂低纤维。赛前 60–90 分钟补 30–60g 易消化碳水（香蕉、能量胶、米饼）。比赛当天不要试新食物、新补剂。',
    sources: [src('acsm2016')],
    tags: ['fightday', 'timing']
  },

  // ---------- 水合 ----------
  {
    id: 'hyd-2pct', cat: 'hydration', title: '脱水 2% 就开始掉表现',
    body: '体重下降 2% 以上（58kg 约 1.16kg）时，血容量下降、心率上升、主观用力感升高，出拳速度和反应明显变差。3% 以上属于危险区。用训练前后体重差判断脱水是最可靠、最便宜的方法。',
    sources: [src('acsm2007')],
    tags: ['hydration', 'dehydration']
  },
  {
    id: 'hyd-replace', cat: 'hydration', title: '每掉 1kg 体重，补 1.25–1.5L 液体',
    body: '补液量要大于流失量，因为尿液和汗液会继续丢。按 1kg 缺口补 1.25–1.5L，分 2–4 次喝完，别一次灌 2L（会引发胃肠不适和低钠风险）。训练超过 60–90 分钟或大量出汗时，选含钠 300–700 mg/L 的饮料。',
    sources: [src('acsm2007')],
    tags: ['hydration']
  },
  {
    id: 'hyd-urine', cat: 'hydration', title: '尿色是最快的自查指标',
    body: '晨尿淡黄（1–3 级）为水合良好，4 级以上偏深提示需要补水，茶色或可乐色要警惕横纹肌溶解和严重脱水，属于就医信号。这也是赛前控水期最应该盯的指标。',
    sources: [src('acsm2007')],
    tags: ['hydration']
  },
  {
    id: 'hyd-sodium', cat: 'hydration', title: '大汗体质需要钠，不只是水',
    body: '衣服上有白色汗渍、汗味重、训练后头痛，通常提示汗钠偏高。这类人只喝白水容易低钠，表现为恶心、头胀、越喝越难受。方案：训练饮料里加盐（每 500ml 加 0.5–1g 盐）或喝含电解质饮料，同时不要过量饮水。',
    sources: [src('acsm2007')],
    tags: ['hydration', 'sodium']
  },

  // ---------- 恢复 ----------
  {
    id: 'rec-sleep', cat: 'recovery', title: '睡眠 7–9 小时，是恢复的第一优先级',
    body: '睡眠不足 6 小时与力量下降、反应变慢、受伤风险上升、食欲激素紊乱（饥饿素升高、瘦素下降）都相关。备赛期睡眠比任何补剂都重要。判断标准：不靠闹钟能醒、白天不犯困。如果长期睡不够，先砍训练量，不要加补剂。',
    sources: [src('walsh2021')],
    tags: ['sleep']
  },
  {
    id: 'rec-soreness', cat: 'recovery', title: '酸痛 7 分以上，别做速度与爆发课',
    body: '速度、爆发、最大力量课依赖中枢神经系统的"新鲜度"。酸痛 7/10 以上、或晨起静息心率比平时高 5–8 次/分时，做速度课收益极低且受伤风险高。改成技术、战术、柔韧或低强度有氧，把速度课挪到恢复之后。',
    sources: [src('acsm2016'), src('meeusen2013')],
    tags: ['soreness', 'recovery', 'plan']
  },
  {
    id: 'rec-sleep-hygiene', cat: 'recovery', title: '赛前 2 周固定作息，别靠补觉',
    body: '赛前 2 周开始固定入睡与起床时间（误差 <30 分钟），睡前一小时不开强光屏幕，卧室降到 18–20℃。比赛前夜失眠很常见，一晚睡 4–5 小时对表现的影响有限，不要因此焦虑或临时吃安眠药。',
    sources: [src('walsh2021')],
    tags: ['sleep', 'fightday']
  },
  {
    id: 'rec-load', cat: 'recovery', title: '用 sRPE 记录负荷：时长 × 主观强度',
    body: '训练负荷主观评分（sRPE）＝ 训练时长（分钟）× 主观强度（RPE，1–10），把强度折进负荷里，比只记"练了几小时"有用得多。每周把总负荷和上周比，出现连续陡增就先减量。如果连续几周总负荷都在上升而没有减载，就该安排一个减量周，幅度按比赛日程由教练定。',
    sources: [src('foster2001')],
    tags: ['load', 'rpe']
  },

  // ---------- 补剂 ----------
  {
    id: 'sup-creatine', cat: 'supplement', title: '肌酸：3–5 g/天，唯一值得长期吃的',
    body: '一水肌酸每天 3–5g，不需要冲击期，对力量和无氧能力有稳定的小幅提升。备赛减重期尤其有用（保肌）。安全性证据充分，肾功能正常者无顾虑。注意会带来 0.5–1kg 的水重，减重期看到体重上升别误判。',
    sources: [src('issn_creatine2017')],
    tags: ['supplement']
  },
  {
    id: 'sup-caffeine', cat: 'supplement', title: '咖啡因：赛前 60min，3–6 mg/kg',
    body: '比赛前 60 分钟摄入 3–6 mg/kg（58kg 约 175–350mg，约 2–3 杯咖啡），对反应速度、耐力和主观用力感有帮助。备赛期先试过，确认不影响睡眠和胃肠。赛前 8 小时内不要再补，避免影响入睡。',
    sources: [src('issn_caffeine2021')],
    tags: ['supplement', 'fightday']
  },
  {
    id: 'sup-warning', cat: 'supplement', title: '减重期慎用"燃脂"类产品',
    body: '大多数减脂补剂（左旋肉碱、共轭亚油酸（CLA）、藤黄果等）证据薄弱，部分含未标注的兴奋剂成分，而拳击项目有反兴奋剂检测。任何补剂先查世界反兴奋剂机构（WADA）禁用清单与产品第三方检测（Informed Sport / NSF）。减重靠热量缺口，不靠产品。',
    sources: [src('ioc2018'), src('wada')],
    tags: ['supplement', 'risk']
  },

  // ---------- 基础 ----------
  {
    id: 'basic-plate', cat: 'basic', title: '一拳餐盘：1/2 蔬菜 + 1/4 蛋白 + 1/4 主食',
    body: '没有称重条件时用体积法：半个餐盘蔬菜，四分之一掌心大小的蛋白（鱼虾蛋瘦肉），四分之一拳头主食。减脂期把主食减到 1/4 以下但不要归零，训练日必须保证主食。',
    sources: [chap('cn_dietary2022', '待核实', { note: '餐盘图示' }), src('acsm2016')],
    tags: ['basic', 'food']
  },
  {
    id: 'basic-breakfast', cat: 'basic', title: '早餐别只有碳水',
    body: '只吃粥+包子的早餐蛋白不足 10g，撑不到中午。加 2 个鸡蛋或一杯牛奶/豆浆，蛋白直接到 25–30g。晨练前吃不下的话，把蛋白放到训练后第一餐。',
    sources: [src('issn2017')],
    tags: ['basic', 'protein']
  },
  {
    id: 'basic-fiber', cat: 'basic', title: '赛前 24h 减纤维，平时别减',
    body: '平时每天 25–30g 纤维对肠道和血脂有好处。但称重前 24–48 小时要把粗粮、豆类、大量蔬菜换成白米、白面、去皮水果，减少肠道内容物重量。',
    sources: [src('acsm2016'), chap('cn_dietary2022', '待核实', { note: '膳食纤维推荐量' })],
    tags: ['fightday', 'fiber']
  },
  {
    id: 'basic-alcohol', cat: 'basic', title: '备赛期酒精基本等于负收益',
    body: '酒精抑制蛋白合成、扰乱睡眠结构、增加脱水、提供 7 kcal/g 的空热量。减脂期每周超过 4 标准杯就会明显拖慢进度。',
    sources: [src('issn_diets2017')],
    tags: ['basic', 'risk']
  },
  {
    id: 'basic-logging', cat: 'basic', title: '只记一餐＝没有数据',
    body: '少于 2 餐的记录无法判断全天能量与蛋白，系统会给"数据不足"而不是"达标"。记录的价值在连续性：每天 3 餐、连续 7 天，才能看出问题在哪一餐。',
    sources: [chap('gibson2', '待核实', { note: '膳食记录方法' }), src('gemming2015')],
    tags: ['log']
  },
  {
    id: 'basic-photo', cat: 'basic', title: '拍照记餐的准确率取决于参照物',
    body: '照片估算的误差明显大于称重，放一个硬币、筷子或手掌做参照能提高准确度。有称重条件的优先称，照片只用于没秤的场合。记录时把参照物拍进画面，并补一句烹饪方式。',
    sources: [src('gemming2015')],
    tags: ['log', 'photo']
  },
  {
    id: 'rec-hrv', cat: 'recovery', title: '晨脉比情绪更诚实',
    body: '每天醒来躺着测 1 分钟脉搏，连续记录。晨脉比个人基线高 5–8 次/分，且持续 2 天以上，通常意味着恢复不足、感染前兆或脱水。这时候减量比硬练划算。',
    sources: [src('buchheit2014'), src('meeusen2013')],
    tags: ['recovery', 'hr']
  },

  // ---------- 体成分与能量消耗（BC-01 ~ BC-12） ----------
  {
    id: 'BC-01', cat: 'bodycomp', title: '体成分测量方法怎么选：DXA、BIA、皮褶',
    body: '拳手要跟踪的是去脂体重（FFM）和体脂率两个数，不能只看体重。有条件优先用双能 X 线吸收法（DXA）做基准，它同时给出骨密度和去脂体重；没有 DXA 时用皮褶厚度或生物电阻抗（BIA），但必须固定同一台设备、同一时间、同一身体状态。比赛前 48 小时不要做体成分测试，脱水会让体脂率虚高、去脂体重虚低。',
    sources: [chap('acsm_bc', '6'), src('acsm2021')],
    tags: ['bodycomp', 'measure']
  },
  {
    id: 'BC-02', cat: 'bodycomp', title: '皮褶厚度：同一侧、同一标记点、固定测量者',
    body: '用皮褶钳固定测 3 个或 7 个部位，位置按解剖标志标记，每次由同一个人测。训练后不要立刻测，皮肤温度和体液变化会影响读数；测前擦干皮肤，不要捏起肌肉。把每次的原始毫米数记下来，用总和趋势判断，不要只看换算出的体脂率百分比。',
    sources: [chap('acsm_bc', '6'), chap('cscn6', '7')],
    tags: ['bodycomp', 'skinfold']
  },
  {
    id: 'BC-03', cat: 'bodycomp', title: '生物电阻抗（BIA）：测前别大强度训练',
    body: '生物电阻抗（BIA）用微弱电流估算体脂，结果高度依赖身体水分。测前避免大强度训练、桑拿和大量进食饮水，排空膀胱，固定同一时间段测。减重期每周固定同一天晨起测一次，看趋势，不要被单日波动带跑。',
    sources: [chap('acsm_bc', '4'), chap('sport_nutrition4', '14')],
    tags: ['bodycomp', 'bia']
  },
  {
    id: 'BC-04', cat: 'bodycomp', title: '脱水会让体成分读数失真：赛前怎么测',
    body: '脱水 2% 以上会让 BIA 的体脂率读数升高，皮褶读数也会因皮肤含水量变化而偏差。赛前一周如果必须测，固定在早晨、空腹、排空膀胱、训练前，和上一次同条件比较。称重后 24 小时内不要用任何体成分数据做决策，那时数据只反映补液进度。',
    sources: [chap('acsm_bc', '5'), chap('sport_nutrition4', '14')],
    tags: ['bodycomp', 'hydration']
  },
  {
    id: 'BC-05', cat: 'bodycomp', title: '没有设备时：围度与标准体位照片',
    body: '没有 DXA 或 BIA 时，用腰围、上臂围、大腿围加固定体位的照片做趋势记录。围度用同一把软尺、同一解剖位置、同一个人测，吸腹状态要一致。照片固定光线、距离、姿势和拍摄时间，每隔固定周期对比一次，不要每天拍。',
    sources: [chap('acsm_bc', '2'), chap('acsm_bc', '3')],
    tags: ['bodycomp', 'field']
  },
  {
    id: 'BC-06', cat: 'bodycomp', title: '减重期要守住的是去脂体重（FFM）',
    body: '减重期每周掉 0.5–1% 体重时，目标是把脂肪掉下去、把去脂体重（FFM）保住。用 FFM 变化而不是总体重判断减重质量：FFM 掉得比体重快，说明缺口太大或蛋白不足。蛋白按去脂体重算比按总体重算更能保护 FFM，尤其体脂偏高或偏低的拳手。',
    sources: [chap('acsm_bc', '7'), chap('cscn6', '7')],
    tags: ['bodycomp', 'ffm']
  },
  {
    id: 'BC-07', cat: 'bodycomp', title: '女性拳手：体脂不是越低越好',
    body: '女性拳手的体脂率降到很低时，可能出现月经紊乱、骨应力性损伤和恢复变慢，这是低能量可用性（LEA）的典型信号。不要拿男性拳手的体脂目标套在女性身上；月经周期变长、停经或反复应力性骨伤出现时，先增加能量摄入并转诊，而不是继续减脂。体成分测试要结合月经史和能量摄入一起看。',
    sources: [src('reds2023'), chap('female_athlete2022', '待核实', { note: '女性运动员体成分章节待核实' })],
    tags: ['bodycomp', 'female']
  },
  {
    id: 'BC-08', cat: 'bodycomp', title: '静息代谢率（RMR）估算：先用公式，再用记录校正',
    body: '没有代谢车时，用 Mifflin–St Jeor 公式估算静息代谢率（RMR）：男性 10×体重(kg)+6.25×身高(cm)−5×年龄+5；女性同式最后减 161。算出来只是起点，用连续 2 周的体重趋势和实际摄入校正：体重稳定就说明估算接近真实消耗。别把公式值当成精确值，个体差异可达数百千卡。',
    sources: [chap('sport_nutrition4', '4'), chap('cn_sports_nutrition2019', '3', { note: '第一节' })],
    tags: ['bodycomp', 'rmr']
  },
  {
    id: 'BC-09', cat: 'bodycomp', title: '训练日总能量消耗（TDEE）怎么估',
    body: '总能量消耗（TDEE）≈ 静息代谢率（RMR）× 活动系数 + 训练消耗，活动系数按训练日和休息日分开取。不要照搬健身房的通用系数，格斗训练的间歇和对抗消耗差异很大。最可靠的校正方法是反推：连续一周记录平均摄入，同时看 7 日体重移动平均，体重按目标速度变化就说明估算接近真实。',
    sources: [chap('sport_nutrition4', '4'), chap('acsm_getp11', '待核实', { note: '能量消耗章节待核实' })],
    tags: ['bodycomp', 'tdee']
  },
  {
    id: 'BC-10', cat: 'bodycomp', title: '少看单日体重，多看 7 日移动平均',
    body: '静息代谢率（RMR）估算出来只是起点，真正的总消耗要用体重趋势校正。每天固定晨起、排空、空腹称重，用 7 日移动平均看方向；单日 1–2 kg 的波动多半是水分和肠道内容物。只有移动平均连续两周朝错误方向走，才调整热量，不要因为一天涨了 0.5 kg 就砍餐。',
    sources: [src('mifflin1990'), chap('cn_sports_nutrition2019', '3', { note: '第二节' })],
    tags: ['bodycomp', 'weightTrend']
  },
  {
    id: 'BC-11', cat: 'bodycomp', title: '青少年拳手：按生长曲线看，不按成人标准',
    body: '青少年拳手还在长个子，减重前先看身高体重曲线和青春期发育阶段。赛季中不要长期限制能量，否则会拖慢生长、影响骨密度和激素发育。青少年不建议用脱水减重；需要控体重时，以维持体重、让身高追上为主，并让医生或营养师参与。',
    sources: [src('reds2023'), chap('cscn6', '6')],
    tags: ['bodycomp', 'youth']
  },
  {
    id: 'BC-12', cat: 'bodycomp', title: '称重后恢复：先补液补糖，再看体成分',
    body: '称重后 12–24 小时的首要任务是恢复血浆容量和糖原，不是测体脂。按每丢失 1 kg 体重补 1.25–1.5 L 含钠液体，碳水按 1.0–1.2 g/kg/h 分次补，蛋白 20–40 g。等补液和进食稳定后，通常第二天早晨同条件再测体重和体成分，否则读数没有意义。',
    sources: [src('acsm2007'), src('issn2025'), chap('cscn6', '8')],
    tags: ['bodycomp', 'weighin']
  },

  // ---------- 营养评估（AS-01 ~ AS-12） ----------
  {
    id: 'AS-01', cat: 'assessment', title: '膳食评估先选方法：称重记录、24 小时回顾、频率问卷',
    body: '要精确就算称重食物记录，连续 3–7 天，包含至少一个训练日和一天休息日。没条件称重就用 24 小时回顾，由受过训练的人问，重点问烹饪方式和油盐。食物频率问卷（FFQ）适合看长期习惯，不适合算某一天的热量。方法选错，后面的能量和蛋白计算都不可信。',
    sources: [chap('gibson2', '待核实', { note: '膳食评估方法总论' }), chap('cscn6', '2')],
    tags: ['assessment', 'dietRecord']
  },
  {
    id: 'AS-02', cat: 'assessment', title: '能量摄入评估：别只问"吃了几碗饭"',
    body: '评估能量摄入要把主食、油、饮料、零食和补剂都算进去，油和含糖饮料常是被漏掉的大头。用食物成分表或包装营养标签换算，按克数而不是"碗/份"记录。训练日和非训练日分开算，否则一周平均会被高估或低估。',
    sources: [src('acsm2016'), chap('cn_sports_nutrition2019', '8', { note: '第一节' })],
    tags: ['assessment', 'energy']
  },
  {
    id: 'AS-03', cat: 'assessment', title: '拍照记餐：能提高依从性，但误差仍在',
    body: '照片辅助记录能提高记录依从性和准确性，尤其是外食和食堂场景。拍照时放一个已知大小的参照物（筷子、硬币、手掌），并补一句烹饪方式（清炒、油炸、红烧）。照片估算只用于没有秤的场合，能称重时优先称重。',
    sources: [src('gemming2015'), chap('gibson2', '待核实', { note: '膳食评估方法' })],
    tags: ['assessment', 'photo']
  },
  {
    id: 'AS-04', cat: 'assessment', title: '蛋白质摄入评估：按体重算，按餐次看',
    body: '先把全天蛋白总量算出来，再除以体重，和 1.4–2.0 g/kg/天 的区间比较。然后把蛋白按餐次拆开，看有没有哪一餐低于 20 g。只算总量不看分配，会漏掉早餐几乎没蛋白这种最常见的问题。',
    sources: [chap('cn_sports_nutrition2019', '8', { note: '第一至四节' }), chap('gibson2', '待核实', { note: '蛋白质摄入评估' }), src('issn2017')],
    tags: ['assessment', 'protein']
  },
  {
    id: 'AS-05', cat: 'assessment', title: '判断能量可用性（EA）需要三个数',
    body: '能量可用性（EA）＝（总摄入 − 运动消耗）÷ 去脂体重（FFM），单位 kcal/kg FFM/天。低于 30 提示低能量可用性，30–45 为降低，需要结合月经、骨伤、静息心率和表现一起判断。算 EA 前必须先有可信的 FFM；没有体成分数据时只能做粗略估算并标注数据不足。',
    sources: [src('reds2023'), chap('cscn6', '11'), chap('cn_dris2023', '待核实', { note: '能量参考摄入量章节待核实' })],
    tags: ['assessment', 'ea']
  },
  {
    id: 'AS-06', cat: 'assessment', title: '水合状态评估：体重差 + 尿色 + 口渴',
    body: '训练前后体重差是最实用的出汗量估算，1 kg 约等于 1 L 汗。晨尿颜色和口渴感作为日常自查，但不能单独用来判定脱水；维生素、甜菜和某些药物会改变尿色。三个指标一起看，再结合训练环境温度和时长。',
    sources: [src('acsm2007'), chap('sport_nutrition4', '9')],
    tags: ['assessment', 'hydration']
  },
  {
    id: 'AS-07', cat: 'assessment', title: '女性拳手的营养评估必须问月经史',
    body: '评估女性拳手时，除了能量和蛋白，必须问月经周期是否规律、最近是否停经、有没有反复应力性骨折。这些是低能量可用性（LEA）和相对能量缺乏（REDs）的核心信号，单看体重和体脂看不出来。发现异常时先增加能量摄入并转诊，不要用再瘦一点作为解决方案。',
    sources: [src('reds2023'), chap('cscn6', '6')],
    tags: ['assessment', 'female']
  },
  {
    id: 'AS-08', cat: 'assessment', title: '青少年拳手评估：看生长速度，不只看当前体重',
    body: '青少年评估要记录身高、体重、父母身高和青春期发育阶段，看生长曲线有没有掉队。赛季中如果身高增长停滞或体重长期不涨，先怀疑能量不足。不要用成人体质指数（BMI）标准直接判断青少年胖瘦。',
    sources: [src('reds2023'), chap('young_female_athlete2016', '待核实', { note: '青少年运动员章节待核实' })],
    tags: ['assessment', 'youth']
  },
  {
    id: 'AS-09', cat: 'assessment', title: '铁状态：拳手容易漏掉的评估项',
    body: '女性拳手、素食者和经常大量出汗的人要定期查血红蛋白和铁蛋白。铁蛋白低但血红蛋白正常时，可能已经影响耐力和恢复。不要自行长期补铁，先查血再补，过量补铁有风险。',
    sources: [chap('cscn6', '9'), src('reds2023')],
    tags: ['assessment', 'iron']
  },
  {
    id: 'AS-10', cat: 'assessment', title: '维生素 D 与骨健康：先看日照和饮食',
    body: '室内训练多、防晒严格或深肤色的拳手，维生素 D 不足的风险更高。评估先问日照时间、奶类和鱼类摄入，有条件再查血清 25(OH)D。没有缺乏证据时不要长期大剂量补；剂量和是否补充由医生根据检测结果决定。',
    sources: [chap('gibson2', '待核实', { note: '维生素与矿物质状态评估' }), chap('cscn6', '2')],
    tags: ['assessment', 'vitaminD']
  },
  {
    id: 'AS-11', cat: 'assessment', title: '食堂与外食场景怎么评估',
    body: '外食评估重点问用什么油、有没有勾芡、肉是炸还是炒，这些比克数更影响热量。让拳手拍餐盘并描述菜名，再用食物成分表按常见份量估算。连续记录一周，找出重复出现的高热量菜，再给替换方案。',
    sources: [chap('acsm_bc', '7'), chap('cn_dietary2022', '待核实', { note: '外食与份量参考' })],
    tags: ['assessment', 'outside']
  },
  {
    id: 'AS-12', cat: 'assessment', title: '胃肠道耐受评估：赛前试吃，不临时换',
    body: '赛前餐和补剂的耐受性要在训练日反复测试，记录吃了什么、多久后训练、有没有胀气、反酸或腹泻。比赛日只用已经测试过的组合；新食物、新品牌、新剂量都留到赛后。低纤维、低脂、小体积的碳水通常更好耐受。',
    sources: [chap('cscn6', '21'), src('acsm2016')],
    tags: ['assessment', 'gut']
  },

  // ---------- 食物与膳食指导（FD-01 ~ FD-12） ----------
  {
    id: 'FD-01', cat: 'food', title: '一拳餐盘：按体积分配，不按克数',
    body: '没有秤时用餐盘法：一半蔬菜，四分之一蛋白（鱼虾蛋瘦肉豆制品），四分之一主食。减脂期可以减主食体积，但训练日不要归零；训练前那餐把主食放回四分之一。蛋白那一格要占满，不能只有几片肉。',
    sources: [chap('cn_dietary2022', '待核实', { note: '餐盘图示' }), src('acsm2016')],
    tags: ['food', 'plate']
  },
  {
    id: 'FD-02', cat: 'food', title: '中国居民膳食宝塔：每天该吃几类',
    body: '按膳食宝塔安排每天的食物类别：谷薯类、蔬菜水果、畜禽鱼蛋奶、大豆坚果和油盐。拳手在主食和蛋白上通常需要比宝塔的普通成人推荐更多，但蔬菜和水果不要减。用宝塔检查有没有漏掉一整类，比精确算克数更适合日常。',
    sources: [chap('cn_dietary2022', '待核实', { note: '膳食宝塔' }), chap('cn_sports_nutrition2019', '4', { note: '第二节' })],
    tags: ['food', 'pyramid']
  },
  {
    id: 'FD-03', cat: 'food', title: '食物成分表怎么用：生重还是熟重',
    body: '中国食物成分表的数据多为每 100 g 可食部，米饭、面条等熟食要确认是生重还是熟重。称重记录时统一口径：要么都记生重，要么都用熟重并对应成分表的熟食条目。别把 100 g 生米当成 100 g 米饭，两者热量差一倍以上。',
    sources: [chap('cn_food_comp6_1', '待核实', { note: '使用说明' }), chap('cn_food_comp6_2', '待核实', { note: '使用说明' }), chap('cn_sports_nutrition2019', '4', { note: '第一节' })],
    tags: ['food', 'composition']
  },
  {
    id: 'FD-04', cat: 'food', title: '主食选择：训练日白米白面不是敌人',
    body: '训练日主食优先易消化的米饭、面条、馒头和土豆，帮助补糖原；减脂期可以部分换成粗粮，但训练前那餐不要用大量粗粮。粗粮的纤维和植酸会影响消化速度，赛前 24 小时换回精制主食。别长期把主食压到很低，碳水不足会影响训练质量和恢复。',
    sources: [chap('sport_nutrition4', '6'), chap('cn_food_comp6_1', '待核实', { note: '谷类条目' })],
    tags: ['food', 'staple']
  },
  {
    id: 'FD-05', cat: 'food', title: '蛋白质食物：每餐一个掌心，分散到 3–5 餐',
    body: '每餐放一个掌心大小的优质蛋白：鱼、虾、鸡胸、瘦牛肉、蛋、奶或豆制品。按 1.4–2.0 g/kg/天 的总量分到 3–5 餐，每餐 20–40 g。红肉选瘦的，加工肉（香肠、培根）尽量少；减脂期不要把蛋白做成油炸。',
    sources: [chap('sport_nutrition4', '8'), chap('cn_food_comp6_2', '待核实', { note: '肉蛋奶豆条目' })],
    tags: ['food', 'protein']
  },
  {
    id: 'FD-06', cat: 'food', title: '蔬菜水果：每天够量，赛前减体积不减种类',
    body: '平时保证蔬菜水果的量，提供钾、镁、纤维和抗氧化物质。赛前 24–48 小时减少粗纤维和大量生蔬菜的体积，但不是完全不吃；可以把蔬菜做熟、去皮、切碎。称重前不要靠只吃肉不吃菜来掉秤，那样掉的是水分和肠道内容物，恢复期容易反弹。',
    sources: [chap('cn_dietary2022', '待核实', { note: '准则三' }), chap('cscn6', '10')],
    tags: ['food', 'vegetable']
  },
  {
    id: 'FD-07', cat: 'food', title: '奶类与钙：每天有奶，减重期也别停',
    body: '每天安排奶或奶制品，提供钙和优质蛋白；乳糖不耐受可以选酸奶或低乳糖奶。减重期奶类不要一起砍掉，钙和蛋白对骨健康和保肌都重要。用奶替代含糖饮料，是最容易执行的一步。',
    sources: [chap('cn_dietary2022', '待核实', { note: '准则四' }), chap('cscn6', '11')],
    tags: ['food', 'dairy']
  },
  {
    id: 'FD-08', cat: 'food', title: '训练前、中、后的食物组合',
    body: '训练前 1–3 小时吃易消化碳水加少量蛋白，比如米饭+鸡蛋、面包+牛奶。训练超过 60–90 分钟或大量出汗时，补含钠液体和少量碳水；训练后 2 小时内补 20–40 g 蛋白和碳水。固体食物吃不下时用牛奶、酸奶、香蕉或运动饮料替代。',
    sources: [src('acsm2016'), chap('cn_food_comp6_1', '待核实', { note: '训练前后食物条目' }), chap('cscn6', '21')],
    tags: ['food', 'timing']
  },
  {
    id: 'FD-09', cat: 'food', title: '外食与食堂：先改烹饪方式，再改份量',
    body: '外食优先选蒸、煮、炖、白灼，少选油炸、干锅、红烧和勾芡。同一道菜，油炸比清炒多出一大截热量；先换烹饪方式，再考虑减份量。主食和蛋白按餐盘比例夹，蔬菜用清水过一遍油。',
    sources: [chap('cscn6', '24'), chap('cscn6', '26'), chap('cn_dietary2022', '待核实', { note: '准则七' })],
    tags: ['food', 'outside']
  },
  {
    id: 'FD-10', cat: 'food', title: '含糖饮料与零食：液体热量最容易漏记',
    body: '含糖饮料、果汁和奶茶的热量很容易被漏记，而且饱腹感差。日常用水、无糖茶或淡咖啡替代；训练中需要补糖时再用运动饮料。零食固定时间和份量，不要边看手机边吃。',
    sources: [chap('cn_dietary2022', '待核实', { note: '准则五、准则七' }), chap('cn_food_comp6_1', '待核实', { note: '饮料与零食条目' })],
    tags: ['food', 'drink']
  },
  {
    id: 'FD-11', cat: 'food', title: '出汗多的人：食物里补盐，不只靠盐丸',
    body: '出汗多、汗渍明显的拳手，训练日可以在三餐里正常用盐，并通过含钠饮料或汤补充。不要一次吞大量盐丸，也不要只喝白水；过量饮水会稀释血钠。持续头晕、恶心或抽筋时，先调整补液和含钠食物，再考虑补剂。',
    sources: [src('acsm2007'), chap('cn_sports_nutrition2019', '2', { note: '第六节' })],
    tags: ['food', 'sodium']
  },
  {
    id: 'FD-12', cat: 'food', title: '备赛期食物结构：体积小、能量密度高、低纤维',
    body: '赛前最后几天用体积小、能量密度高的食物：白米、面条、香蕉、蜂蜜、运动饮料、少量坚果酱。减少大份沙拉、豆类、粗粮和碳酸饮料，避免胃肠胀气。称重后恢复期再逐步把蔬菜、粗粮加回来，不要一次吃撑。',
    sources: [chap('sport_nutrition4', '8'), chap('sport_nutrition4', '17'), chap('cn_dietary2022', '待核实', { note: '准则三、准则四' })],
    tags: ['food', 'fightweek']
  }
];

module.exports = { version: 4, categories: CATEGORIES, items: ITEMS };
