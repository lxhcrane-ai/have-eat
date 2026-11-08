// 规则登记表：每条规则 = 判定逻辑 + 阈值 + 一级来源锚点 + 适用阶段 + 是否需要人工跟进。
// 设计原则：
// 1) ruleId 是稳定编号，规则文案可以改、ID 不改，历史跟进项与统计才能连续。
// 2) 每条规则至少 1 个一级来源（立场声明 / 系统综述 / 教科书 / 行业标准），anchor 具体到章节或结论句。
// 3) 数值区间有冲突时（例如本项目 cut 期蛋白 2.0–2.4 g/kg 与 ISSN 2025 的 1.2–2.0 g/kg 下限不一致），
//    不改代码先标 reviewStatus='needs_review'，把冲突写进 notes，交给营养师复核。
// 4) 本文件是纯数据，小程序端与云函数端共用（scripts/sync-shared.sh 负责同步）。

const SOURCE_TYPES = [
  { id: 'position_stand', name: '立场声明' },
  { id: 'consensus', name: '专家共识' },
  { id: 'systematic_review', name: '系统综述/元分析' },
  { id: 'narrative_review', name: '叙述性综述' },
  { id: 'textbook', name: '教科书' },
  { id: 'industry_standard', name: '行业标准' }
];

const REVIEW_STATUS = [
  { id: 'active', name: '有效', tone: 'ok' },
  { id: 'needs_review', name: '待复核', tone: 'amber' },
  { id: 'deprecated', name: '已废止', tone: 'red' }
];

// 公用来源片段，避免同一条文献在 8 条规则里各写一遍
const SRC = {
  issn2025: {
    citation: 'Ricci AA, Evans C, Stull C, Peacock CA, French DN, Stout JR, Fukuda DH, Galpin AJ, Tartar J, Johnson S, Kreider RB, Kerksick CM. International Society of Sports Nutrition position stand: nutrition and weight cut strategies for mixed martial arts and other combat sports. J Int Soc Sports Nutr. 2025;22(1):2467909.',
    sourceType: 'position_stand', year: 2025,
    doi: '10.1080/15502783.2025.2467909',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11894756/'
  },
  issn2017: {
    citation: 'Jäger R, Kerksick CM, Campbell BI, Cribb PJ, Wells SD, Skwiat TM, et al. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
    sourceType: 'position_stand', year: 2017,
    doi: '10.1186/s12970-017-0177-8',
    url: 'https://doi.org/10.1186/s12970-017-0177-8'
  },
  acsm2007: {
    citation: 'Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS; American College of Sports Medicine. Exercise and fluid replacement: ACSM position stand. Med Sci Sports Exerc. 2007;39(2):377-390.',
    sourceType: 'position_stand', year: 2007,
    doi: '10.1249/mss.0b013e31802ca597',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17277604/'
  },
  acsm2016: {
    citation: 'Thomas DT, Erdman KA, Burke LM. Nutrition and athletic performance: position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine. Med Sci Sports Exerc. 2016;48(3):543-568.',
    sourceType: 'position_stand', year: 2016,
    doi: '10.1249/MSS.0000000000000852',
    url: 'https://doi.org/10.1249/MSS.0000000000000852'
  },
  refalo2025: {
    citation: 'Refalo MC, Trexler ET, Helms ER, et al. Effect of dietary protein on fat-free mass in energy restricted, resistance-trained individuals: an updated systematic review with meta-regression. Strength Cond J. 2025 (published online 22 Jan 2025).',
    sourceType: 'systematic_review', year: 2025,
    doi: '10.1519/SSC.0000000000000888',
    url: 'https://doi.org/10.1519/ssc.0000000000000888'
  },
  walsh2021: {
    citation: 'Walsh NP, Halson SL, Sargent C, Roach GD, Nédélec M, Gupta L, et al. Sleep and the athlete: narrative review and 2021 expert consensus recommendations. Br J Sports Med. 2021;55(7):356-368.',
    sourceType: 'consensus', year: 2021,
    doi: '10.1136/bjsports-2020-102025',
    url: 'https://bjsm.bmj.com/content/55/7/356'
  },
  meeusen2013: {
    citation: 'Meeusen R, Duclos M, Foster C, Fry A, Gleeson M, Nieman D, et al. Prevention, diagnosis and treatment of the overtraining syndrome: joint consensus statement of the European College of Sport Science and the American College of Sports Medicine. Med Sci Sports Exerc. 2013;45(1):186-205.',
    sourceType: 'consensus', year: 2013,
    doi: '10.1249/MSS.0b013e318279a10a',
    url: 'https://doi.org/10.1249/MSS.0b013e318279a10a'
  },
  buchheit2014: {
    citation: 'Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol. 2014;5:73.',
    sourceType: 'narrative_review', year: 2014,
    doi: '10.3389/fphys.2014.00073',
    url: 'https://doi.org/10.3389/fphys.2014.00073'
  },
  cheung2003: {
    citation: 'Cheung K, Hume PA, Maxwell L. Delayed onset muscle soreness: treatment strategies and performance factors. Sports Med. 2003;33(2):145-164.',
    sourceType: 'narrative_review', year: 2003,
    doi: '10.2165/00007256-200333020-00005',
    url: 'https://doi.org/10.2165/00007256-200333020-00005'
  },
  reds2023: {
    citation: 'Mountjoy M, Ackerman KE, Bailey DM, Burke LM, Constantini N, Hackney AC, et al. 2023 International Olympic Committee’s (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs). Br J Sports Med. 2023;57(17):1073-1097.',
    sourceType: 'consensus', year: 2023,
    doi: '10.1136/bjsports-2023-106860',
    url: 'https://bjsm.bmj.com/content/57/17/1073'
  },
  ioc2018: {
    citation: 'Maughan RJ, Burke LM, Dvorak J, Larson-Meyer DE, Peeling P, Phillips SM, et al. IOC consensus statement: dietary supplements and the high-performance athlete. Br J Sports Med. 2018;52(7):439-455.',
    sourceType: 'consensus', year: 2018,
    doi: '10.1136/bjsports-2018-099027',
    url: 'https://bjsm.bmj.com/content/52/7/439'
  }
};

// 把 anchor 补进公用来源（同一条文献在不同规则里锚点不同）
function withAnchor(src, anchor) {
  return Object.assign({}, src, { anchor: anchor });
}

const RULES = [
  {
    ruleId: 'HYD-01',
    name: '训练脱水百分比',
    logicSummary: '训练前体重 − 训练后体重，除以训练前体重得出脱水百分比；≥2% 提示，≥3% 红灯。',
    thresholds: 'pct ≥ 2% → amber；pct ≥ 3% → red；本规则只在 maintain / cut 生效',
    sources: [
      withAnchor(SRC.acsm2007, 'Position Stand 正文“Dehydration and performance”段：体重丢失 ≥2% 即损害有氧与无氧表现，>3–4% 时热病风险上升'),
      withAnchor(SRC.acsm2016, 'Section “Fluid”: 用训练前后体重差估算出汗量，按 1.25–1.5 L/kg 补液')
    ],
    applicablePhases: ['maintain', 'cut'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['hyd-2pct', 'hyd-replace'],
    notes: '方法学警告：训练前后体重差包含糖原与底物氧化，不等同于净失水；单次测量受称重条件影响，必须带 context（pre_train/post_train）才可比。peak 期不启用本规则——赛前水盐操作会让这个数值必然异常，报警会淹没真正该看的执行率（见 HYD-05）。',
    metric: 'hydration'
  },
  {
    ruleId: 'HYD-02',
    name: '补液量（按失重折算）',
    logicSummary: '按每丢失 1kg 体重补 1.25–1.5L 含钠液体，结合已记录饮水量给出还差多少。',
    thresholds: 'needMl = lossKg × 1250；remainingMl = max(0, needMl − 已记录饮水)',
    sources: [
      withAnchor(SRC.acsm2007, 'Position Stand 正文“Fluid replacement”段：每丢失 1 kg 体重补充约 1.25–1.5 L 液体，含钠有助于维持血浆容量')
    ],
    applicablePhases: ['maintain', 'cut'],
    requiresHumanFollowUp: false,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['hyd-replace', 'hyd-sodium'],
    notes: '这是建议文案不是告警，不单独推给营养师；只有 HYD-01 触发时才把补液量一起展示。'
  },
  {
    ruleId: 'HYD-03',
    name: '晨尿颜色',
    logicSummary: '晨尿颜色 ≥5/8 提示夜间轻度脱水。',
    thresholds: 'urineColor ≥ 5 → amber；不参与评分权重',
    sources: [
      withAnchor(SRC.acsm2007, 'Position Stand 正文“Hydration assessment”段：尿色与尿比重可作为简易水合指标')
    ],
    applicablePhases: ['maintain', 'cut', 'peak'],
    requiresHumanFollowUp: false,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['hyd-urine'],
    notes: '方法学警告：单次尿样受饮水时间、维生素 B 族、甜菜等干扰，不应单独用于判定水合状态，只能作为趋势提示。峰值期它比脱水百分比更可靠，因为不受赛前水盐操作影响。'
  },
  {
    ruleId: 'HYD-04',
    name: '称重后补液（恢复期）',
    logicSummary: '称重后按口服补液盐 1–1.5 L/h 起步，2 小时内补液量不足或未用含钠液体则提示。',
    thresholds: 'postWeighIn.fluidMl ≥ 1000（前 2h）且含钠 → ok；<1000 → amber；<500 → red',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 12 条：称重后应立即优先使用口服补液溶液（ORS），1–1.5 L/h，钠 50–90 mmol/L'),
      withAnchor(SRC.acsm2007, '“Fluid replacement”段：含钠液体比纯水更快恢复血浆容量')
    ],
    applicablePhases: ['recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['wc-weighin-recovery', 'hyd-sodium'],
    notes: '恢复期主告警。纯水过量会稀释血钠，文案里必须带“含钠”。'
  },
  {
    ruleId: 'HYD-05',
    name: '微调期补液计划执行率',
    logicSummary: '微调期不看脱水百分比，只看既定补液/控水计划的执行率：实际饮水 ÷ 计划饮水。',
    thresholds: '执行率 ≥90% → ok；80–90% → info；<80% → amber；未填计划或实际 → amber（数据不足）',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 8–10 条：赛前周通过钠限制与饮水负荷诱导多尿，脱水策略需在监督下按计划执行'),
      withAnchor(SRC.acsm2016, 'Section “Fluid”: 个体化补液计划与执行监测优于事后按体重差反推')
    ],
    applicablePhases: ['peak'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['wc-dehydration-risk', 'hyd-replace'],
    notes: 'peak 期替代 HYD-01 成为水合主指标。未填计划时给“数据不足”而不是判合格——这是本规则与旧引擎最关键的差别。'
  },
  {
    ruleId: 'PRO-01',
    name: '蛋白总量',
    logicSummary: '按当前体重计算每日蛋白区间，与结构化餐食汇总比较；<60% 目标为红灯，80–99% 为提示。',
    thresholds: 'cut 2.0–2.4 g/kg；maintain/peak 1.6–2.2 g/kg；recover 1.6–2.0 g/kg',
    sources: [
      withAnchor(SRC.issn2017, 'Position Stand 建议段：日常 1.4–2.0 g/kg/天；能量限制期减脂保肌可到 2.3–3.1 g/kg FFM/天'),
      withAnchor(SRC.refalo2025, '摘要与结论：能量限制 + 抗阻训练人群中，蛋白摄入（以 g/kg FFM 表达）与 FFM 变化呈剂量-反应关系；能量缺口越大 FFM 丢失越多，蛋白的保肌作用被缺口部分抵消'),
      withAnchor(SRC.issn2025, 'Position Statement 第 6 条：纵向减重期蛋白 1.2–2.0 g/kg（下限），碳水 3.0–4.0 g/kg，脂肪 0.5–1.0 g/kg')
    ],
    applicablePhases: ['maintain', 'cut', 'peak', 'recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'needs_review',
    lastReviewedAt: '2026-10-25',
    kbIds: ['pro-total', 'pro-quality'],
    notes: '阈值冲突（待复核）：本项目 cut 期用 2.0–2.4 g/kg BM，ISSN 2025 给出的下限是 1.2–2.0 g/kg、ISSN 2017 的 2.3–3.1 是 g/kg FFM 而非 BM。两者按 15% 体脂换算大致相容，但同一拳手体重口径不同结论会差 20–30g。建议营养师决定：继续用 BM 上限偏保守，还是改成 g/kg FFM 口径（需要体脂数据）。'
  },
  {
    ruleId: 'PRO-02',
    name: '单餐蛋白分配',
    logicSummary: '单餐蛋白 <20g 提示把蛋白分散到 3–5 餐。',
    thresholds: '平均每餐蛋白 < 20 g → info；不参与红灯',
    sources: [
      withAnchor(SRC.issn2017, 'Position Stand：每餐 0.25 g/kg 体重或 20–40 g 优质蛋白，每 3–4 小时一次，全天 3–4 次以上')
    ],
    applicablePhases: ['maintain', 'cut'],
    requiresHumanFollowUp: false,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['pro-spread', 'pro-timing'],
    notes: 'peak 期不启用：赛前胃肠耐受优先，不为了分配而加餐。'
  },
  {
    ruleId: 'ENE-01',
    name: '能量盈余 / 缺口',
    logicSummary: '摄入热量减估算消耗：减脂期盈余 >200 kcal 提示，缺口 >900 kcal 红灯；维持期 ±350 kcal 外提示。',
    thresholds: 'cut: bal > 200 amber，bal < −900 red；maintain: |bal| ≤ 350 ok，否则 amber',
    sources: [
      withAnchor(SRC.acsm2016, 'Section “Energy”: 减重期建议 300–600 kcal/天缺口以保去脂体重'),
      withAnchor(SRC.reds2023, 'Consensus 正文“Energy availability”段：长期低于 30 kcal/kg FFM/天进入低能量可用性，损害骨、内分泌与表现')
    ],
    applicablePhases: ['maintain', 'cut'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['carb-training', 'carb-energy-availability'],
    notes: '消耗是估算（Mifflin-St Jeor × 活动系数），文案里必须标“粗估”；没有身高/年龄/性别时用体重 ×33/×40，误差更大。peak 期禁用：微调期不动热量缺口是阶段定义本身。'
  },
  {
    ruleId: 'PHASE-01',
    name: '减重速率上限',
    logicSummary: '晨重 7 日线性回归斜率换算成每周降幅百分比；>1%/周红灯，<0.3%/周提示偏慢。',
    thresholds: 'pctPerWeek > 1 → red；< 0.3 且 cut → info；r > +0.5 kg/周 → amber（方向相反）',
    sources: [
      withAnchor(SRC.acsm2016, 'Section “Weight management”: 长期减重建议 0.5–1.0% 体重/周，过快会增加去脂体重损失'),
      withAnchor(SRC.issn2025, 'Position Statement 第 7 条：赛前 72/48/24 小时可接受的体重丢失分别为 6.7%/5.7%/4.4%——这是急性脱水窗口，不能当作长期速率使用'),
      withAnchor(SRC.refalo2025, '结论段：能量缺口越大，即使抗阻训练 FFM 丢失也越多')
    ],
    applicablePhases: ['cut'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['wc-rate', 'wc-refeed'],
    notes: '方法学警告：少于 4 个晨重点不计算斜率（返回 null），不要用单日波动判断。peak/recover 期禁用：这两周的体重变化主要来自水、钠、糖原与胃肠内容物，用减重速率判断会系统性误报。'
  },
  {
    ruleId: 'PHASE-02',
    name: '维持期体重偏离',
    logicSummary: '维持期晨重相对参赛级别偏离超出设定带宽时提示，用于发现非赛季悄悄长体重。',
    thresholds: '目标体重 +3–5% 为项目设定带宽；超出上限 → info',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 3 条：非赛季/一般准备期应把体重维持在参赛级别要求之上 12–15%')
    ],
    applicablePhases: ['maintain'],
    requiresHumanFollowUp: false,
    reviewStatus: 'needs_review',
    lastReviewedAt: '2026-10-25',
    kbIds: ['wc-phases'],
    notes: '阈值冲突（待复核）：项目原设定 +3–5%，ISSN 2025 第 3 条给的是 +12–15%（针对 MMA 等需大幅减重的项目）。拳击与 MMA 的赛前减重幅度不同，需营养师按项目定档；未定档前本规则只出 info，不做红灯。'
  },
  {
    ruleId: 'SLE-01',
    name: '睡眠时长',
    logicSummary: '睡眠 <6.5h 提示，<6h 红灯；微调期把阈值收紧到 <7h。',
    thresholds: '目标 7–9h；<6.5h amber；<6h red；peak 期 <7h amber',
    sources: [
      withAnchor(SRC.walsh2021, 'Expert consensus recommendations 段：运动员目标睡眠 7–9 h/晚，habitual short sleep（<7h）与表现、免疫、情绪下降相关；赛前周应固定作息而非补觉'),
      withAnchor(SRC.meeusen2013, 'Consensus 正文“Sleep”：睡眠不足是恢复不足与过度训练综合征的核心可干预因素')
    ],
    applicablePhases: ['maintain', 'cut', 'peak', 'recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['rec-sleep', 'rec-sleep-hygiene'],
    notes: '只记录时长不记录入睡时间，无法判断睡眠时相延迟；后续可加 bedtime/wakeTime。'
  },
  {
    ruleId: 'REC-01',
    name: '称重后碳水与进食节奏',
    logicSummary: '恢复期按体重与糖原消耗程度给出称重后 0–4h 的碳水目标与进食节奏，未达下限提示。',
    thresholds: '糖原明显耗尽 → 8–12 g/kg；轻度限制 → 4–7 g/kg；进食间隔 ≤60 g/h 快碳；纤维限制到最低',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 13–14 条：称重后先 ORS 再快碳（≤60 g/h）；糖原耗尽者碳水 8–12 g/kg，轻度限制者 4–7 g/kg，同时限制纤维避免胃肠不适'),
      withAnchor(SRC.issn2025, 'Position Statement 第 11、15 条：称重后快速回升体重/体液是为了比赛表现，方案需在监督下执行'),
      withAnchor(SRC.acsm2016, 'Section “Nutrition before, during and after competition”: 赛后 0–4h 补糖与补液优先')
    ],
    applicablePhases: ['recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['wc-weighin-recovery', 'carb-recovery'],
    notes: '原文第 15 条写作“regain ≥10% of body mass”，字面值对身体质量不成立，疑为“已丢失体重”的比例，引用时以原文为准并人工核对；本规则只断言“回升不足则提示”，不写死百分比。'
  },
  {
    ruleId: 'REC-02',
    name: '酸痛与高强度课冲突',
    logicSummary: '任一部位酸痛 ≥7 且次日计划为速度/爆发/最大力量 → 红灯并建议改课；≥8 单独红灯。',
    thresholds: 'sorenessMax ≥ 8 → red；≥7 → amber；与 speed/power/max_strength 同现 → red',
    sources: [
      withAnchor(SRC.cheung2003, '正文“Performance factors”段：DOMS 在离心运动后 24–72h 达峰，伴随力量与爆发力下降、关节位置觉变差'),
      withAnchor(SRC.meeusen2013, 'Consensus：持续的肌肉酸痛合并表现下降应被视为恢复不足信号，需调整负荷')
    ],
    applicablePhases: ['maintain', 'cut', 'peak'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['rec-soreness'],
    notes: '酸痛是主观量表，不能区分 DOMS 与损伤；≥8 且局限单侧关节周围时应建议就医而不是只改课。recover 期禁用（称重后酸痛多来自脱水与比赛，不作为训练决策依据）。'
  },
  {
    ruleId: 'REC-03',
    name: '晨脉高于基线',
    logicSummary: '晨脉比个人基线高 ≥5 次/分提示恢复不足、脱水或感染前兆；连续 2 天或 ≥8 次/分升级为人工介入。',
    thresholds: 'delta ≥ 5 → amber；delta ≥ 8 或连续 2 天 → 升级',
    sources: [
      withAnchor(SRC.buchheit2014, '正文“Resting HR and HRV”: 静息心率/HRV 必须对照个体滚动基线解释，绝对值无意义；持续偏离提示自主神经恢复不足'),
      withAnchor(SRC.meeusen2013, 'Consensus：静息心率持续升高是过度训练综合征的辅助诊断指标之一')
    ],
    applicablePhases: ['maintain', 'cut', 'peak'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['rec-hrv', 'rec-soreness'],
    notes: '需要 profile.restingHrBaseline 才生效，没有基线时不出结论（不做人群默认值推断）。'
  },
  {
    ruleId: 'REC-04',
    name: '称重后体重回升不足',
    logicSummary: '恢复期 24h 内体重回升幅度低于已失体重的一半，或主观恢复感 ≤2/5，提示补液补糖不足。',
    thresholds: 'regainPct < 50% → amber；<30% 或主观 ≤2 → red',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 15 条：称重后补液/补能不足会持续损害比赛表现'),
      withAnchor(SRC.acsm2007, '“Fluid replacement”段：补液量应覆盖失重的 125–150%')
    ],
    applicablePhases: ['recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['wc-weighin-recovery', 'hyd-replace'],
    notes: '需要 officialWeighInKg 与恢复期晨重两个点；缺一个就只给“数据不足”。'
  },
  {
    ruleId: 'GI-01',
    name: '胃肠症状',
    logicSummary: '微调/恢复期出现恶心、腹胀、痉挛或食欲显著下降任一 ≥2/4，提示调整食物体积、纤维与进食节奏。',
    thresholds: '任一症状 ≥2（0–4 量表）→ amber；≥3 或合并呕吐 → red',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 13 条：称重后应限制纤维以避免胃肠不适；快碳按可耐受速率 ≤60 g/h 递增'),
      withAnchor(SRC.acsm2016, 'Section “Gastrointestinal distress”: 赛前减少高纤维、高脂肪与高渗食物可降低 GI 症状')
    ],
    applicablePhases: ['peak', 'recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['basic-fiber', 'carb-recovery'],
    notes: '主观量表，需要连续记录才有意义；单日轻微腹胀不构成跟进项，规则里只在 ≥2 时出 amber。'
  },
  {
    ruleId: 'SUP-01',
    name: '补剂计划执行',
    logicSummary: '微调期检查既定补剂（肌酸、咖啡因、β-丙氨酸）是否按计划执行，未执行只提示不升级。',
    thresholds: '计划内补剂任一项未执行 → info；咖啡因赛前 3–6 mg/kg 且 60min 前',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 4 条：肌酸、β-丙氨酸、HMB、咖啡因在准备期、比赛与赛后恢复中有证据支持'),
      withAnchor(SRC.ioc2018, 'Consensus 正文：只有证据等级较高的少数补剂值得使用，剂量与 timing 个体化，需第三方检测认证')
    ],
    applicablePhases: ['cut', 'peak'],
    requiresHumanFollowUp: false,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['sup-creatine', 'sup-caffeine', 'sup-warning'],
    notes: '补剂执行不是营养问题而是依从性问题，交给人看不如直接提醒拳王；因此 requiresHumanFollowUp=false。'
  },
  {
    ruleId: 'LOG-01',
    name: '记录不足',
    logicSummary: '结构化餐食 <2 餐，或该阶段必填字段缺失，判定“数据不足”，不给达标结论。',
    thresholds: 'meals.structured < 2 或 missingRequired 非空 → amber',
    sources: [
      withAnchor(SRC.acsm2016, 'Section “Assessment”: 膳食评估依赖完整记录，记录不全时不应据此给出能量/蛋白达标判断')
    ],
    applicablePhases: ['maintain', 'cut', 'peak', 'recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-10-25',
    kbIds: ['basic-logging', 'basic-photo'],
    notes: '阶段化之后这条变重要了：peak 期必填字段（补液计划、胃肠症状）缺失时，引擎只能说“不知道”，不能说“正常”。'
  },
  {
    ruleId: 'GOAL-01',
    name: '目标与阶段合法性',
    logicSummary: '营养师设定的目标在当前阶段是否可执行；矩阵 N/A 或附加条件不满足时给出分级提示，不自动改阶段、不自动删目标。',
    thresholds: 'B-GAIN 在 cut、B-CUT 在 maintain/peak/recover、B-HOLD 在 cut 且 gapPct>1.5 → red；其余 N/A 与附加条件未满足 → amber；只提示“改目标或改阶段”',
    sources: [
      withAnchor(SRC.issn2025, 'Position Statement 第 3–5 条：减重、维持与赛前微调是不同能量方向的时间窗，不应在同一窗口同时执行'),
      withAnchor(SRC.acsm2016, 'Section “Energy balance”: 能量盈余与缺口方向相反，不能在同一时间窗并行')
    ],
    applicablePhases: ['maintain', 'cut', 'peak', 'recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-11-08',
    kbIds: ['wc-phases', 'wc-rate'],
    notes: '只提示，不自动改阶段；给出两个选项：改目标或改阶段。setGoals 已按当前阶段拒绝不合法目标，因此实际触发场景主要是“目标设定后阶段被 setPhase 改掉”。'
  },
  {
    ruleId: 'GOAL-02',
    name: '目标执行冲突',
    logicSummary: '两个目标原子在同一日/相邻日产生不可同时执行的负荷或时机冲突，且现有规则未覆盖时提示重排或降量。',
    thresholds: '同日两个计入名额的高强度目标 → amber；三个计入名额目标且距称重<14 天 → red；仅相邻日 → info；G-IMM 不计入目标数',
    sources: [
      withAnchor(SRC.acsm2016, 'Section “Training day nutrition”: 训练前后营养安排需与当日负荷量和训练类型匹配'),
      withAnchor(SRC.meeusen2013, 'Consensus 正文：负荷与恢复不足的累积会放大过度训练风险，需在同一时间窗内控制总负荷')
    ],
    applicablePhases: ['maintain', 'cut', 'peak', 'recover'],
    requiresHumanFollowUp: true,
    reviewStatus: 'active',
    lastReviewedAt: '2026-11-08',
    kbIds: ['rec-load', 'rec-soreness', 'carb-training'],
    notes: '只依据 log.training + log.nextPlan + profile.goals；不判体重速率、蛋白、睡眠、脱水，这些有 owner 规则。'
  }
];

const RULE_MAP = {};
RULES.forEach(function (r) { RULE_MAP[r.ruleId] = r; });

function getRule(ruleId) { return RULE_MAP[ruleId] || null; }
function listRules() { return RULES; }
function rulesForPhase(phase, phaseProfiles) {
  const p = phaseProfiles && phaseProfiles[phase];
  const ids = (p && p.activeRuleIds) || [];
  return RULES.filter(function (r) { return ids.indexOf(r.ruleId) >= 0; });
}
function sourceTypeName(id) {
  const t = SOURCE_TYPES.filter(function (x) { return x.id === id; })[0];
  return t ? t.name : id;
}
function reviewStatusMeta(id) {
  const t = REVIEW_STATUS.filter(function (x) { return x.id === id; })[0];
  return t || { id: 'active', name: '有效', tone: 'ok' };
}

module.exports = {
  RULES: RULES,
  RULE_MAP: RULE_MAP,
  SOURCE_TYPES: SOURCE_TYPES,
  REVIEW_STATUS: REVIEW_STATUS,
  getRule: getRule,
  listRules: listRules,
  rulesForPhase: rulesForPhase,
  sourceTypeName: sourceTypeName,
  reviewStatusMeta: reviewStatusMeta
};
