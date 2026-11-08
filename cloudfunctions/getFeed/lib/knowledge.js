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
  { id: 'postfight', name: '赛后 0–24 小时', desc: '终场后补液补糖、当夜睡眠、次日恢复' },
  { id: 'supplement', name: '补剂', desc: '有证据的少数几种' },
  { id: 'basic', name: '基础营养', desc: '食物选择、餐次结构' },
  { id: 'bodycomp', name: '体成分与能量消耗', desc: '测量方法、去脂体重、代谢率、青少年与女性' },
  { id: 'assessment', name: '营养评估', desc: '膳食记录、能量与蛋白评估、水合与铁状态' },
  { id: 'food', name: '食物与膳食指导', desc: '餐盘、宝塔、食物成分表、外食与备赛食物' },
  { id: 'female', name: '女性拳手与 RED-S', desc: '月经周期、低能量可用性、铁与骨健康' },
  { id: 'youth', name: '青少年拳手', desc: '生长、分级、睡眠、补剂边界' },
  { id: 'rehab', name: '伤病与康复期营养', desc: '停训期能量与蛋白、愈合期营养素、复训渐进' },
  { id: 'recoveryfood', name: '恢复期饮食', desc: '各恢复场景的进食时机、碳水蛋白配比与避免事项' },
  { id: 'training', name: '训练课型与阶段营养', desc: '按能力类型与阶段叠加的训练营养执行' }
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
  }),
  bergeron2015: J({
    sourceType: 'consensus', year: 2015,
    authors: 'Bergeron MF, Mountjoy M, Armstrong N, et al.',
    title: 'International Olympic Committee consensus statement on youth athletic development',
    citation: 'Bergeron MF, Mountjoy M, Armstrong N, et al. International Olympic Committee consensus statement on youth athletic development. Br J Sports Med. 2015;49(11):843-851.',
    doi: '10.1136/bjsports-2015-094868',
    url: 'https://bjsm.bmj.com/content/49/11/843',
    publisher: 'British Journal of Sports Medicine',
    pages: '843-851'
  }),
  paruthi2016: J({
    sourceType: 'consensus', year: 2016,
    authors: 'Paruthi S, Brooks LJ, D’Ambrosio C, et al.',
    title: 'Recommended amount of sleep for pediatric populations: a consensus statement of the American Academy of Sleep Medicine',
    citation: 'Paruthi S, Brooks LJ, D’Ambrosio C, et al. Recommended amount of sleep for pediatric populations: a consensus statement of the American Academy of Sleep Medicine. J Clin Sleep Med. 2016;12(6):785-786.',
    doi: '10.5664/jcsm.5866',
    url: 'https://doi.org/10.5664/jcsm.5866',
    publisher: 'Journal of Clinical Sleep Medicine',
    pages: '785-786'
  }),
  kellmann2018: J({
    sourceType: 'consensus', year: 2018,
    authors: 'Kellmann M, Bertollo M, Bosquet L, Brink M, Coutts AJ, Duffield R, et al.',
    title: 'Recovery and performance in sport: consensus statement',
    citation: 'Kellmann M, Bertollo M, Bosquet L, Brink M, Coutts AJ, Duffield R, et al. Recovery and performance in sport: consensus statement. Int J Sports Physiol Perform. 2018;13(2):240-245.',
    doi: '10.1123/ijspp.2017-0759',
    url: 'https://doi.org/10.1123/ijspp.2017-0759',
    publisher: 'International Journal of Sports Physiology and Performance',
    pages: '240-245'
  }),
  patricios2023: J({
    sourceType: 'consensus', year: 2023,
    authors: 'Patricios JS, Schneider KJ, Dvorak J, Ahmed OH, Blauwet C, Cantu RC, et al.',
    title: 'Consensus statement on concussion in sport: the 6th International Conference on Concussion in Sport–Amsterdam, October 2022',
    citation: 'Patricios JS, Schneider KJ, Dvorak J, Ahmed OH, Blauwet C, Cantu RC, et al. Consensus statement on concussion in sport: the 6th International Conference on Concussion in Sport–Amsterdam, October 2022. Br J Sports Med. 2023;57(11):695-711.',
    doi: '10.1136/bjsports-2023-106898',
    url: 'https://bjsm.bmj.com/content/57/11/695',
    publisher: 'British Journal of Sports Medicine',
    pages: '695-711'
  }),
  janse2021: J({
    sourceType: 'consensus', year: 2021,
    authors: 'Janse van Rensburg DC, Jansen van Rensburg A, Fowler PM, Bender AM, Stevens D, Sullivan KO, et al.',
    title: 'Managing travel fatigue and jet lag in athletes: a review and consensus statement',
    citation: 'Janse van Rensburg DC, Jansen van Rensburg A, Fowler PM, Bender AM, Stevens D, Sullivan KO, et al. Managing travel fatigue and jet lag in athletes: a review and consensus statement. Sports Med. 2021;51(10):2029-2050.',
    doi: '10.1007/s40279-021-01502-0',
    url: 'https://doi.org/10.1007/s40279-021-01502-0',
    publisher: 'Sports Medicine',
    pages: '2029-2050'
  }),
  lastella2021: J({
    sourceType: 'systematic_review', year: 2021,
    authors: 'Lastella M, Halson SL, Vitale JA, Memon AR, Vincent GE',
    title: 'To nap or not to nap? A systematic review evaluating napping behavior in athletes and the impact on various measures of athletic performance',
    citation: 'Lastella M, Halson SL, Vitale JA, Memon AR, Vincent GE. To nap or not to nap? A systematic review evaluating napping behavior in athletes and the impact on various measures of athletic performance. Nat Sci Sleep. 2021;13:841-862.',
    doi: '10.2147/NSS.S315556',
    url: 'https://doi.org/10.2147/NSS.S315556',
    publisher: 'Nature and Science of Sleep',
    pages: '841-862'
  }),
  versey2013: J({
    sourceType: 'narrative_review', sourceTier: 'secondary', year: 2013,
    authors: 'Versey NG, Halson SL, Dawson BT',
    title: 'Water immersion recovery for athletes: effect on exercise performance and practical recommendations',
    citation: 'Versey NG, Halson SL, Dawson BT. Water immersion recovery for athletes: effect on exercise performance and practical recommendations. Sports Med. 2013;43(11):1101-1130.',
    doi: '10.1007/s40279-013-0063-8',
    url: 'https://doi.org/10.1007/s40279-013-0063-8',
    publisher: 'Sports Medicine',
    pages: '1101-1130'
  }),
  dupuy2018: J({
    sourceType: 'systematic_review', year: 2018,
    authors: 'Dupuy O, Douzi W, Theurot D, Bosquet L, Dugué B',
    title: 'An evidence-based approach for choosing post-exercise recovery techniques to reduce markers of muscle damage, soreness, fatigue, and inflammation: a systematic review with meta-analysis',
    citation: 'Dupuy O, Douzi W, Theurot D, Bosquet L, Dugué B. An evidence-based approach for choosing post-exercise recovery techniques to reduce markers of muscle damage, soreness, fatigue, and inflammation: a systematic review with meta-analysis. Front Physiol. 2018;9:403.',
    doi: '10.3389/fphys.2018.00403',
    url: 'https://doi.org/10.3389/fphys.2018.00403',
    publisher: 'Frontiers in Physiology',
    pages: '403'
  }),
  hill2014: J({
    sourceType: 'systematic_review', year: 2014,
    authors: 'Hill JA, Howatson G, van Someren KA, Leeder J, Pedlar CR',
    title: 'Compression garments and recovery from exercise-induced muscle damage: a meta-analysis',
    citation: 'Hill JA, Howatson G, van Someren KA, Leeder J, Pedlar CR. Compression garments and recovery from exercise-induced muscle damage: a meta-analysis. Br J Sports Med. 2014;48(18):1340-1346.',
    doi: '10.1136/bjsports-2013-092456',
    url: 'https://bjsm.bmj.com/content/48/18/1340',
    publisher: 'British Journal of Sports Medicine',
    pages: '1340-1346'
  }),
  walsh2018: J({
    sourceType: 'narrative_review', sourceTier: 'secondary', year: 2018,
    authors: 'Walsh NP',
    title: 'Recommendations to maintain immune health in athletes',
    citation: 'Walsh NP. Recommendations to maintain immune health in athletes. Eur J Sport Sci. 2018;18(6):820-831.',
    doi: '10.1080/17461391.2018.1449895',
    url: 'https://doi.org/10.1080/17461391.2018.1449895',
    publisher: 'European Journal of Sport Science',
    pages: '820-831'
  }),
  barnes2014: J({
    sourceType: 'narrative_review', sourceTier: 'secondary', year: 2014,
    authors: 'Barnes MJ',
    title: 'Alcohol: impact on sports performance and recovery in male athletes',
    citation: 'Barnes MJ. Alcohol: impact on sports performance and recovery in male athletes. Sports Med. 2014;44(7):909-919.',
    doi: '10.1007/s40279-014-0192-8',
    url: 'https://doi.org/10.1007/s40279-014-0192-8',
    publisher: 'Sports Medicine',
    pages: '909-919'
  }),
  peternelj2011: J({
    sourceType: 'narrative_review', sourceTier: 'secondary', year: 2011,
    authors: 'Peternelj TT, Coombes JS',
    title: 'Antioxidant supplementation during exercise training: beneficial or detrimental?',
    citation: 'Peternelj TT, Coombes JS. Antioxidant supplementation during exercise training: beneficial or detrimental? Sports Med. 2011;41(12):1043-1069.',
    doi: '10.2165/11594400-000000000-00000',
    url: 'https://doi.org/10.2165/11594400-000000000-00000',
    publisher: 'Sports Medicine',
    pages: '1043-1069'
  }),
  soligard2016: J({
    sourceType: 'consensus', year: 2016,
    authors: 'Soligard T, Schwellnus M, Alonso JM, Bahr R, Clarsen B, Dijkstra HP, et al.',
    title: 'How much is too much? (Part 1) International Olympic Committee consensus statement on load in sport and risk of injury',
    citation: 'Soligard T, Schwellnus M, Alonso JM, Bahr R, Clarsen B, Dijkstra HP, et al. How much is too much? (Part 1) International Olympic Committee consensus statement on load in sport and risk of injury. Br J Sports Med. 2016;50(17):1030-1041.',
    doi: '10.1136/bjsports-2016-096581',
    url: 'https://bjsm.bmj.com/content/50/17/1030',
    publisher: 'British Journal of Sports Medicine',
    pages: '1030-1041'
  }),
  schwellnus2016: J({
    sourceType: 'consensus', year: 2016,
    authors: 'Schwellnus M, Soligard T, Alonso JM, Bahr R, Clarsen B, Dijkstra HP, et al.',
    title: 'How much is too much? (Part 2) International Olympic Committee consensus statement on load in sport and risk of illness',
    citation: 'Schwellnus M, Soligard T, Alonso JM, Bahr R, Clarsen B, Dijkstra HP, et al. How much is too much? (Part 2) International Olympic Committee consensus statement on load in sport and risk of illness. Br J Sports Med. 2016;50(17):1043-1052.',
    doi: '10.1136/bjsports-2016-096572',
    url: 'https://bjsm.bmj.com/content/50/17/1043',
    publisher: 'British Journal of Sports Medicine',
    pages: '1043-1052'
  }),
  turnagol2022: J({
    sourceType: 'narrative_review', sourceTier: 'secondary', year: 2022,
    authors: 'Turnagöl HH, Koşar ŞN, Güzel Y, Aktitiz S, Atakan MM',
    title: 'Nutritional considerations for injury prevention and recovery in combat sports',
    citation: 'Turnagöl HH, Koşar ŞN, Güzel Y, Aktitiz S, Atakan MM. Nutritional considerations for injury prevention and recovery in combat sports. Nutrients. 2022;14(1):53.',
    doi: '10.3390/nu14010053',
    url: 'https://doi.org/10.3390/nu14010053',
    publisher: 'Nutrients',
    pages: '53',
    note: '在线发表于 2021-12-23，按期刊 2022 年第 14 卷第 1 期引用。'
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

  // ---------- 赛后 0–24 小时（PF-01 ~ PF-08） ----------
  {
    id: 'PF-01', cat: 'postfight', title: '终场 0–2h：先补液再补糖，第一口选液体',
    body: '终场后 0–2 小时先补液再补糖：按 hyd-replace 的每 kg 失重 1.25–1.5 L 分 3–4 次少量喝，选含钠 300–700 mg/L 的液体，不要一次灌。第一口不要直接上正餐，先用运动饮料、香蕉、粥或酸奶这类液体/半固体碳水，碳水节奏按 carb-recovery 的 1.0–1.2 g/kg/h 走，蛋白可同时给 20–30 g。口干、恶心或口腔/下颌受伤时继续小口液体，不强行咀嚼。有头痛加重、眩晕或呕吐时不要为了“补恢复”硬吃；营养侧只保证水分与易消化碳水，并建议按队医/医生流程评估。',
    sources: [src('acsm2007'), src('issn_timing2017'), src('patricios2023')],
    tags: ['postfight', 'hydration', 'carb']
  },
  {
    id: 'PF-02', cat: 'postfight', title: '赛后 2–6h：第一顿正餐怎么配',
    body: '赛后 2–6 小时吃第一顿正餐：碳水继续按 carb-recovery 的 1.0–1.2 g/kg/h 补到赛后 4 小时，之后按全天总量分配；这顿配 25–40 g 蛋白和少量脂肪。先吃半份，胃没有不适再补完，不要冷热交替猛吃。选低纤维主食（米饭、面条、面包）+ 瘦肉、鱼、蛋或奶 + 少量蔬菜，避免油炸、辣椒和大量生蔬菜。出汗多时这顿继续配含钠食物（汤、咸味主食），不要只喝白水；当天有脱水减重时按 wc-weighin-recovery 的 12 小时目标执行，不额外加量。',
    sources: [src('acsm2016'), src('issn_timing2017'), src('issn2025')],
    tags: ['postfight', 'meal', 'protein']
  },
  {
    id: 'PF-03', cat: 'postfight', title: '赛后当晚：睡眠优先，酒精不用来庆祝',
    body: '赛后当晚把睡眠当第一恢复手段，按 SLE-01 的 7–9 小时目标安排，别用庆祝、采访或复盘挤掉睡眠。酒精不要用来庆祝或助眠：越接近训练后、量越大，对蛋白合成、补水和后半夜睡眠破坏越明显，按 RF-11 执行；确实无法避免时先补液吃蛋白餐；不设推荐量，0.5 g/kg 只是文献中的上限参考，不是允许量。咖啡因只在需要时按计划用，睡前 8 小时内不加量（矩阵 G-SLE），也不要用咖啡因顶睡眠。赛后当晚不要启动新的减重或控水计划。',
    sources: [src('walsh2021'), src('barnes2014'), src('issn_caffeine2021'), src('kellmann2018')],
    tags: ['postfight', 'sleep', 'alcohol']
  },
  {
    id: 'PF-04', cat: 'postfight', title: '次日晨起：体重回升怎么看',
    body: '次日晨起体重比终场时回升多少，是判断补液补糖是否到位的粗略指标：按 REC-04 的 24 小时目标看，回升主要来自糖原和水，不是“胖了”。不要因为晨重比昨天高就继续控重或加练；赛后 24 小时内不继续减重（TN-12）。用同一时间、同一条件称重，看 7 日平均，不看单日起伏。若 24 小时后仍明显低于赛前、尿色持续深或站起头晕，按脱水处理并延长补液；需要医疗判断时只提示按队医/医生流程评估。',
    sources: [src('issn2025'), src('acsm2016'), src('kellmann2018')],
    tags: ['postfight', 'weight', 'recovery']
  },
  {
    id: 'PF-05', cat: 'postfight', title: '次日晨起：尿色、酸痛、食欲三项自查',
    body: '次日晨起做三项自查：尿色按 hyd-urine 的 1–3 级判断，4 级以上继续补含钠液体；酸痛明显时（按 rec-soreness 口径判断）食欲和消化可能受影响，此时不硬顶进食；恶心、头痛、呕吐或意识改变时，只提示按队医/医生流程评估，营养侧改少量多次易消化。赛后第一次晨尿偏深很常见，但到次日中午仍深就不是正常现象。三项里两项不对时，训练安排由教练/队医决定；营养侧只把当天能量与水分给够。',
    sources: [src('acsm2007'), src('patricios2023'), src('kellmann2018')],
    tags: ['postfight', 'check', 'soreness']
  },
  {
    id: 'PF-06', cat: 'postfight', title: '次日训练：恢复课怎么排',
    body: '次日训练先看自查结果：训练安排由教练/队医决定；营养侧按恢复期给足能量与水分，自查正常时按当天实际训练安排配套进食，有两项异常时优先补液和易消化食物。训练前后照常吃：训练前少量易消化碳水，训练后按 25–40 g 蛋白加碳水吃一餐，碳水按轻活动日取下限（RF-09 的 B-HOLD 3–5 g/kg），不要断碳。补液按口渴和尿色继续，出汗多时补钠。赛后多吃的部分不靠加练消耗，按恢复期吃够、睡够即可。',
    sources: [src('kellmann2018'), src('acsm2016'), src('issn_timing2017')],
    tags: ['postfight', 'recovery-session', 'training']
  },
  {
    id: 'PF-07', cat: 'fightday', title: '回合间补液与补碳：证据弱，只给方向',
    body: '回合间只做两件事：少量多次补水、保持口腔湿润；补碳的直接证据弱，本条只给方向、不给克数。局间不要一次灌大量水，也不要临时试没喝过的饮料或能量胶。出汗多、天气热时优先含钠液体；口腔干燥可用少量液体漱口，不吞大量。回合间出现头晕、心悸或视线模糊时，是否继续由裁判/队医决定；本条只做补液提示，不靠补糖硬撑。',
    sources: [src('acsm2007'), src('sport_nutrition4'), src('cscn6')],
    tags: ['postfight', 'between-rounds', 'weak']
  },
  {
    id: 'PF-08', cat: 'postfight', title: '性别与年龄差异：能写的写，写不了的说证据不足',
    body: '赛后第一天的补液补糖没有证据支持按性别调整剂量，女性拳手按同一套流程执行；若处在月经期、长期低能量可用性或反复骨伤，按 FE 分类和 REDs 评估处理（G-EA/G-MED）。青少年拳手不套成人量，能量和蛋白按 YT 分类与生长需求安排，赛后恢复优先睡眠和正餐，不用补剂顶上。孕期、哺乳期或赛后出现异常出血、持续腹痛时，营养只做配合，转医生处理。现有证据不足以给出按性别或年龄分层的具体克数，相关数值仍按成人区间并由营养师个体化调整。',
    sources: [src('reds2023'), src('bergeron2015'), src('female_athlete2022'), src('young_female_athlete2016')],
    tags: ['postfight', 'sex', 'age', 'weak']
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
  },

  // ---------- 女性拳手与 RED-S（FE-01 ~ FE-12） ----------
  {
    id: 'FE-01', cat: 'female', title: '相对能量缺乏（REDs）的核心：能量可用性长期不够',
    body: '相对能量缺乏（REDs）的核心不是体重，而是能量可用性（EA）长期低于需求。EA 低于 30 kcal/kg 去脂体重（FFM）/天属于低能量可用性，30–45 属于降低，要结合月经、骨伤和表现一起判断。出现停经、反复应力性骨折、晨脉升高或成绩停滞时，先停止减脂、把能量吃回来并转诊，而不是继续压体重。女性拳手在减重期要每月自查这一组信号。',
    sources: [src('reds2023')],
    tags: ['female', 'reds']
  },
  {
    id: 'FE-02', cat: 'female', title: '女性拳手减重：取更慢的一端，不用脱水补进度',
    body: '女性拳手减重仍按每周 0.5–1% 体重推进，但在低能量可用性（LEA）背景下要取更慢的一端。能量缺口越大，月经紊乱、骨密度下降和伤病风险出现得越早。距称重不足 2 周只做水盐和胃肠内容物微调，不启动新的热量缺口。不要用脱水减重去补减重进度落后的账。',
    sources: [src('acsm2021'), src('reds2023')],
    tags: ['female', 'weightcut']
  },
  {
    id: 'FE-03', cat: 'female', title: '月经周期与训练日营养：按本人反应调整',
    body: '月经周期会影响训练日的能量和碳水需求：黄体期基础体温升高、静息消耗略增、食欲往往更强。这一阶段训练日主食可以比卵泡期多一餐或加一次加餐，优先补碳水而不是只加蛋白。经期前一两天胃口差、腹胀时，改成小份多餐、低纤维、易消化。个体差异很大，以本人连续记录的反应为准，不套统一模板。',
    sources: [chap('female_athlete2022', '待核实', { note: '月经周期与营养章节待核实' }), chap('cscn6', '6')],
    tags: ['female', 'cycle']
  },
  {
    id: 'FE-04', cat: 'female', title: '铁：女性拳手最常见的隐性短板',
    body: '女性拳手、素食者和大量出汗者要定期查血红蛋白和铁蛋白，铁不足会先拖累耐力和恢复。补铁前先看血，不要长期自行服用铁剂。进餐时把红肉、动物肝脏或豆类与富含维生素 C 的蔬果同吃，能提高非血红素铁吸收；浓茶和咖啡尽量与正餐错开。铁蛋白低但血红蛋白正常时也要处理，具体方案由医生决定。',
    sources: [chap('cscn6', '9'), src('reds2023')],
    tags: ['female', 'iron']
  },
  {
    id: 'FE-05', cat: 'female', title: '低能量可用性（LEA）的六个早期信号',
    body: '低能量可用性（LEA）的早期信号常在成绩下滑之前出现：月经稀发或停经、反复应力性骨伤、静息心率升高、情绪低落、睡眠变差、恢复变慢。教练和营养师应把这些写进月度随访表，而不是只看体重和体脂。六项里持续出现两项以上，就先增加能量摄入并安排医学评估。不要等症状凑齐才处理。',
    sources: [src('reds2023'), chap('cscn6', '6')],
    tags: ['female', 'reds', 'screening']
  },
  {
    id: 'FE-06', cat: 'female', title: '月经期训练与进食：没有统一方案',
    body: '月经期的训练和进食没有统一方案，按本人反应调整，不照搬别人的做法。痛经明显时优先保证补液和易消化的碳水，训练量该降就降。腹泻或胀气时减少高纤维食物和乳制品，等症状缓解再恢复。出现持续大量出血、晕厥或痛经加重，先就医，不要靠调整饮食硬扛。',
    sources: [chap('female_athlete2022', '待核实', { note: '月经期训练与营养章节待核实' }), chap('cscn6', '6')],
    tags: ['female', 'cycle']
  },
  {
    id: 'FE-07', cat: 'female', title: '女性拳手体脂目标：不设统一数字',
    body: '女性拳手的体脂目标不设统一数字，要看体成分趋势、月经规律、骨健康和运动表现四项一起判断。体脂下降伴随月经紊乱或反复骨伤，说明已经越过安全线，应停止减脂。不要拿男性拳手的体脂标准套用，也不要用单次生物电阻抗（BIA）读数下结论。目标由营养师结合连续数据设定。',
    sources: [src('reds2023'), chap('acsm_bc', '7')],
    tags: ['female', 'bodycomp']
  },
  {
    id: 'FE-08', cat: 'female', title: '口服避孕药与营养：只做提醒，不调剂量',
    body: '口服避孕药可能影响部分 B 族维生素、镁和体液状态，但证据并不一致，不足以支持统一加量。不要因为服药就自行增加复合维生素或矿物质的剂量。把用药情况告诉营养师，评估时一起考虑；具体是否需要调整，由医生判断。',
    sources: [chap('female_athlete2022', '待核实', { note: '避孕药与营养章节待核实' }), chap('cscn6', '6')],
    tags: ['female', 'medication']
  },
  {
    id: 'FE-09', cat: 'female', title: '孕期与产后拳手：先转诊，App 只做记录',
    body: '孕期和产后拳手的营养方案必须由产科医生和营养师共同制定，App 只做记录，不给减重或脱水建议。孕期不建议任何形式的控重或脱水减重，训练以医嘱为准。产后恢复训练时，能量和蛋白要跟上恢复与哺乳需求，不要一边哺乳一边压热量。出现头晕、恶露异常或情绪持续低落，先就医。',
    sources: [chap('cscn6', '6'), chap('cn_dietary2022', '待核实', { note: '孕期与哺乳期妇女膳食指南' })],
    tags: ['female', 'pregnancy']
  },
  {
    id: 'FE-10', cat: 'female', title: '女性拳手补剂：能用的还是那几样',
    body: '女性拳手可用的补剂和有证据的选项基本一致：咖啡因按 3–6 mg/kg 在训练前用，肌酸每天 3–5 g 长期补充。其他宣称“调激素”“促燃脂”的产品，先看是否有第三方检测和独立研究。孕期、哺乳期和月经紊乱期间，补剂一律先问医生。不要把补剂当成解决能量不足的手段。',
    sources: [src('issn_caffeine2021'), src('issn_creatine2017')],
    tags: ['female', 'supplement']
  },
  {
    id: 'FE-11', cat: 'female', title: '骨健康：钙和维生素 D 不能替代能量',
    body: '能量长期不足时，单纯补钙和维生素 D 救不了骨健康，先解决能量可用性（EA）再谈微量营养素。日常保证奶类、豆制品和日照，负重与抗阻训练是骨刺激的主要来源。不要用大剂量钙片替代正常进食。反复应力性骨折要转诊，由医生判断是否需要药物或进一步检查。',
    sources: [src('reds2023'), chap('cn_dietary2022', '待核实', { note: '奶类与骨健康' })],
    tags: ['female', 'bone']
  },
  {
    id: 'FE-12', cat: 'female', title: '女性拳手称重后恢复：窗口放得更宽',
    body: '女性拳手赛前减重叠加低能量可用性（LEA）时，称重后的恢复窗口要放得更宽。按每丢失 1 kg 体重补 1.25–1.5 L 含钠液体，碳水按 1.0–1.2 g/kg/h 分次补，蛋白 20–40 g 起步。恢复期不要只补糖，钠和蛋白同样要跟上。第二天仍头晕、心率偏高或无法正常进食时，推迟训练并评估。',
    sources: [src('acsm2007'), src('issn2025'), chap('cscn6', '8')],
    tags: ['female', 'weighin']
  },

  // ---------- 青少年拳手（YT-01 ~ YT-12） ----------
  {
    id: 'YT-01', cat: 'youth', title: '青少年拳手：先长个子，再谈控体重',
    body: '青少年拳手的首要目标是长个子，不是把体重压到成年级别。赛季中能量长期不足会拖慢身高增长、骨密度积累和青春期发育。控体重前先看生长曲线和发育阶段，优先维持体重、让身高追上。需要减重时由医生或营养师参与，不用成人那套快速减脂方案。',
    sources: [src('bergeron2015'), src('reds2023')],
    tags: ['youth', 'growth']
  },
  {
    id: 'YT-02', cat: 'youth', title: '青少年蛋白：按体重给，分到每餐',
    body: '青少年拳手的蛋白按体重给，参考区间 1.2–2.0 g/kg/天，训练量大时取上限。把蛋白分到三餐和一到两次加餐，每餐都有奶、蛋、肉、鱼或豆制品。不要用蛋白粉替代正餐，也不要把成人健身餐直接套给孩子。主食和蔬菜同样要吃够，蛋白不是越多越好。',
    sources: [src('acsm2016'), chap('cn_dris2023', '待核实', { note: '蛋白质参考摄入量章节待核实' })],
    tags: ['youth', 'protein']
  },
  {
    id: 'YT-03', cat: 'youth', title: '青少年碳水：训练日必须吃够主食',
    body: '青少年训练日的碳水按训练量给：中等训练约 3–5 g/kg/天，大强度或一天两练可到 6–10 g/kg/天。主食要占到每餐的一半左右，训练前后各留一次碳水。低碳水饮食不适合还在长身体的拳手。体重不涨、训练后半段掉速，先加主食而不是加补剂。',
    sources: [src('acsm2016'), chap('cn_dietary2022', '待核实', { note: '谷类与主食' })],
    tags: ['youth', 'carb']
  },
  {
    id: 'YT-04', cat: 'youth', title: '青少年睡眠时长：按年龄守住下限',
    body: '美国睡眠医学会（AASM）对青少年的推荐是：6–12 岁每晚 9–12 小时，13–18 岁每晚 8–10 小时。训练日、比赛期和减重期都要守住这个下限。睡眠不足会放大食欲、降低恢复速度并增加受伤风险。不要把熬夜补作业当成可以牺牲睡眠的理由。',
    sources: [src('paruthi2016'), src('walsh2021')],
    tags: ['youth', 'sleep']
  },
  {
    id: 'YT-05', cat: 'youth', title: '青少年补剂：默认不补，先看三餐',
    body: '青少年补剂默认不补，先把三餐和睡眠做好。确有缺乏时（如明确诊断的缺铁性贫血）按医嘱补，不自行买“长高”“增肌”产品。补剂市场针对青少年的宣传最多、证据最少。任何产品先查成分和第三方检测，拿不准就问医生。',
    sources: [src('bergeron2015'), src('ioc2018')],
    tags: ['youth', 'supplement']
  },
  {
    id: 'YT-06', cat: 'youth', title: '青少年禁止脱水减重',
    body: '青少年拳手不应使用脱水减重，包括蒸桑拿、限水、穿发汗服。青少年体温调节和心血管调节尚未成熟，脱水带来的风险和表现损失都更大。分级和控重应以长期饮食与训练调整为主，不用赛前急速脱水。教练发现队员在用脱水手段，应立即叫停。',
    sources: [src('acsm2021'), src('bergeron2015'), src('reds2023')],
    tags: ['youth', 'weightcut']
  },
  {
    id: 'YT-07', cat: 'youth', title: '青少年分级：按发育阶段，不按成人级别',
    body: '青少年分级要按发育阶段和生长曲线安排，不按成人级别硬套。同一年龄的发育差异可达数年，按体重分级时要把发育程度一起考虑。赛前称重频率不宜过高，避免把注意力引向体重数字。具体级别和称重安排由赛事与医生共同确认。',
    sources: [src('acsm2021'), src('bergeron2015')],
    tags: ['youth', 'weightcut']
  },
  {
    id: 'YT-08', cat: 'youth', title: '学校与食堂场景：先保证三餐结构',
    body: '青少年在学校和食堂吃饭，先保证每餐有主食、有蛋白、有蔬菜，再谈细节。训练日可以在书包里带面包、牛奶、香蕉这类方便加餐。不用精确称重，也别让孩子自己算热量。发现长期只吃零食、跳过正餐，先和家长沟通。',
    sources: [chap('cn_dietary2022', '待核实', { note: '学龄儿童膳食指南' }), chap('cscn6', '21')],
    tags: ['youth', 'food']
  },
  {
    id: 'YT-09', cat: 'youth', title: '青少年女拳手：REDs 风险更高',
    body: '青少年女拳手是相对能量缺乏（REDs）的高风险人群，月经初潮延迟、停经和反复骨伤都要当信号处理。发育期同时面对控体重和成绩压力，能量不足的代价比成年更大。发现生长停滞或月经异常，先加能量并转诊，不继续减脂。评估时把月经史和生长曲线一起看。',
    sources: [src('reds2023'), chap('young_female_athlete2016', '待核实', { note: '青少年女运动员章节待核实' })],
    tags: ['youth', 'female', 'reds']
  },
  {
    id: 'YT-10', cat: 'youth', title: '青少年训练日加餐：两餐之间不能省',
    body: '青少年训练日要在两餐之间加一次碳水加蛋白，别空腹练、也别练完只喝水。训练前 1–3 小时吃易消化主食，训练后补主食加奶或蛋。一天两练时，中间那次加餐不能省。加餐的目的是补足总能量，不是替代正餐。',
    sources: [src('acsm2016'), src('bergeron2015')],
    tags: ['youth', 'timing']
  },
  {
    id: 'YT-11', cat: 'youth', title: '青少年咖啡因与能量饮料：能不给就不给',
    body: '青少年对咖啡因更敏感，能量饮料和浓缩咖啡因产品能不给就不给。咖啡因会影响入睡和心率，训练日午后尽量不摄入。需要提神时先查睡眠和总能量，而不是加咖啡因。比赛期不使用未测试过的含咖啡因产品。',
    sources: [src('issn_caffeine2021'), chap('cn_dietary2022', '待核实', { note: '含糖饮料与添加糖' })],
    tags: ['youth', 'caffeine']
  },
  {
    id: 'YT-12', cat: 'youth', title: '体重焦虑与进食行为：超出营养范围要转诊',
    body: '青少年出现明显体重焦虑、催吐、暴食或长期躲开集体进食，已经超出营养调整的范围，要转心理或医学评估。不要用 App 的体重曲线去加压，也不要在队里公开称重排名。家长和教练先统一口径：成绩和健康优先于体重数字。营养方案只做配合，不替代治疗。',
    sources: [src('reds2023'), src('bergeron2015')],
    tags: ['youth', 'behavior']
  },

  // ---------- 伤病与康复期营养（RH-01 ~ RH-10） ----------
  {
    id: 'RH-01', cat: 'rehab', title: '受伤后第一周：能量别马上砍，蛋白先给足',
    body: '受伤后第一周不要马上大幅砍热量，组织修复本身需要能量和蛋白。蛋白维持在平时训练期水平，约 1.4–2.0 g/kg/天，分散到每餐。若完全停训，能量按实际活动量下调，但不要低于静息代谢率（RMR）估算太多。先保证蛋白和微量营养素，再谈减重。',
    sources: [src('issn2017'), chap('cscn6', '待核实', { note: '损伤与康复营养章节待核实' })],
    tags: ['rehab', 'energy']
  },
  {
    id: 'RH-02', cat: 'rehab', title: '愈合期关键微量营养素：从食物里拿',
    body: '愈合期优先保证蛋白质、维生素 C、维生素 D、锌和钙，从正常食物里拿，不靠大剂量单片。每天有奶类、豆制品、瘦肉、鱼、蛋和新鲜蔬果，日照不足时再评估维生素 D。不要相信“骨头汤补钙”的说法，汤里钙很少、脂肪不少。微量营养素缺乏明确时按医嘱补。',
    sources: [chap('cscn6', '待核实', { note: '损伤愈合与微量营养素章节待核实' }), chap('cn_dietary2022', '待核实', { note: '奶类、蔬果与适量蛋白' })],
    tags: ['rehab', 'micronutrient']
  },
  {
    id: 'RH-03', cat: 'rehab', title: '停训期体重管理：缺口调小，不急着掉秤',
    body: '停训期体重管理先把热量缺口调小，不要按赛前减重的速度掉秤。减重仍以每周 0.5–1% 体重为上限，受伤早期可以更慢。用 7 日体重移动平均看趋势，不因单日波动砍餐。体重上升明显时先查饮食记录和活动量，再决定是否调整。',
    sources: [src('acsm2021'), chap('acsm_bc', '7')],
    tags: ['rehab', 'weight']
  },
  {
    id: 'RH-04', cat: 'rehab', title: '停训期体成分：肌肉掉得比脂肪快',
    body: '停训期肌肉流失比脂肪快，蛋白和抗阻训练要同时保住。蛋白按 1.4–2.0 g/kg/天，能做上肢或健侧抗阻时保持每周两次以上。完全不能训练的部位要避免二次损伤，训练方案由康复师定。体成分用同一方法、同一条件隔期对比，不看单次读数。',
    sources: [chap('acsm_bc', '7'), src('issn2017')],
    tags: ['rehab', 'bodycomp']
  },
  {
    id: 'RH-05', cat: 'rehab', title: '手部损伤：先解决“吃得到”',
    body: '手部骨折或韧带损伤后，切菜、开包装、拿餐具都会变难，进食安排要围绕“能吃到”来设计。优先选即食、软食、已切好的食物，或用吸管杯、代餐保证正餐不缺席。手部固定期间不必追求精确份量，先保证三餐有主食和蛋白。恢复抓握后再逐步换回正常食物。',
    sources: [chap('cscn6', '待核实', { note: '手部损伤进食安排待核实' }), chap('cn_dietary2022', '待核实', { note: '谷类与适量蛋白' })],
    tags: ['rehab', 'hand']
  },
  {
    id: 'RH-06', cat: 'rehab', title: '肋骨损伤：小份多餐，少胀气',
    body: '肋骨损伤时深呼吸和咳嗽都会痛，吃太饱、胀气会更难受。改成小份多餐，减少豆类、碳酸饮料和大量生蔬菜。饭后不要立刻平躺，慢慢走动帮助消化。疼痛影响进食或体重持续下降时，要及时复诊。',
    sources: [chap('cscn6', '待核实', { note: '肋骨损伤进食安排待核实' }), chap('cn_dietary2022', '待核实', { note: '蔬果与适量蛋白' })],
    tags: ['rehab', 'rib']
  },
  {
    id: 'RH-07', cat: 'rehab', title: '膝踝损伤：能量按活动量降，不靠极端节食',
    body: '膝或踝损伤需要减少负重时，能量可以下调，但不要用极端节食换掉秤。活动量骤降后食欲往往还在，先按实际活动量安排三餐，别按原来的训练日食量吃。蔬菜和蛋白不能省，主食按活动量减。肿胀加重或疼痛持续，先找康复师而不是继续压热量。',
    sources: [chap('cscn6', '待核实', { note: '下肢损伤期能量调整待核实' }), chap('acsm_bc', '7')],
    tags: ['rehab', 'knee']
  },
  {
    id: 'RH-08', cat: 'rehab', title: '头部受击后：能量和水分不能少，酒精不要',
    body: '头部受击后不能限能量，规律三餐和充足饮水是基础。酒精会影响平衡、睡眠和恢复，恢复期避免饮酒。咖啡因按平时习惯少量保留，不要突然加量提神。症状持续、头痛加重或无法正常进食时，按医生流程评估，营养只做配合。',
    sources: [chap('cscn6', '待核实', { note: '脑震荡恢复期营养待核实' }), src('acsm2016')],
    tags: ['rehab', 'concussion']
  },
  {
    id: 'RH-09', cat: 'rehab', title: '复训渐进：先恢复食欲和消化，再看营养耐受',
    body: '复训第一阶段先把食欲和消化恢复；训练加量由队医决定。训练前少量易消化碳水，训练后再补一次正餐，观察腹胀、反酸和腹泻。吃不下时用液体食物过渡，少量多次。消化症状持续不缓解时，先回到易消化食物、看营养耐受，并建议按队医/医生流程评估。',
    sources: [chap('cscn6', '待核实', { note: '复训与消化适应待核实' }), chap('sport_nutrition4', '17')],
    tags: ['rehab', 'return']
  },
  {
    id: 'RH-10', cat: 'rehab', title: '康复期补剂边界：只补缺口，不指望“修复”',
    body: '康复期补剂只补明确缺口，不指望“修复关节”“加速愈合”的产品。维生素 D、钙、铁等只有在检测或饮食明确不足时才考虑，按医嘱用。蛋白粉可以用，但它只是食物替代，不是治疗。任何宣称替代康复训练的产品都不要买。',
    sources: [src('ioc2018'), chap('cscn6', '待核实', { note: '康复期补剂边界待核实' })],
    tags: ['rehab', 'supplement']
  },

  // ---------- 日常恢复补缺（RC-01 ~ RC-13） ----------
  {
    id: 'RC-01', cat: 'recovery', title: '午睡与补觉：短睡为主，别影响夜间睡眠',
    body: '训练日午睡以短睡为主，控制在不会醒后发懵的长度，醒后留出缓冲再上训练。午睡能补夜间睡眠不足，但睡得太久或太晚会影响当晚入睡。比赛期把午睡固定成日程的一部分，而不是累了才睡。夜间已经睡够的人不必强行午睡。',
    sources: [src('lastella2021'), src('walsh2021')],
    tags: ['recovery', 'sleep', 'nap']
  },
  {
    id: 'RC-02', cat: 'recovery', title: '跨时区与旅行：按目的地时间调作息',
    body: '跨时区比赛前按目的地时间逐步调整睡眠和进食，到达后白天多接触自然光、按当地时间吃三餐。长途飞行中少量多次补水，避免用酒精助眠。向东飞通常比向西飞更难适应，跨时区越多越要提前安排。到达后头两天不做高强度测试或减重，把训练放到作息稳定之后。',
    sources: [src('janse2021'), src('walsh2021')],
    tags: ['recovery', 'travel', 'sleep']
  },
  {
    id: 'RC-03', cat: 'recovery', title: '训练负荷：sRPE 之外看“陡增”，不迷信单一比值',
    body: '主观用力感训练负荷（sRPE）之外，还要看周与周之间的负荷陡增，而不是只算一周总量。急慢性负荷比（ACWR）可以作为提示，但没有一个适用于所有拳手的单一安全比值，不能拿一个数字直接决定上不上量。负荷连续上升、同时酸痛和睡眠变差时，先减载再观察。把训练日志和晨脉、睡眠放在一起看，比单看负荷曲线可靠。',
    sources: [src('soligard2016'), src('foster2001'), src('kellmann2018')],
    tags: ['recovery', 'load', 'acwr']
  },
  {
    id: 'RC-04', cat: 'recovery', title: '心率变异性（HRV）：只看趋势，不做单日决策',
    body: '心率变异性（HRV）只看个人基线和滚动趋势，不用单日读数做决策。HRV 连续低于自己的正常范围，同时晨脉升高、睡眠变差或酸痛加重，才说明恢复不足。HRV 高于基线也不等于可以无限加量，要结合主观状态和训练负荷。测量条件尽量固定：同一时间、同一姿势、同一设备。',
    sources: [src('buchheit2014'), src('kellmann2018')],
    tags: ['recovery', 'hrv']
  },
  {
    id: 'RC-05', cat: 'recovery', title: '中枢疲劳：几项信号同时出现才值得警惕',
    body: '神经/中枢疲劳不是单一指标能判断的：表现持续下降、情绪低落、睡眠变差、晨脉升高、对训练失去兴趣，几项同时出现才值得警惕。先排除缺铁、甲状腺、感染和能量不足这些可查原因。确认是负荷累积后，减载并保证能量、碳水和睡眠，不要靠咖啡因硬顶。持续数周不恢复、或伴随发热和明显体重下降，转医生评估。',
    sources: [src('meeusen2013'), src('schwellnus2016'), src('kellmann2018')],
    tags: ['recovery', 'overtraining', 'fatigue']
  },
  {
    id: 'RC-06', cat: 'recovery', title: '打击后不适：营养先配合，训练按队医流程',
    body: '是否属于需要进一步评估的情况由队医判断；出现头痛、眩晕、恶心、反应变慢、记忆空白或平衡异常时，不要为了“补恢复”硬吃，并建议按队医/医生流程评估。恢复期营养侧不限能量、规律三餐、充足饮水、不脱水、不饮酒，也不要用补剂宣称能“修复脑损伤”。能否复训、怎么加量由队医决定；营养侧只保证能量、水分和蛋白。被击中后表现异常时，记录情况并按上述营养侧处理，训练安排由队医决定。',
    sources: [src('patricios2023'), src('turnagol2022')],
    tags: ['recovery', 'concussion', 'medical']
  },
  {
    id: 'RC-07', cat: 'recovery', title: '冷水浸泡（CWI）：用于快速恢复，不做每日流程',
    body: '冷水浸泡（CWI）主要用于连续比赛、一天两练这类需要快速恢复的场景，而不是每次训练后的固定流程。力量或增肌期频繁长时间浸泡，可能削弱部分训练适应。赛后不要立刻长时间泡冰水，先补液补糖、让体温回落。心血管疾病、末梢循环问题或对冷刺激不适的人，先问医生。',
    sources: [src('versey2013'), src('dupuy2018')],
    tags: ['recovery', 'cold', 'physical']
  },
  {
    id: 'RC-08', cat: 'recovery', title: '加压、按摩与拉伸：缓解酸痛不等于修复',
    body: '加压衣、按摩和拉伸能减轻延迟性肌肉酸痛（DOMS）的主观感受，但不等于组织已经修复。加压衣在赛后穿着有一定证据，按摩可作为辅助手段，拉伸不能预防受伤也不加速恢复。这些手段都不能替代睡眠、能量和蛋白。手法和压力以不加重疼痛为准，受伤部位先问康复师。',
    sources: [src('dupuy2018'), src('hill2014'), src('kellmann2018')],
    tags: ['recovery', 'massage', 'compression']
  },
  {
    id: 'RC-09', cat: 'recovery', title: '主动恢复：低强度活动，不要变成第二次训练',
    body: '若当天安排主动恢复，能量不必按训练日给，按恢复期吃够即可。它比完全躺平更能缓解酸痛和僵硬，但不能替代睡眠和进食。大负荷后第二天做主动恢复，不要变成又一次训练，训练安排由教练/队医决定。出现发热、明显乏力或疼痛加重时，改为休息，并建议按队医/医生流程评估。',
    sources: [src('dupuy2018'), src('kellmann2018')],
    tags: ['recovery', 'active']
  },
  {
    id: 'RC-10', cat: 'recovery', title: '大负荷后免疫：防上呼吸道感染（URTI）靠睡眠和进食',
    body: '大负荷、旅行、睡眠不足和能量缺口叠加时，上呼吸道感染（URTI）风险会上升。防护的重点是手卫生、充足睡眠、规律进食和避免带病硬练，而不是靠大剂量维生素或“免疫增强”产品。出现发热、全身酸痛、咳嗽加重时停训并就医，不要用发汗或脱水“排毒”。恢复训练从低强度开始，别一退烧就回到实战。',
    sources: [src('walsh2018'), src('schwellnus2016')],
    tags: ['recovery', 'immune']
  },
  {
    id: 'RC-11', cat: 'recovery', title: '酒精与恢复：越靠近训练、量越大，影响越明显',
    body: '训练后饮酒会干扰蛋白合成、免疫、补水和睡眠，越接近训练、量越大，影响越明显。研究认为约 0.5 g/kg 体重对多数恢复指标影响较小，但这是“上限参考”，不是推荐量。备赛期和减重期直接避免；赛后庆祝也先补液、进食、睡够再考虑。用酒精助眠会破坏后半夜睡眠，跨时区时尤其不要用。',
    sources: [src('barnes2014')],
    tags: ['recovery', 'alcohol']
  },
  {
    id: 'RC-12', cat: 'recovery', title: '抗氧化补剂：大剂量可能拖慢适应',
    body: '长期大剂量补充维生素 C 和维生素 E，可能削弱训练带来的适应，而不是加快恢复。日常从蔬果、坚果和正常饮食里获取抗氧化物质就够了。不要为了“抗炎”长期吃高剂量抗氧化补剂；明确缺乏时按医嘱补。搏击项目的损伤恢复证据里，抗氧化剂也不是主力，能量、蛋白和睡眠优先。',
    sources: [src('peternelj2011'), src('ioc2018'), src('turnagol2022')],
    tags: ['recovery', 'antioxidant', 'supplement']
  },
  {
    id: 'RC-13', cat: 'recovery', title: '心理恢复：压力和睡眠会把疲劳放大',
    body: '心理恢复和身体恢复是一起发生的：压力大、焦虑、睡眠差时，酸痛感和疲劳感都会被放大。把放松训练、呼吸练习、规律作息和与教练的沟通写进周计划，而不是等崩了再处理。比赛后安排真正的休整期，不用每天盯着体重和训练数据。持续情绪低落、失眠、失去训练兴趣或出现极端体重行为，转心理或医学评估。',
    sources: [src('kellmann2018'), src('meeusen2013')],
    tags: ['recovery', 'psychology', 'stress']
  },

  // ---------- 恢复期饮食（RF-01 ~ RF-13，与 RC 互链） ----------
  {
    id: 'RF-01', cat: 'recoveryfood', title: '午睡与补觉的饮食落点',
    body: '配合 RC-01：午睡安排在 13:00–16:00，短睡控制在 30 分钟以内；时间充裕时可按 20–90 分钟安排，但醒后至少留 30 分钟再训练或比赛。午睡前那一餐不要吃大餐、高脂或高纤维食物；醒后要训练时，把这一餐当训练前餐，按 carb-timing 在训练前 1–3 小时吃 1–2 g/kg 碳水、少量蛋白，份量以不胀为准，吃完不要立刻躺下。不要用酒精助眠，酒精会破坏后半夜睡眠；普通午睡不要临时补咖啡因，确需提神可按 15–20 分钟的咖啡小睡（coffee-nap）执行，且全天咖啡因仍遵守矩阵 G-SLE 的睡前 8 小时 cutoff。醒后先补水，接训练按训练前加餐吃少量易消化碳水；不接训练则按正常餐次吃下一餐，蛋白和碳水照常，不需要为“补恢复”额外加餐。已经过了 16:00、离训练不足 30 分钟、或午睡后反而更昏沉时，改成不睡：只吃少量碳水、把长睡留到夜间；夜间睡眠已经足够时也不强行加午睡。',
    sources: [src('lastella2021'), src('walsh2021'), src('barnes2014')],
    tags: ['recoveryfood', 'rc-01', 'sleep', 'nap']
  },
  {
    id: 'RF-02', cat: 'recoveryfood', title: '跨时区与旅行的饮食落点',
    body: '配合 RC-02：到达目的地后按当地时间吃三餐，早餐保证蛋白，不要用一顿大餐把时差“顶过去”。长途飞行中少量多次补水，机舱干燥或出汗多时选含钠液体，不要一次灌大量白水。避免用酒精助眠，酒精会加重脱水和后半夜睡眠碎片化。跨时区头两天不启动新的减重计划，也不在到达当天做脱水或大负荷测试。',
    sources: [src('janse2021'), src('walsh2021'), src('acsm2007')],
    tags: ['recoveryfood', 'rc-02', 'travel', 'hydration']
  },
  {
    id: 'RF-03', cat: 'recoveryfood', title: '训练负荷陡增日的饮食落点',
    body: '配合 RC-03：训练负荷陡增的那几天，碳水按训练日区间取中上限（见 carb-training），不要同时加深热量缺口。训练后 2 小时内补 25–40 g 蛋白，并按 1.0–1.2 g/kg/h 补碳水，帮助糖原恢复。大量出汗时按 hyd-replace 补含钠液体，不要只喝白水。负荷连续上升、睡眠和晨脉同时变差时，先减载，不要靠咖啡因或加餐硬顶。',
    sources: [src('acsm2016'), src('issn_timing2017'), src('kellmann2018')],
    tags: ['recoveryfood', 'rc-03', 'load', 'carb']
  },
  {
    id: 'RF-04', cat: 'recoveryfood', title: 'HRV 偏低时的饮食落点',
    body: '配合 RC-04：心率变异性（HRV）偏低不是加补剂或加餐的理由，先确认全天能量和碳水没有长期不足。训练日照常吃够碳水与蛋白，不要把“恢复差”变成进一步节食的借口。连续低 HRV 同时晨脉升高、睡眠变差时，减载并检查能量可用性（EA），必要时按相对能量缺乏（REDs）评估。咖啡因只按计划使用，不用来对冲疲劳。',
    sources: [src('buchheit2014'), src('kellmann2018'), src('reds2023')],
    tags: ['recoveryfood', 'rc-04', 'hrv', 'energy']
  },
  {
    id: 'RF-05', cat: 'recoveryfood', title: '中枢疲劳的饮食落点',
    body: '配合 RC-05：中枢疲劳先排除能量不足、缺铁和感染，再谈训练调整。三餐规律、碳水按训练日区间吃够，蛋白按全天总量分配，不在疲劳时额外加补剂。训练前留出消化时间吃少量碳水，避免空腹上强度后靠咖啡因硬撑。持续数周不恢复、伴随发热或明显体重下降时，转医生评估，营养只做配合。',
    sources: [src('meeusen2013'), src('schwellnus2016'), src('kellmann2018')],
    tags: ['recoveryfood', 'rc-05', 'overtraining', 'fatigue']
  },
  {
    id: 'RF-06', cat: 'recoveryfood', title: '打击累积与脑震荡的饮食落点',
    body: '配合 RC-06：饮食落点已被 RH-08 覆盖——不限能量、规律三餐、充足饮水、避免酒精、咖啡因不突然加量。本条只补执行：恶心或吃不下时先用清淡碳水加液体少量多次，症状稳定后再加蛋白，不要一次吃大餐。不要用宣称“修复脑损伤”的补剂，也不要用脱水或发汗“排毒”。呕吐、无法正常进食或头痛加重时，建议按队医/医生流程评估；营养侧先保证液体与易消化碳水。',
    sources: [src('patricios2023'), src('turnagol2022'), src('cscn6')],
    tags: ['recoveryfood', 'rc-06', 'concussion', 'medical']
  },
  {
    id: 'RF-07', cat: 'recoveryfood', title: '冷水浸泡后的饮食落点',
    body: '配合 RC-07：冷水浸泡（CWI）前先补液补糖，不要空腹或脱水状态下长时间泡冰水。泡完后按训练后常规吃蛋白和碳水，冷疗不能替代进食，也不要用“已经做了恢复”当理由少吃。力量或增肌期频繁冷疗时，训练后那一餐照常吃，不要借冷疗后控重。出现寒战、头晕或心血管不适时先停止并就医。',
    sources: [src('versey2013'), src('dupuy2018'), src('issn_timing2017')],
    tags: ['recoveryfood', 'rc-07', 'cold', 'physical']
  },
  {
    id: 'RF-08', cat: 'recoveryfood', title: '加压、按摩与拉伸的饮食落点',
    body: '配合 RC-08：加压衣、按摩和拉伸不改变当天的饮食需求，也不能替代蛋白、碳水和睡眠。做完这些手段后照常吃训练后那一餐，不要因为“已经放松了”就减少进食。受伤部位需要修复时，能量和蛋白按 rehab 分类的条目执行，不靠按摩或拉伸“补营养”。手法和压力以不加重疼痛为准。',
    sources: [src('dupuy2018'), src('hill2014'), src('kellmann2018')],
    tags: ['recoveryfood', 'rc-08', 'massage', 'compression']
  },
  {
    id: 'RF-09', cat: 'recoveryfood', title: '主动恢复日的饮食落点',
    body: '配合 RC-09：主动恢复日碳水取训练日下限（矩阵 B-HOLD 的 3–5 g/kg），但不要断碳；蛋白按全天总量正常分配。低强度活动不需要额外补糖，除非出汗多或时间很长，才按 hyd-replace 补液补钠。主动恢复不是加餐的理由，也不要用“今天练得少”制造更大缺口。出现发热、明显乏力或疼痛加重时改为休息。',
    sources: [src('acsm2016'), src('kellmann2018')],
    tags: ['recoveryfood', 'rc-09', 'active', 'carb']
  },
  {
    id: 'RF-10', cat: 'recoveryfood', title: '大负荷后免疫的饮食落点',
    body: '配合 RC-10：大负荷后防上呼吸道感染（URTI），先把能量、碳水和蛋白吃够，再谈补剂。蛋白按每餐 0.3–0.4 g/kg 分配到 3–5 餐，训练后 2 小时内补 25–40 g，碳水按 1.0–1.2 g/kg/h 补。避免酒精，避免大剂量维生素 C/E 和“免疫增强”产品。感染期不要用发汗或脱水“排毒”，发热时停训就医。',
    sources: [src('walsh2018'), src('schwellnus2016'), src('issn2017')],
    tags: ['recoveryfood', 'rc-10', 'immune', 'protein']
  },
  {
    id: 'RF-11', cat: 'recoveryfood', title: '酒精的饮食落点',
    body: '配合 RC-11：酒精的饮食落点已被 basic-alcohol 和 RC-11 覆盖——训练后越早、量越大，对蛋白合成、补水、免疫和睡眠影响越明显。本条只补执行：备赛期和减重期直接避免；赛后若无法完全避免，先补液、吃蛋白餐，再把量控制在 0.5 g/kg 体重以下，且不要睡前饮酒。用酒精助眠会破坏后半夜睡眠，跨时区时尤其不要用。',
    sources: [src('barnes2014')],
    tags: ['recoveryfood', 'rc-11', 'alcohol']
  },
  {
    id: 'RF-12', cat: 'recoveryfood', title: '抗氧化补剂的饮食落点',
    body: '配合 RC-12：抗氧化物质从蔬果、坚果和正常饮食里拿，训练后不要追加高剂量维生素 C/E 补剂。长期大剂量抗氧化补剂可能削弱训练适应，不能当成“抗炎恢复”的主力。明确缺乏时按医嘱补，不要自行加量。训练后优先蛋白、碳水和补液，抗氧化补剂不替代这些。',
    sources: [src('peternelj2011'), src('ioc2018')],
    tags: ['recoveryfood', 'rc-12', 'antioxidant', 'supplement']
  },
  {
    id: 'RF-13', cat: 'recoveryfood', title: '心理恢复的饮食落点',
    body: '配合 RC-13：心理恢复期保持规律三餐，不跳餐、不用极端节食或暴食来应对压力。碳水按训练日区间吃够，血糖稳定有助于情绪和睡眠；咖啡因按矩阵 G-SLE 口径睡前 8 小时内避免。比赛后休整期不要每天盯体重和体成分，先把进食节奏拉回正常。持续情绪低落、失眠、失去训练兴趣或出现极端体重行为时，转心理或医学评估。',
    sources: [src('kellmann2018'), src('meeusen2013')],
    tags: ['recoveryfood', 'rc-13', 'psychology', 'stress']
  },

  // ---------- 训练课型与阶段营养（TN-01 ~ TN-12） ----------
  {
    id: 'TN-01', cat: 'training', title: '最大力量课：碳水够、蛋白到位、别追泵感',
    body: '最大力量课的能量按矩阵 MX-MAINTAIN-P-POW 执行：维持期蛋白（P）1.6–2.2、碳水（C）4–6 g/kg、能量盈亏 ±350 kcal；减脂期 P 2.0–2.4、C 3–5、缺口 300–400 kcal（见 MX-CUT-P-POW）。蛋白总量按 pro-total，训练后 2 小时内补 25–40 g，其余分到 3–5 餐；训练前 1–3 小时吃 1–2 g/kg 碳水。肌酸每天 3–5 g，咖啡因只在强度日按 3–6 mg/kg、睡前 8 小时避免。最容易踩的坑是追求“泵感”堆高次数和容量，或在减脂期先砍强度、训练后只吃蛋白不吃碳水。',
    sources: [src('issn2025'), src('issn2017'), src('issn_timing2017'), src('issn_creatine2017'), src('acsm2016')],
    tags: ['training', 'strength', 'max-strength']
  },
  {
    id: 'TN-02', cat: 'training', title: '爆发力课：强度不砍，辅助量封顶',
    body: '爆发力课按矩阵 MX-MAINTAIN-P-POW / MX-CUT-P-POW 执行：维持期碳水（C）4–6 g/kg、能量盈亏 ±350 kcal；减脂期 C 3–5、缺口不超过 400 kcal，辅助量砍 20–30% 但不砍强度。蛋白（P）总量 1.6–2.2（减脂 2.0–2.4），训练后 25–40 g，训练前 1–3 小时 1–2 g/kg 碳水。咖啡因按 3–6 mg/kg、赛前 60 分钟使用，先试过且不影响睡眠；肌酸每天 3–5 g 可维持。最常见的坑是疲劳状态下做爆发、用高次数辅助动作代替质量，以及下午补咖啡因后睡不够。',
    sources: [src('issn2025'), src('issn_caffeine2021'), src('issn_creatine2017'), src('acsm2016')],
    tags: ['training', 'power', 'strength']
  },
  {
    id: 'TN-03', cat: 'training', title: '速度课：神经新鲜优先，缺口别加深',
    body: '速度课按矩阵 MX-MAINTAIN-P-SPD / MX-CUT-P-SPD 执行：维持期碳水（C）4–6 g/kg、能量盈亏 ±350 kcal；减脂期 C 3–5，速度日缺口不超过 300 kcal（C04 的封顶模式，即 cap）。训练前 2–3 小时吃 1–2 g/kg 碳水，选低纤维低脂；训练后按常规补 25–40 g 蛋白。咖啡因按需、按 3–6 mg/kg，睡前 8 小时避免；睡眠按 SLE-01 守住 7 小时以上。最容易踩的坑是空腹晨速、前一天大负荷后硬上速度，以及脱水状态下做神经课。',
    sources: [src('issn2025'), src('issn_caffeine2021'), src('acsm2016'), src('walsh2021')],
    tags: ['training', 'speed', 'neural']
  },
  {
    id: 'TN-04', cat: 'training', title: '肌肉耐力课：矩阵已有独立原子 P-MEND，证据仍弱',
    body: '肌肉耐力已有独立原子 P-MEND，但证据仍弱，本条只给定性方向、不给数值。能量按训练日碳水区间吃够（见 carb-training），不额外制造缺口；减脂期只维持现有容量，不新增循环/间歇课；蛋白按全天总量正常分配。训练前留出消化时间吃少量易消化碳水，训练后按常规补蛋白和碳水，不要用“酸胀”判断练到位。最容易踩的坑是把高次数练到力竭、低碳水做高容量，以及用补剂代替主食。',
    sources: [src('cscn6'), src('sport_nutrition4'), src('acsm2016')],
    tags: ['training', 'muscular-endurance', 'weak']
  },
  {
    id: 'TN-05', cat: 'training', title: '有氧耐力课：碳水优先，补液补钠',
    body: '有氧耐力课按矩阵 MX-MAINTAIN-P-END / MX-CUT-P-END 执行：维持期蛋白（P）1.6–2.2、碳水（C）4–7 g/kg、能量盈亏 ±350 kcal；减脂期 P 2.0–2.4、C≥3、缺口不超过 400 kcal，大负荷日不加深缺口（C08）。训练后 2 小时内补 25–40 g 蛋白，碳水按 1.0–1.2 g/kg/h 补；一天两练时两练间隔至少 6 小时。大量出汗按 hyd-replace 补含钠液体，女性拳手长期耐力负荷要查铁状态（见 AS-09/FE-04）。最常见的坑是低碳水做长课、只补白水不补钠，以及在大负荷日继续加深缺口。',
    sources: [src('acsm2016'), src('acsm2007'), src('issn_timing2017'), src('reds2023')],
    tags: ['training', 'endurance', 'aerobic']
  },
  {
    id: 'TN-06', cat: 'training', title: '技战术课：不空腹，低纤维低脂',
    body: '技战术课在矩阵 MX-*-P-SKL 里是弱证据格，宏量为空，本条只给方向、不给克数。不要空腹上技术课，训练前留出消化时间吃少量易消化碳水，具体时点与份量由营养师确认。训练前避免高纤维、高脂和大体积食物；训练中按口渴和出汗补液，大量出汗时补钠。蛋白按全天总量正常分配，课后吃一餐即可；不要用技术课代替恢复，也不要在技术日加深热量缺口。',
    sources: [src('cscn6'), src('sport_nutrition4'), src('acsm2016')],
    tags: ['training', 'technique', 'weak']
  },
  {
    id: 'TN-07', cat: 'training', title: '一日两练：两练间隔与两次补糖',
    body: '一日两练按矩阵 P-END 的时机执行：两练间隔至少 6 小时，第一练后 4 小时内按 1.0–1.2 g/kg/h 补碳水，并加 20–30 g 蛋白。第二练前 1–2 小时吃少量易消化碳水，避免高纤维高脂；两练之间按 hyd-replace 补液补钠。全天蛋白按 1.6–2.2 g/kg 分到 3–5 餐，睡前可加 30–40 g 缓释蛋白，睡眠按 SLE-01 守住。最容易踩的坑是两练挨太近、第二练空腹上、只补蛋白不补糖，以及用咖啡因掩盖睡眠不足。',
    sources: [src('issn_timing2017'), src('acsm2016'), src('walsh2021')],
    tags: ['training', 'two-a-day', 'carb']
  },
  {
    id: 'TN-08', cat: 'training', title: '赛前减量周：减量不是减碳',
    body: '赛前减量周按矩阵 MX-PEAK-* 执行：训练量下降，但能量盈亏为 0（E 0）、碳水（C）保持 3–5 g/kg、蛋白（P）1.6–2.2 g/kg，不要跟着训练量一起砍碳水。微调期只动水、钠、纤维和胃肠内容物（B-PEAK），选低纤维、低脂、小体积食物；快碳不超过 60 g/h，补液按计划走。赛前 24–48 小时才按 carb-fightweek 把碳水提到 8–10 g/kg，减量周本身不做碳水负荷。最容易踩的坑是把减量周当成减碳周、临时试新补剂或新食物，以及用减量周“补课”加练。',
    sources: [src('acsm2016'), src('issn2025'), src('walsh2021')],
    tags: ['training', 'taper', 'peak']
  },
  {
    id: 'TN-09', cat: 'training', title: '维持期叠加：各课型怎么吃，别偷偷减',
    body: '维持期叠加按矩阵 maintain 列执行：力量/爆发日看 MX-MAINTAIN-P-POW，速度日看 MX-MAINTAIN-P-SPD，耐力日看 MX-MAINTAIN-P-END，技术日看 MX-MAINTAIN-P-SKL，控级别看 MX-MAINTAIN-B-HOLD。执行上，力量与爆发日训练前 1–3 小时吃 1–2 g/kg 碳水、训练后 25–40 g 蛋白；耐力日碳水取 4–7 g/kg、两练间隔至少 6 小时；技术日不空腹、只吃少量易消化碳水。蛋白（P）总量 1.6–2.2 g/kg 分到 3–5 餐，控级别时碳水 3–5 g/kg、能量 ±350 kcal、正常三餐。增肌目标只在非赛季且距称重超过 84 天时开，盈余 200–400 kcal；距称重不足 12 周转 B-HOLD 加力量维持。最容易踩的坑是维持期变成“随便吃”或偷偷减，以及增肌期叠太多有氧。',
    sources: [src('issn2017'), src('acsm2016'), src('issn_diets2017')],
    tags: ['training', 'phase', 'maintain']
  },
  {
    id: 'TN-10', cat: 'training', title: '减脂期叠加：力量课后的蛋白与碳水怎么保',
    body: '减脂期叠加按矩阵 cut 列执行：力量课看 MX-CUT-P-POW、保肌看 MX-CUT-P-HYP、耐力课看 MX-CUT-P-END、速度课看 MX-CUT-P-SPD，让步模式以 C01/C04/C08/C26 为准。力量课后那一餐先保证 25–40 g 蛋白，碳水集中在训练前后，全天蛋白（P）2.0–2.4、碳水（C）3–5 g/kg，缺口封顶 400 kcal；力量只维持 1–2 次/周，不加量。大负荷日不加深缺口，训练后按 1.0–1.2 g/kg/h 补糖；速度日缺口不超过 300 kcal；技术日不加深缺口。每 2–3 周安排 1–2 天重新进食日（refeed），碳水为主，体重短期回升看 7 日移动平均。最容易踩的坑是用加练换更大缺口、先砍强度、蛋白吃不够，以及周降超过 1% 还继续压。',
    sources: [src('issn2025'), src('refalo2025'), src('issn_diets2017'), src('acsm2021')],
    tags: ['training', 'phase', 'cut', 'muscle-retention']
  },
  {
    id: 'TN-11', cat: 'training', title: '微调期叠加：只保强度，不做大负荷补碳',
    body: '微调期叠加按矩阵 peak 列执行：所有表现原子只保强度、不加量，能量盈亏为 0，蛋白（P）1.6–2.2、碳水（C）3–5 g/kg；B-CUT、B-HOLD、B-GAIN 在 peak 列都是 N/A，禁止再动热量缺口或增重。力量/爆发日训练前 1–2 小时吃小份碳水；速度日训练前 2–3 小时吃 1–2 g/kg 碳水；耐力日按补液计划执行，不新增负荷；技术日选低纤维、低体积食物。微调期只动水、钠、纤维和胃肠内容物（B-PEAK），快碳不超过 60 g/h，补水按 HYD-05 的执行率走。减量周不要加大负荷“补课”，也不要在赛前一周临时试新食物或新补剂（C14/C15/C25）。',
    sources: [src('acsm2021'), src('issn2025'), src('acsm2007')],
    tags: ['training', 'phase', 'peak']
  },
  {
    id: 'TN-12', cat: 'training', title: '恢复期叠加：先补液补糖，掉肌问题归 rehab',
    body: '恢复期叠加按矩阵 recover 列执行：P-POW、P-SPD、P-HYP、P-END、P-SKL 以及 B-CUT、B-HOLD、B-GAIN、B-PEAK 全部 N/A，唯一合法的是 B-REFUEL（C16/C17 先恢复再谈增肌或控重）。执行顺序是先补液再补糖：含钠液体按每流失 1 kg 补 1.25–1.5 L，糖原耗尽按 8–12 g/kg、轻度限制按 4–7 g/kg 两段独立执行，不取中间值；蛋白 20–40 g 与碳水同餐，快碳不超过 60 g/h，纤维逐步加回。称重后 24 小时内不继续减重，目标体重回升至少 50%（REC-04）；恢复窗只有 12–24 小时，不做减脂、控重或增肌决策。真正的停训掉肌属于 rehab，按 RH-01、RH-03、RH-04 处理；恢复期保证蛋白和能量、不制造缺口，就是避免掉肌的执行落点。',
    sources: [src('issn2025'), src('acsm2007'), src('acsm2016'), src('cscn6')],
    tags: ['training', 'phase', 'recover', 'refuel']
  }
];

module.exports = { version: 9, categories: CATEGORIES, items: ITEMS };
