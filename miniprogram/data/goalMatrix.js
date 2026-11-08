// 复合目标矩阵 · 纯数据层
// 唯一口径：docs/goal-matrix.md（G0 契约冻结）、docs/schema.md
// 本文件只放数据，不放判定逻辑；合法性裁决、冲突消解、目标计划构建由 utils/goals.js 等纯函数层完成。

const GOAL_MATRIX_VERSION = 'v1.1';
const PHASES = ['maintain', 'cut', 'peak', 'recover'];

// ---------- 宏量区间构造（仅数据整形） ----------
function range(min, max, unit) {
  return { min: min, max: max, unit: unit };
}
function macros(p, c, f, e) {
  return {
    protein: p ? range(p[0], p[1], 'g/kg') : null,
    carb: c ? range(c[0], c[1], 'g/kg') : null,
    fat: f ? range(f[0], f[1], 'g/kg') : null,
    energyBalance: e ? range(e[0], e[1], 'kcal') : null
  };
}

// ---------- 格构造（只填默认值，不做业务判断） ----------
function cell(phase, atomId, data) {
  const base = {
    cellId: 'MX-' + phase.toUpperCase() + '-' + atomId,
    legal: true,
    legality: 'legal', // legal | conditional | monitor | guardrail | veto | illegal
    condition: null,
    illegalReason: null,
    goalRule: null,
    goal01Level: null, // red | amber | null
    strategy: '',
    macros: null,
    targets: null,
    macroNote: null,
    timing: [],
    extraFields: [],
    monitorRules: [],
    monitorKbIds: [],
    monitorFields: [],
    ownerSuppressed: false,
    evidenceStatus: 'moderate', // strong | moderate | weak | mixed
    anchors: [],
    reviewStatus: 'active' // active | needs_review
  };
  Object.assign(base, data);
  return base;
}

// ---------- 1. 目标原子（16 个） ----------
const ATOMS = [
  {
    id: 'P-POW',
    name: '爆发/最大力量',
    dimension: 'performance',
    dimensionLabel: '表现',
    confirmSignals: [
      'nextPlan.type ∈ {power, max_strength}',
      'sessionType=strength 且 rpe≥8、durationMin≤90',
      'nextPlan.intensity=high'
    ],
    counterSignals: ['酸痛≥7', '睡眠<6h', '脱水≥3%', '次日速度课冲突'],
    legalPhases: ['maintain', 'cut', 'peak'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'P-SPD',
    name: '速度/神经',
    dimension: 'performance',
    dimensionLabel: '表现',
    confirmSignals: ['nextPlan.type=speed', '短时长、rpe≥7', '晨脉接近基线'],
    counterSignals: ['酸痛≥7', '睡眠<7h', '晨脉+5', '前一日大负荷'],
    legalPhases: ['maintain', 'cut', 'peak'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'moderate'
  },
  {
    id: 'P-HYP',
    name: '肌肥大',
    dimension: 'performance',
    dimensionLabel: '表现',
    confirmSignals: [
      '近 7 日 sessionType=strength ≥2 次、rpe 6–8',
      '体重斜率 +0.2~+0.5 kg/周',
      '能量小幅盈余'
    ],
    counterSignals: ['减重速率>1%/周', '睡眠<6.5h', '胃肠症状', '距称重<12 周'],
    legalPhases: ['maintain', 'cut'],
    conditionalPhases: { cut: '仅保肌：不加量，力量维持 1–2 次/周' },
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'moderate'
  },
  {
    id: 'P-END',
    name: '耐力/体能',
    dimension: 'performance',
    dimensionLabel: '表现',
    confirmSignals: [
      'sessionType ∈ {cardio, sparring}',
      'nextPlan.type=conditioning',
      'durationMin≥60；rounds≥6；sRPE 高'
    ],
    counterSignals: ['晨脉+5', '睡眠<6.5h', '酸痛≥7', '周负荷陡增'],
    legalPhases: ['maintain', 'cut', 'peak'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'P-MEND',
    name: '肌肉耐力（力量耐力）',
    dimension: 'performance',
    dimensionLabel: '表现',
    confirmSignals: [
      'sessionType=strength 且 durationMin≥45、rpe 6–8',
      'training.content 含“循环 / 间歇 / 高次数 / 短间歇 / 沙袋连续输出 / EMOM”',
      'nextPlan.type=conditioning 且为力量循环'
    ],
    counterSignals: ['酸痛≥7', '睡眠<6.5h', '脱水≥3%', '周降>1%', '晨脉+5'],
    legalPhases: ['maintain', 'cut'],
    conditionalPhases: { cut: '仅维持现有容量，不新增循环/间歇课；缺口≤400' },
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'weak'
  },
  {
    id: 'P-SKL',
    name: '技术/战术',
    dimension: 'performance',
    dimensionLabel: '表现',
    confirmSignals: ['sessionType=technique', 'rpe≤7', 'nextPlan.type=technique'],
    counterSignals: ['空腹技术课', '睡眠<6h', '脱水≥2%'],
    legalPhases: ['maintain', 'cut', 'peak'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'weak'
  },
  {
    id: 'B-CUT',
    name: '减脂',
    dimension: 'body',
    dimensionLabel: '身体',
    confirmSignals: ['phase=cut', '周斜率 -0.3~-1%', '缺口 300–600', 'gapPct>1.5'],
    counterSignals: ['缺口>900', 'EA<30', '睡眠<6.5h', '周斜率>1%'],
    legalPhases: ['cut'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'B-HOLD',
    name: '控级别/维持',
    dimension: 'body',
    dimensionLabel: '身体',
    confirmSignals: ['phase=maintain 或 cut 且 gapPct≤1.5', '周斜率 ±0.2', 'driftPct≤maintainBandPct'],
    counterSignals: ['driftPct>band', '连续两周单向漂移'],
    legalPhases: ['maintain', 'cut'],
    conditionalPhases: { cut: '仅 gapPct≤1.5%' },
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'moderate'
  },
  {
    id: 'B-GAIN',
    name: '增肌/增重',
    dimension: 'body',
    dimensionLabel: '身体',
    confirmSignals: ['phase=maintain', 'weighInDate 距今>84 天或无', '周斜率 +0.2~+0.5', '盈余 200–400'],
    counterSignals: ['距称重<12 周', 'PHASE-02 漂移', '睡眠/胃肠红灯'],
    legalPhases: ['maintain'],
    conditionalPhases: { maintain: '非赛季且距称重>84 天' },
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'moderate'
  },
  {
    id: 'B-PEAK',
    name: '赛前水盐微调',
    dimension: 'body',
    dimensionLabel: '身体',
    confirmSignals: ['phase=peak', 'daysToWeigh≤14', 'hydrationPlan 有计划'],
    counterSignals: ['任何热量缺口调整', '赛前<1 周临时加新方案'],
    legalPhases: ['peak'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'B-REFUEL',
    name: '称重后恢复',
    dimension: 'body',
    dimensionLabel: '身体',
    confirmSignals: ['phase=recover', 'postWeighIn 有补液/碳水记录'],
    counterSignals: ['称重后 24h 内继续减重'],
    legalPhases: ['recover'],
    conditionalPhases: {},
    guardrail: false,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'G-SLE',
    name: '睡眠/恢复（含精力）',
    dimension: 'guardrail',
    dimensionLabel: '护栏',
    confirmSignals: ['sleep.hours<6.5（peak<7）', 'quality≤2', '晨脉+5', '酸痛≥7', 'mood.fatigue≥4'],
    counterSignals: ['睡眠 7–9h', '晨脉在基线内'],
    legalPhases: ['maintain', 'cut', 'peak', 'recover'],
    conditionalPhases: {},
    guardrail: true,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'G-GI',
    name: '胃肠耐受',
    dimension: 'guardrail',
    dimensionLabel: '护栏',
    confirmSignals: ['giSymptoms 任一≥2 或呕吐', '赛前高纤维/高脂'],
    counterSignals: ['无症状', '耐受良好'],
    legalPhases: ['maintain', 'cut', 'peak', 'recover'],
    conditionalPhases: {},
    guardrail: true,
    selectable: true,
    occupiesSlot: true,
    monitorOnlyPhases: ['maintain', 'cut'],
    evidenceDefault: 'moderate'
  },
  {
    id: 'G-EA',
    name: '能量可用性',
    dimension: 'guardrail',
    dimensionLabel: '护栏',
    confirmSignals: ['bodyFatPct 已知 + 摄入/消耗 + FFM', 'EA<30 kcal/kg FFM'],
    counterSignals: ['数据不足时不许判红，只标“无法判断”'],
    legalPhases: ['maintain', 'cut', 'peak', 'recover'],
    conditionalPhases: {},
    guardrail: true,
    selectable: true,
    occupiesSlot: true,
    evidenceDefault: 'strong'
  },
  {
    id: 'G-IMM',
    name: '免疫',
    dimension: 'guardrail',
    dimensionLabel: '护栏',
    confirmSignals: ['health.illness≥1', '睡眠<6h', 'sRPE 周环比>20%', '缺口>900'],
    counterSignals: ['无感染症状'],
    legalPhases: ['maintain', 'cut', 'peak', 'recover'],
    conditionalPhases: {},
    guardrail: true,
    selectable: true,
    occupiesSlot: false,
    monitorOnly: true,
    evidenceDefault: 'weak'
  },
  {
    id: 'G-MED',
    name: '医疗/女性/青少年',
    dimension: 'guardrail',
    dimensionLabel: '护栏',
    confirmSignals: ['营养师标记', '月经异常', '反复骨伤', '发热', '青少年生长停滞'],
    counterSignals: [],
    legalPhases: ['maintain', 'cut', 'peak', 'recover'],
    conditionalPhases: {},
    guardrail: true,
    selectable: false,
    occupiesSlot: false,
    evidenceDefault: 'strong'
  }
];

// ---------- 2. 矩阵：4 阶段 × 15 原子 = 60 格 ----------
const MATRIX = {
  // ===== maintain =====
  maintain: {
    'P-POW': cell('maintain', 'P-POW', {
      strategy: '保强度、容量适中；不额外加有氧',
      macros: macros([1.6, 2.2], [4, 6], null, [-350, 350]),
      timing: ['训练前 1–3h 碳水 1–2 g/kg', '训练后蛋白 25–40 g'],
      extraFields: ['training.startTime', 'training.quality'],
      monitorRules: ['PRO-01', 'ENE-01', 'REC-02', 'SLE-01'],
      evidenceStatus: 'strong',
      anchors: ['PRO-01', 'ENE-01', 'REC-02', 'SLE-01'],
      reviewStatus: 'needs_review'
    }),
    'P-SPD': cell('maintain', 'P-SPD', {
      strategy: '神经新鲜优先；速度课前不安排大容量',
      macros: macros([1.6, 2.2], [4, 6], null, [-350, 350]),
      timing: ['训练前 2–3h 碳水 1–2 g/kg', '咖啡因按需'],
      extraFields: ['training.startTime', 'training.quality'],
      monitorRules: ['SLE-01', 'REC-02', 'REC-03'],
      evidenceStatus: 'moderate',
      anchors: ['SLE-01', 'REC-02', 'REC-03']
    }),
    'P-HYP': cell('maintain', 'P-HYP', {
      strategy: '小幅盈余；力量日为主',
      macros: macros([1.8, 2.2], [4, 6], null, [200, 400]),
      timing: ['训练后蛋白 25–40 g', '训练后碳水 1.0–1.2 g/kg/h'],
      extraFields: ['training.startTime'],
      monitorRules: ['PHASE-02', 'REC-02', 'SLE-01'],
      evidenceStatus: 'moderate',
      anchors: ['PHASE-02', 'REC-02', 'SLE-01'],
      reviewStatus: 'needs_review'
    }),
    'P-END': cell('maintain', 'P-END', {
      strategy: '碳水优先；两练间隔≥6h',
      macros: macros([1.6, 2.2], [4, 7], null, [-350, 350]),
      timing: ['训练后碳水 1.0–1.2 g/kg/h', '两练间隔≥6h'],
      extraFields: ['training.startTime'],
      monitorRules: ['SLE-01', 'REC-03', 'REC-02'],
      evidenceStatus: 'strong',
      anchors: ['SLE-01', 'REC-03', 'REC-02']
    }),
    'P-MEND': cell('maintain', 'P-MEND', {
      strategy: '维持容量；不追高次数到力竭；能量按维持期方向',
      macros: null,
      timing: ['训练前 2–3h 少量易消化碳水（具体量由营养师确认）', '训练后按常规进食'],
      monitorRules: ['SLE-01', 'REC-02'],
      monitorKbIds: ['TN-04'],
      evidenceStatus: 'weak',
      anchors: ['SLE-01', 'REC-02', 'TN-04'],
      reviewStatus: 'needs_review'
    }),
    'P-SKL': cell('maintain', 'P-SKL', {
      strategy: '不空腹；技术课为主',
      macros: null,
      timing: ['训练前 1–2h 少量碳水（具体量由营养师确认）'],
      extraFields: ['training.quality'],
      monitorRules: ['SLE-01', 'REC-02'],
      evidenceStatus: 'weak',
      anchors: ['SLE-01', 'REC-02']
    }),
    'B-CUT': cell('maintain', 'B-CUT', {
      legal: false,
      legality: 'illegal',
      illegalReason: '维持期不主动减脂；需要减脂请先切到 cut',
      goalRule: 'GOAL-01',
      goal01Level: 'red',
      strategy: '阶段不符：维持期不制造热量缺口',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'B-HOLD': cell('maintain', 'B-HOLD', {
      strategy: '体重稳定；每周看斜率',
      macros: macros([1.6, 2.2], [3, 5], null, [-350, 350]),
      timing: ['正常三餐'],
      monitorRules: ['PHASE-02', 'ENE-01'],
      evidenceStatus: 'moderate',
      anchors: ['PHASE-02', 'ENE-01'],
      reviewStatus: 'needs_review'
    }),
    'B-GAIN': cell('maintain', 'B-GAIN', {
      legality: 'conditional',
      condition: '非赛季且距称重>84 天',
      conditionKey: 'weighInGt84',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '小幅盈余；仅非赛季执行',
      macros: macros([1.8, 2.2], [4, 6], null, [200, 400]),
      timing: ['训练后蛋白 25–40 g'],
      monitorRules: ['PHASE-02', 'REC-02', 'SLE-01'],
      evidenceStatus: 'moderate',
      anchors: ['PHASE-02', 'REC-02', 'SLE-01'],
      reviewStatus: 'needs_review'
    }),
    'B-PEAK': cell('maintain', 'B-PEAK', {
      legal: false,
      legality: 'illegal',
      illegalReason: '未到水盐微调窗；B-PEAK 仅在 peak 使用',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：未到微调窗',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'B-REFUEL': cell('maintain', 'B-REFUEL', {
      legal: false,
      legality: 'illegal',
      illegalReason: '未到称重后恢复窗；B-REFUEL 仅在 recover 使用',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：未到恢复窗',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'G-SLE': cell('maintain', 'G-SLE', {
      strategy: '目标 7–9h；<6.5h amber，<6h red',
      macros: null,
      timing: ['睡前 3h 不大量进食', '咖啡因睡前 8h 避免'],
      monitorRules: ['SLE-01', 'REC-03'],
      evidenceStatus: 'strong',
      anchors: ['SLE-01', 'REC-03']
    }),
    'G-GI': cell('maintain', 'G-GI', {
      legality: 'monitor',
      condition: 'maintain 期只监测；GI-01 被阶段抑制',
      strategy: '平时不主动减纤维；症状≥2 只记录',
      timing: ['训练前低纤维低脂'],
      monitorRules: ['GI-01'],
      ownerSuppressed: true,
      evidenceStatus: 'moderate',
      anchors: ['GI-01']
    }),
    'G-EA': cell('maintain', 'G-EA', {
      legality: 'guardrail',
      strategy: 'bodyFatPct 已知才计算；EA<30 红灯',
      macros: macros(null, [3, null], null, null),
      extraFields: ['profile.bodyFatPct'],
      monitorRules: ['ENE-01'],
      monitorKbIds: ['AS-05'],
      evidenceStatus: 'strong',
      anchors: ['AS-05', 'ENE-01']
    }),
    'G-IMM': cell('maintain', 'G-IMM', {
      legality: 'monitor',
      strategy: '弱证据；只监测',
      extraFields: ['health.illness'],
      monitorRules: ['SLE-01', 'REC-03'],
      monitorFields: ['health.illness'],
      evidenceStatus: 'weak',
      anchors: ['SLE-01', 'REC-03']
    }),
    'G-MED': cell('maintain', 'G-MED', {
      legality: 'veto',
      strategy: '医疗意见优先',
      evidenceStatus: 'strong'
    })
  },

  // ===== cut =====
  cut: {
    'P-POW': cell('cut', 'P-POW', {
      strategy: '强度不砍、辅助量-20~30%',
      macros: macros([2.0, 2.4], [3, 5], null, [-400, -300]),
      timing: ['训练前 1–3h 碳水 1–2 g/kg', '训练后碳水 1.0–1.2 g/kg/h'],
      extraFields: ['training.startTime', 'training.quality'],
      monitorRules: ['PHASE-01', 'PRO-01', 'HYD-01', 'REC-02'],
      evidenceStatus: 'moderate',
      anchors: ['PHASE-01', 'PRO-01', 'HYD-01', 'REC-02'],
      reviewStatus: 'needs_review'
    }),
    'P-SPD': cell('cut', 'P-SPD', {
      strategy: '速度日不加深缺口',
      macros: macros([2.0, 2.4], [3, 5], null, [-300, null]),
      macroNote: '速度日缺口不超过 300 kcal',
      timing: ['训练前 2–3h 碳水 1–2 g/kg'],
      extraFields: ['training.startTime', 'training.quality'],
      monitorRules: ['PHASE-01', 'SLE-01', 'REC-02'],
      evidenceStatus: 'moderate',
      anchors: ['PHASE-01', 'SLE-01', 'REC-02']
    }),
    'P-HYP': cell('cut', 'P-HYP', {
      legality: 'conditional',
      condition: '仅保肌：不加量，力量维持 1–2 次/周',
      strategy: '只保肌不加量',
      macros: macros([2.0, 2.4], [3, 5], null, [-400, -300]),
      timing: ['训练后蛋白 25–40 g'],
      extraFields: ['training.startTime'],
      monitorRules: ['PRO-01', 'PHASE-01', 'REC-02'],
      evidenceStatus: 'moderate',
      anchors: ['PRO-01', 'PHASE-01', 'REC-02'],
      reviewStatus: 'needs_review'
    }),
    'P-END': cell('cut', 'P-END', {
      strategy: '缺口≤400；大负荷日不加深',
      macros: macros([2.0, 2.4], [3, null], null, [-400, -300]),
      timing: ['训练后碳水 1.0–1.2 g/kg/h'],
      extraFields: ['training.startTime'],
      monitorRules: ['PHASE-01', 'ENE-01', 'SLE-01', 'REC-03'],
      evidenceStatus: 'strong',
      anchors: ['PHASE-01', 'ENE-01', 'SLE-01', 'REC-03']
    }),
    'P-MEND': cell('cut', 'P-MEND', {
      legality: 'conditional',
      condition: '仅维持现有容量，不新增循环/间歇课；缺口沿用 B-CUT（≤400）',
      strategy: '仅维持现有容量，不新增循环/间歇课；缺口沿用 B-CUT 口径（≤400）',
      macros: null,
      timing: ['训练前 2–3h 少量易消化碳水（具体量由营养师确认）', '训练后常规补蛋白与碳水'],
      monitorRules: ['PHASE-01', 'SLE-01', 'REC-02'],
      monitorKbIds: ['TN-04'],
      evidenceStatus: 'weak',
      anchors: ['PHASE-01', 'SLE-01', 'REC-02', 'TN-04'],
      reviewStatus: 'needs_review'
    }),
    'P-SKL': cell('cut', 'P-SKL', {
      strategy: '技术日不加深缺口',
      macros: null,
      timing: ['训练前 1–2h 少量碳水（具体量由营养师确认）'],
      extraFields: ['training.quality'],
      monitorRules: ['PHASE-01', 'SLE-01'],
      evidenceStatus: 'weak',
      anchors: ['PHASE-01', 'SLE-01']
    }),
    'B-CUT': cell('cut', 'B-CUT', {
      strategy: '缺口 300–600；每 2–3 周 refeed',
      macros: macros([2.0, 2.4], [3, 5], [0.5, 1.0], [-600, -300]),
      timing: ['训练前后集中碳水'],
      monitorRules: ['PHASE-01', 'ENE-01', 'PRO-01', 'HYD-01'],
      evidenceStatus: 'strong',
      anchors: ['PHASE-01', 'ENE-01', 'PRO-01', 'HYD-01'],
      reviewStatus: 'needs_review'
    }),
    'B-HOLD': cell('cut', 'B-HOLD', {
      legality: 'conditional',
      condition: '仅 gapPct≤1.5%',
      conditionKey: 'gapPctLte15',
      goalRule: 'GOAL-01',
      goal01Level: 'red',
      strategy: '只维持不再减',
      macros: macros([2.0, 2.4], [3, 5], null, null),
      macroNote: '保持缺口方向不变（E≤−300），不再加深',
      timing: ['正常三餐'],
      monitorRules: ['PHASE-02', 'PHASE-01', 'PRO-01'],
      evidenceStatus: 'moderate',
      anchors: ['PHASE-02', 'PHASE-01', 'PRO-01'],
      reviewStatus: 'needs_review'
    }),
    'B-GAIN': cell('cut', 'B-GAIN', {
      legal: false,
      legality: 'illegal',
      illegalReason: '减脂期禁止增重：赤字与盈余方向相反',
      goalRule: 'GOAL-01',
      goal01Level: 'red',
      strategy: '阶段不符：减脂期禁止增重',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'B-PEAK': cell('cut', 'B-PEAK', {
      legal: false,
      legality: 'illegal',
      illegalReason: '微调窗未到；B-PEAK 仅在 peak 使用',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：微调窗未到',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'B-REFUEL': cell('cut', 'B-REFUEL', {
      legal: false,
      legality: 'illegal',
      illegalReason: '未到称重后恢复窗；B-REFUEL 仅在 recover 使用',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：未到恢复窗',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'G-SLE': cell('cut', 'G-SLE', {
      strategy: '缺口不加深；目标 7–9h',
      macros: null,
      timing: ['咖啡因睡前 8h 避免'],
      monitorRules: ['SLE-01', 'PHASE-01'],
      evidenceStatus: 'strong',
      anchors: ['SLE-01', 'PHASE-01']
    }),
    'G-GI': cell('cut', 'G-GI', {
      legality: 'monitor',
      condition: 'cut 期只监测；GI-01 被阶段抑制',
      strategy: '高纤维/高脂餐后训练注意',
      timing: ['训练前低纤维低脂'],
      monitorRules: ['GI-01'],
      ownerSuppressed: true,
      evidenceStatus: 'moderate',
      anchors: ['GI-01']
    }),
    'G-EA': cell('cut', 'G-EA', {
      legality: 'guardrail',
      strategy: '缺口≤300–400；EA<30 否决加深',
      macros: macros(null, [3, null], null, null),
      extraFields: ['profile.bodyFatPct'],
      monitorRules: ['ENE-01', 'PHASE-01'],
      monitorKbIds: ['AS-05'],
      evidenceStatus: 'strong',
      anchors: ['AS-05', 'ENE-01', 'PHASE-01']
    }),
    'G-IMM': cell('cut', 'G-IMM', {
      legality: 'monitor',
      strategy: '缺口>900 且感染时，不加深缺口',
      extraFields: ['health.illness'],
      monitorRules: ['ENE-01', 'SLE-01'],
      monitorFields: ['health.illness'],
      evidenceStatus: 'weak',
      anchors: ['ENE-01', 'SLE-01']
    }),
    'G-MED': cell('cut', 'G-MED', {
      legality: 'veto',
      strategy: '医疗意见优先',
      evidenceStatus: 'strong'
    })
  },

  // ===== peak =====
  peak: {
    'P-POW': cell('peak', 'P-POW', {
      strategy: '只保强度、不加量',
      macros: macros([1.6, 2.2], [3, 5], null, [0, 0]),
      timing: ['训练前 1–2h 小份碳水'],
      extraFields: ['training.startTime', 'training.quality'],
      monitorRules: ['HYD-05', 'GI-01', 'SLE-01', 'REC-02'],
      evidenceStatus: 'strong',
      anchors: ['HYD-05', 'GI-01', 'SLE-01', 'REC-02']
    }),
    'P-SPD': cell('peak', 'P-SPD', {
      strategy: '低容量保速度',
      macros: macros([1.6, 2.2], [3, 5], null, [0, 0]),
      timing: ['训练前 2–3h 碳水 1–2 g/kg'],
      extraFields: ['training.startTime', 'training.quality'],
      monitorRules: ['HYD-05', 'GI-01', 'SLE-01'],
      evidenceStatus: 'moderate',
      anchors: ['HYD-05', 'GI-01', 'SLE-01']
    }),
    'P-HYP': cell('peak', 'P-HYP', {
      legal: false,
      legality: 'illegal',
      illegalReason: '微调期不动热量盈余；P-HYP 在 peak 不合法',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：微调期不安排增肌',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'P-END': cell('peak', 'P-END', {
      strategy: '只维持低容量，不新增负荷',
      macros: macros([1.6, 2.2], [3, 5], null, [0, 0]),
      timing: ['按计划补液'],
      extraFields: ['training.startTime'],
      monitorRules: ['HYD-05', 'GI-01', 'SLE-01'],
      evidenceStatus: 'moderate',
      anchors: ['HYD-05', 'GI-01', 'SLE-01']
    }),
    'P-MEND': cell('peak', 'P-MEND', {
      legal: false,
      legality: 'illegal',
      illegalReason: '微调期不做高容量肌耐力课：额外肌损伤与疲劳会拖累神经表现与水盐微调；窗口未到或已过，可延后',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：微调期不做高容量肌耐力课；窗口未到或已过，可延后到赛后 maintain',
      monitorRules: ['GOAL-01'],
      monitorKbIds: ['TN-04'],
      evidenceStatus: 'weak',
      anchors: ['TN-04'],
      reviewStatus: 'active'
    }),
    'P-SKL': cell('peak', 'P-SKL', {
      strategy: '低纤维低体积；技术课为主',
      macros: null,
      timing: ['训练前 1–2h 少量碳水（具体量由营养师确认）'],
      extraFields: ['training.quality'],
      monitorRules: ['GI-01', 'HYD-05'],
      evidenceStatus: 'weak',
      anchors: ['GI-01', 'HYD-05']
    }),
    'B-CUT': cell('peak', 'B-CUT', {
      legal: false,
      legality: 'illegal',
      illegalReason: '微调期禁止再动热量缺口',
      goalRule: 'GOAL-01',
      goal01Level: 'red',
      strategy: '阶段不符：禁止再动热量缺口',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'B-HOLD': cell('peak', 'B-HOLD', {
      legal: false,
      legality: 'illegal',
      illegalReason: '微调期按水盐计划，不做热量维持决策',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：微调期不做热量维持决策',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'B-GAIN': cell('peak', 'B-GAIN', {
      legal: false,
      legality: 'illegal',
      illegalReason: '微调期禁止增重',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：微调期禁止增重',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'B-PEAK': cell('peak', 'B-PEAK', {
      strategy: '只动水、钠、纤维与胃肠内容物',
      macros: macros([1.6, 2.2], [3, 5], null, [0, 0]),
      timing: ['按补液计划', '快碳≤60 g/h'],
      monitorRules: ['HYD-05', 'GI-01', 'SLE-01'],
      evidenceStatus: 'strong',
      anchors: ['HYD-05', 'GI-01', 'SLE-01']
    }),
    'B-REFUEL': cell('peak', 'B-REFUEL', {
      legal: false,
      legality: 'illegal',
      illegalReason: '称重前不做恢复；B-REFUEL 仅在 recover 使用',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：称重前不做恢复',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'G-SLE': cell('peak', 'G-SLE', {
      strategy: '目标 7–9h；<7h amber',
      macros: null,
      timing: ['固定作息'],
      monitorRules: ['SLE-01', 'HYD-05'],
      evidenceStatus: 'strong',
      anchors: ['SLE-01', 'HYD-05']
    }),
    'G-GI': cell('peak', 'G-GI', {
      strategy: '低纤维、低脂、小体积',
      timing: ['快碳≤60 g/h'],
      monitorRules: ['GI-01', 'HYD-05'],
      evidenceStatus: 'moderate',
      anchors: ['GI-01', 'HYD-05']
    }),
    'G-EA': cell('peak', 'G-EA', {
      legality: 'guardrail',
      strategy: '不做能量缺口；EA 只监测',
      extraFields: ['profile.bodyFatPct'],
      monitorKbIds: ['AS-05'],
      ownerSuppressed: true,
      evidenceStatus: 'strong',
      anchors: ['AS-05']
    }),
    'G-IMM': cell('peak', 'G-IMM', {
      legality: 'monitor',
      strategy: '赛前不试新食物/补剂',
      extraFields: ['health.illness'],
      monitorRules: ['GI-01', 'SLE-01'],
      monitorFields: ['health.illness'],
      evidenceStatus: 'weak',
      anchors: ['GI-01', 'SLE-01']
    }),
    'G-MED': cell('peak', 'G-MED', {
      legality: 'veto',
      strategy: '医疗意见优先',
      evidenceStatus: 'strong'
    })
  },

  // ===== recover =====
  recover: {
    'P-POW': cell('recover', 'P-POW', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不安排爆发课',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不安排爆发课',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'P-SPD': cell('recover', 'P-SPD', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不安排速度课',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不安排速度课',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'P-HYP': cell('recover', 'P-HYP', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期先补液补糖，不安排增肌目标',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不安排增肌目标',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'P-END': cell('recover', 'P-END', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不安排训练课',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不安排训练课',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'P-MEND': cell('recover', 'P-MEND', {
      legal: false,
      legality: 'illegal',
      illegalReason: '阶段不符：恢复期不排训练课，先补液补糖',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不排训练课，可延后',
      monitorRules: ['GOAL-01'],
      monitorKbIds: ['TN-04'],
      evidenceStatus: 'weak',
      anchors: ['TN-04'],
      reviewStatus: 'active'
    }),
    'P-SKL': cell('recover', 'P-SKL', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不安排技术课',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不安排技术课',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'weak',
      anchors: ['GOAL-01']
    }),
    'B-CUT': cell('recover', 'B-CUT', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不做减脂决策',
      goalRule: 'GOAL-01',
      goal01Level: 'red',
      strategy: '阶段不符：恢复期不做减脂决策',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'B-HOLD': cell('recover', 'B-HOLD', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不做控重决策',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不做控重决策',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'B-GAIN': cell('recover', 'B-GAIN', {
      legal: false,
      legality: 'illegal',
      illegalReason: '恢复期不做增重决策',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：恢复期不做增重决策',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'moderate',
      anchors: ['GOAL-01']
    }),
    'B-PEAK': cell('recover', 'B-PEAK', {
      legal: false,
      legality: 'illegal',
      illegalReason: '称重已过；B-PEAK 仅在 peak 使用',
      goalRule: 'GOAL-01',
      goal01Level: 'amber',
      strategy: '阶段不符：称重已过',
      monitorRules: ['GOAL-01'],
      evidenceStatus: 'strong',
      anchors: ['GOAL-01']
    }),
    'B-REFUEL': cell('recover', 'B-REFUEL', {
      strategy: 'ORS + 快碳 + 蛋白；逐步加纤维',
      macros: macros([1.6, 2.0], null, null, [0, 0]),
      targets: {
        protein: { min: 1.6, max: 2.0, unit: 'g/kg', sourceType: 'rule', sourceId: 'PRO-01', advisory: true },
        carb: [[4, 7], [8, 12]],
        energyBalance: { min: 0, max: 0, unit: 'kcal', sourceType: 'rule', sourceId: 'PHASE-01', advisory: true }
      },
      macroNote: '碳水按区间数组表达：轻度限制 4–7 g/kg，糖原耗尽 8–12 g/kg；7–8 之间不合法，不得连续化',
      timing: ['先补液再补糖', '快碳≤60 g/h', '蛋白与碳水同餐'],
      monitorRules: ['HYD-04', 'REC-01', 'REC-04', 'GI-01'],
      evidenceStatus: 'strong',
      anchors: ['HYD-04', 'REC-01', 'REC-04', 'GI-01']
    }),
    'G-SLE': cell('recover', 'G-SLE', {
      strategy: '恢复期优先睡眠',
      macros: null,
      monitorRules: ['SLE-01', 'REC-01', 'REC-04'],
      evidenceStatus: 'strong',
      anchors: ['SLE-01', 'REC-01', 'REC-04']
    }),
    'G-GI': cell('recover', 'G-GI', {
      strategy: '逐步加回纤维',
      timing: ['低纤维起步，逐步加回'],
      monitorRules: ['GI-01', 'REC-01'],
      evidenceStatus: 'moderate',
      anchors: ['GI-01', 'REC-01']
    }),
    'G-EA': cell('recover', 'G-EA', {
      legality: 'guardrail',
      strategy: '恢复期不判 EA',
      extraFields: ['profile.bodyFatPct'],
      monitorKbIds: ['AS-05'],
      evidenceStatus: 'strong',
      anchors: ['AS-05']
    }),
    'G-IMM': cell('recover', 'G-IMM', {
      legality: 'monitor',
      strategy: '感染优先就医',
      extraFields: ['health.illness'],
      monitorFields: ['health.illness'],
      evidenceStatus: 'weak',
      anchors: ['health.illness']
    }),
    'G-MED': cell('recover', 'G-MED', {
      legality: 'veto',
      strategy: '医疗意见优先',
      evidenceStatus: 'strong'
    })
  }
};

// ---------- 3. 复合目标配方 C01–C27 ----------
const COMPOSITES = [
  {
    id: 'C01', name: '爆发+减重', atoms: ['P-POW', 'B-CUT'],
    lead: 'B-CUT', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'], guardrailAction: null,
    targetCaps: { energyBalance: { min: -400, max: -300 } },
    keyStrategy: '缺口≤400；砍辅助量不砍强度；P 2.0–2.4 g/kg；C 3–5 g/kg',
    evidence: 'strong', evidenceNote: '强；保爆发部分中等',
    phases: ['cut'], weak: false, aliasNote: null
  },
  {
    id: 'C02', name: '爆发+控级别', docAtoms: ['P-POW', 'B-HOLD'], atoms: ['P-POW', 'B-HOLD'],
    lead: 'P-POW', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: 'HOLD 作边界 ±350 kcal；P 1.6–2.2 g/kg；C 4–6 g/kg',
    evidence: 'moderate', evidenceNote: '中强',
    phases: ['maintain', 'cut'], weak: false, aliasNote: null
  },
  {
    id: 'C03', name: '速度+控级别', docAtoms: ['P-SPD', 'B-HOLD'], atoms: ['P-SPD', 'B-HOLD'],
    lead: 'P-SPD', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: 'HOLD 作边界；速度课前碳水充足；睡眠≥7h',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['maintain', 'cut'], weak: false, aliasNote: null
  },
  {
    id: 'C04', name: '速度+减脂', atoms: ['P-SPD', 'B-CUT'],
    lead: 'B-CUT', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'], guardrailAction: null,
    targetCaps: { energyBalance: { min: -400, max: -300 } },
    keyStrategy: '速度日不加深缺口；P 2.0–2.4 g/kg；C 3–5 g/kg',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['cut'], weak: false, aliasNote: null
  },
  {
    id: 'C05', name: '增肌+耐力', docAtoms: ['P-HYP', 'P-END'], atoms: ['P-HYP', 'P-END'],
    lead: null, leadByPhase: { maintain: 'P-HYP', cut: 'P-END' }, leadNote: '阶段敏感：非赛季 HYP，减脂期 END 维持',
    mode: 'sequence', modes: ['sequence'],
    keyStrategy: '非赛季 HYP、赛前 END；两练间隔≥6h；C 4–7 g/kg；P 1.8–2.2 g/kg',
    evidence: 'moderate', evidenceNote: '中（组合间接）',
    phases: ['maintain', 'cut'], weak: false, aliasNote: null
  },
  {
    id: 'C06', name: '增肌+控级别', docAtoms: ['P-HYP', 'B-HOLD'], atoms: ['P-HYP', 'B-HOLD'],
    lead: 'P-HYP', leadByPhase: { cut: 'B-HOLD' }, leadNote: '非赛季 HYP，赛前 HOLD',
    mode: 'cap', modes: ['cap'],
    keyStrategy: '非赛季 HYP，赛前 HOLD；盈余≤400',
    evidence: 'moderate', evidenceNote: '中强',
    phases: ['maintain', 'cut'], weak: false, aliasNote: null
  },
  {
    id: 'C07', name: '增肌+睡眠', docAtoms: ['P-HYP', 'G-SLE'], atoms: ['P-HYP', 'G-SLE'],
    lead: 'G-SLE', leadByPhase: null, leadNote: 'SLE 红灯时由 G-SLE 主导',
    mode: 'cap', modes: ['cap', 'sequence'],
    keyStrategy: '睡眠<6.5h 不加量；P 1.8–2.2 g/kg',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['maintain', 'cut', 'peak', 'recover'], weak: false, aliasNote: null
  },
  {
    id: 'C08', name: '耐力+减脂', atoms: ['P-END', 'B-CUT'],
    lead: 'B-CUT', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'], guardrailAction: null,
    targetCaps: { energyBalance: { min: -400, max: -300 } },
    keyStrategy: '缺口≤400；C≥3 g/kg；大负荷日不加深',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['cut'], weak: false, aliasNote: null
  },
  {
    id: 'C09', name: '耐力+控级别', docAtoms: ['P-END', 'B-HOLD'], atoms: ['P-END', 'B-HOLD'],
    lead: 'P-END', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: 'HOLD 作边界；C 4–7 g/kg；两练间隔≥6h',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['maintain', 'cut'], weak: false, aliasNote: null
  },
  {
    id: 'C10', name: '大负荷+睡眠', docAtoms: ['P-END', 'G-SLE'], atoms: ['P-END', 'G-SLE'],
    lead: 'G-SLE', leadByPhase: null, leadNote: 'SLE 红灯时由 G-SLE 主导',
    mode: 'cap', modes: ['cap'],
    keyStrategy: '睡眠<6h 次日强度-20%；C 4–7 g/kg；训练后补糖',
    evidence: 'strong', evidenceNote: '强',
    phases: ['maintain', 'cut', 'peak', 'recover'], weak: false, aliasNote: null
  },
  {
    id: 'C11', name: '控重+精力', atoms: ['B-HOLD', 'G-SLE'],
    lead: 'B-HOLD', leadByPhase: null, leadNote: null,
    mode: 'monitor', modes: ['monitor'],
    keyStrategy: '只监测 mood.fatigue/睡眠/晨脉；不加深缺口',
    evidence: 'weak', evidenceNote: '弱',
    phases: ['maintain', 'cut'], weak: true
  },
  {
    id: 'C12', name: '减脂+精力', atoms: ['B-CUT', 'G-SLE'],
    lead: 'B-CUT', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: '疲劳≥4 时缺口不加深；C≥3 g/kg',
    evidence: 'weak', evidenceNote: '弱中',
    phases: ['cut'], weak: true
  },
  {
    id: 'C13', name: '减脂+胃肠', docAtoms: ['B-CUT', 'G-GI'], atoms: ['B-CUT', 'G-GI'],
    lead: 'G-GI', leadByPhase: null, leadNote: 'GI 红灯时由 G-GI 主导',
    mode: 'cap', modes: ['cap'],
    keyStrategy: '低纤维、小体积、分餐；缺口不加深',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['cut'], weak: false, aliasNote: null
  },
  {
    id: 'C14', name: '微调+胃肠', docAtoms: ['B-PEAK', 'G-GI'], atoms: ['B-PEAK', 'G-GI'],
    lead: 'B-PEAK', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: 'GI 硬约束；低纤维低脂小体积；快碳≤60 g/h',
    evidence: 'strong', evidenceNote: '强',
    phases: ['peak'], weak: false, aliasNote: null
  },
  {
    id: 'C15', name: '微调+爆发', docAtoms: ['B-PEAK', 'P-POW'], atoms: ['B-PEAK', 'P-POW'],
    lead: 'B-PEAK', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: '只保强度不加量；咖啡因按计划；补水按计划',
    evidence: 'strong', evidenceNote: '强/中',
    phases: ['peak'], weak: false, aliasNote: null
  },
  {
    id: 'C16', name: '称重后恢复+控级别', docAtoms: ['B-REFUEL', 'B-HOLD'], atoms: ['B-REFUEL', 'B-HOLD'],
    lead: 'B-REFUEL', leadByPhase: null, leadNote: null,
    mode: 'sequence', modes: ['sequence'],
    keyStrategy: '先 24h 补液补糖，再回维持',
    evidence: 'strong', evidenceNote: '强',
    phases: ['recover'], weak: false, aliasNote: null
  },
  {
    id: 'C17', name: '称重后恢复+增肌', docAtoms: ['B-REFUEL', 'P-HYP'], atoms: ['B-REFUEL', 'P-HYP'],
    lead: 'B-REFUEL', leadByPhase: null, leadNote: null,
    mode: 'sequence', modes: ['sequence'],
    keyStrategy: '先恢复体液与糖原，再谈增肌',
    evidence: 'strong', evidenceNote: '强',
    phases: ['recover'], weak: false, aliasNote: null
  },
  {
    id: 'C18', name: '减脂+能量可用性', atoms: ['B-CUT', 'G-EA'],
    lead: 'G-EA', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'], guardrailAction: 'veto',
    targetCaps: { energyBalance: { min: -400, max: -300 } },
    keyStrategy: 'EA<30 否决加深缺口；缺口≤300–400',
    evidence: 'strong', evidenceNote: '强',
    phases: ['cut'], weak: false, aliasNote: null
  },
  {
    id: 'C19', name: '大负荷+免疫', atoms: ['P-END', 'G-IMM'],
    lead: 'P-END', leadByPhase: null, leadNote: null,
    mode: 'monitor', modes: ['monitor'], guardrailAction: null,
    keyStrategy: '感染期不加大负荷；缺口>900 时先回补',
    evidence: 'weak', evidenceNote: '弱',
    phases: ['maintain', 'cut', 'peak', 'recover'], weak: true, aliasNote: null
  },
  {
    id: 'C20', name: '增肌+耐力+控级别', docAtoms: ['P-HYP', 'P-END', 'B-HOLD'], atoms: ['P-HYP', 'P-END', 'B-HOLD'],
    lead: 'B-HOLD', leadByPhase: null, leadNote: null,
    mode: 'sequence', modes: ['sequence', 'cap'],
    keyStrategy: '两练序贯；容量封顶；盈余≤400',
    evidence: 'weak', evidenceNote: '组合弱',
    phases: ['maintain'], weak: true, aliasNote: null
  },
  {
    id: 'C21', name: '爆发+减重+睡眠', docAtoms: ['P-POW', 'B-CUT', 'G-SLE'], atoms: ['P-POW', 'B-CUT', 'G-SLE'],
    lead: 'G-SLE', leadByPhase: null, leadNote: 'SLE 红灯时由 G-SLE 主导',
    mode: 'cap', modes: ['cap'],
    keyStrategy: '缺口≤400；强度不砍；睡眠<6h 不加量',
    evidence: 'weak', evidenceNote: '组合弱',
    phases: ['cut'], weak: true, aliasNote: null
  },
  {
    id: 'C22', name: '控重+精力+胃肠', atoms: ['B-HOLD', 'G-SLE', 'G-GI'],
    lead: 'G-GI', leadByPhase: null, leadNote: 'GI 红灯时由 G-GI 主导',
    mode: 'monitor', modes: ['monitor', 'cap'],
    keyStrategy: '低纤维小体积；只监测精力',
    evidence: 'weak', evidenceNote: '弱',
    phases: ['maintain', 'cut'], weak: true
  },
  {
    id: 'C23', name: '增肌+控级别（青少年/级别迁移）', docAtoms: ['B-GAIN', 'B-HOLD'], atoms: ['B-GAIN', 'B-HOLD'],
    lead: 'B-HOLD', leadByPhase: null, leadNote: '生长/医疗优先：需营养师与医生共同确认',
    mode: 'block', modes: ['block'],
    keyStrategy: '赛前禁止 GAIN；按生长曲线定盈余',
    evidence: 'mixed', evidenceNote: '健康强 / 增肌弱',
    phases: ['maintain'], weak: false, aliasNote: null
  },
  {
    id: 'C24', name: '技术+精力', atoms: ['P-SKL', 'G-SLE'],
    lead: 'P-SKL', leadByPhase: null, leadNote: null,
    mode: 'monitor', modes: ['monitor'],
    keyStrategy: '不空腹；技术日不加深缺口；只监测精力',
    evidence: 'weak', evidenceNote: '弱',
    phases: ['maintain', 'cut', 'peak'], weak: true
  },
  {
    id: 'C25', name: '微调+睡眠', docAtoms: ['B-PEAK', 'G-SLE'], atoms: ['B-PEAK', 'G-SLE'],
    lead: 'B-PEAK', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: '睡眠 7–9h 硬约束；固定作息',
    evidence: 'strong', evidenceNote: '强',
    phases: ['peak'], weak: false, aliasNote: null
  },
  {
    id: 'C26', name: '减脂+保肌', atoms: ['B-CUT', 'P-HYP'],
    lead: 'B-CUT', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'], guardrailAction: null,
    targetCaps: { energyBalance: { min: -400, max: -300 } },
    keyStrategy: '蛋白 2.0–2.4 g/kg；力量维持不加量；缺口≤400',
    evidence: 'strong', evidenceNote: '强',
    phases: ['cut'], weak: false, aliasNote: null
  },
  {
    id: 'C27', name: '增肌+耐力', docAtoms: ['B-GAIN', 'P-END'], atoms: ['B-GAIN', 'P-END'],
    lead: 'B-GAIN', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: '仅非赛季；碳水优先；盈余≤400',
    evidence: 'moderate', evidenceNote: '中',
    phases: ['maintain'], weak: false, aliasNote: null
  },
  {
    id: 'C28', name: '增肌+肌耐力', atoms: ['P-HYP', 'P-MEND'],
    lead: 'P-HYP', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: '非赛季小幅盈余；P-MEND 只维持容量，不加循环训练量；不承诺数值',
    evidence: 'weak', evidenceNote: '弱（组合间接）',
    phases: ['maintain'], weak: true, aliasNote: null
  },
  {
    id: 'C29', name: '减脂+肌耐力', atoms: ['P-MEND', 'B-CUT'],
    lead: 'B-CUT', leadByPhase: null, leadNote: null,
    mode: 'cap', modes: ['cap'],
    keyStrategy: '缺口≤400；P-MEND 只维持，不新增容量；训练前后碳水优先',
    evidence: 'weak', evidenceNote: '弱',
    phases: ['cut'], weak: true, aliasNote: null
  }
];

// ---------- 4. 冲突边（G2 消解冲突时直接消费） ----------
const CONFLICT_EDGES = [
  { a: 'B-CUT', b: 'B-GAIN', mode: 'forbid', modeAlt: null, note: '能量赤字 vs 盈余；同一时间窗只允许一个' },
  { a: 'B-CUT', b: 'P-HYP', mode: 'cap', modeAlt: null, note: 'CUT 主导，HYP 只保肌不加量' },
  { a: 'B-CUT', b: 'P-END', mode: 'cap', modeAlt: null, note: '缺口≤400，碳水≥3 g/kg' },
  { a: 'B-CUT', b: 'P-POW', mode: 'cap', modeAlt: null, note: '砍辅助量不砍强度，缺口封顶' },
  { a: 'B-PEAK', b: 'B-CUT', mode: 'forbid', modeAlt: null, note: '微调期禁止动热量缺口' },
  { a: 'B-PEAK', b: 'B-GAIN', mode: 'forbid', modeAlt: null, note: '微调期禁止增重' },
  { a: 'B-PEAK', b: 'P-HYP', mode: 'forbid', modeAlt: null, note: '微调期不动热量盈余' },
  { a: 'B-PEAK', b: 'P-END', mode: 'forbid', modeAlt: null, note: '微调期不新增负荷' },
  { a: 'B-REFUEL', b: 'B-CUT', mode: 'forbid', modeAlt: null, note: '恢复期不做减脂决策' },
  { a: 'B-HOLD', b: 'B-GAIN', mode: 'block', modeAlt: 'substitute', note: '赛前<12 周 GAIN 转 HOLD + 力量维持' },
  { a: 'P-SPD', b: 'P-HYP', mode: 'sequence', modeAlt: null, note: '速度课排前、间隔≥6h' },
  { a: 'P-SPD', b: 'P-END', mode: 'sequence', modeAlt: null, note: '速度课排前、间隔≥6h' },
  { a: 'P-POW', b: 'P-END', mode: 'sequence', modeAlt: 'cap', note: '不叠在同一天' },
  { a: 'P-END', b: 'G-SLE', mode: 'cap', modeAlt: null, note: '睡眠<6h 次日强度-20%；红灯由 goalBlockers 叠加 veto' },
  { a: 'G-GI', b: 'P-END', mode: 'cap', modeAlt: null, note: '低纤维、小体积、分餐' },
  { a: 'G-GI', b: 'B-GAIN', mode: 'cap', modeAlt: null, note: '低纤维、小体积、分餐' },
  { a: 'G-GI', b: 'P-HYP', mode: 'cap', modeAlt: null, note: '低纤维、小体积、分餐' },
  { a: 'G-EA', b: 'B-CUT', mode: 'cap', modeAlt: null, note: 'EA 红灯由 goalBlockers 叠加 veto，否决加深缺口' },
  { a: 'G-IMM', b: 'P-END', mode: 'monitor', modeAlt: null, note: '感染期只监测，不加大负荷' },
  { a: 'G-IMM', b: 'B-CUT', mode: 'monitor', modeAlt: null, note: '感染期只监测，不加深缺口' },
  { a: 'P-HYP', b: 'P-MEND', mode: 'cap', modeAlt: null, note: 'HYP 主导，MEND 只维持，不加循环训练量' },
  { a: 'P-END', b: 'P-MEND', mode: 'sequence', modeAlt: 'cap', note: 'END 优先；同日不叠，两课间隔≥6 h' },
  { a: 'P-POW', b: 'P-MEND', mode: 'sequence', modeAlt: null, note: '大强度课排前，MEND 不排在同日速度课前' },
  { a: 'P-SPD', b: 'P-MEND', mode: 'sequence', modeAlt: null, note: '大强度课排前，MEND 不排在同日速度课前' },
  { a: 'B-CUT', b: 'P-MEND', mode: 'cap', modeAlt: null, note: '缺口≤400，不新增容量' },
  { a: 'B-PEAK', b: 'P-MEND', mode: 'forbid', modeAlt: null, note: '微调期不做高容量肌耐力' },
  { a: 'G-MED', b: '*', mode: 'forbid', modeAlt: null, producesConcession: false, note: '医疗安全护栏动作 veto，不产生 concessions' }
];

// ---------- 5. 优先级栈 L0–L6 ----------
const PRIORITY_STACK = [
  { level: 'L0', key: 'MED', label: '医疗安全', members: ['G-MED'], order: [], note: '绝对否决' },
  { level: 'L1', key: 'PHASE_WINDOW', label: '比赛时间窗与资格', members: ['B-PEAK', 'B-REFUEL', 'B-HOLD'], order: [], note: '阶段合法性优先' },
  { level: 'L2', key: 'GUARDRAIL', label: '健康护栏', members: ['G-EA', 'G-GI', 'G-SLE'], order: ['G-EA', 'G-GI', 'G-SLE'], note: '红灯时否决“加练/加深缺口换比赛”的手段，不否决比赛本身' },
  { level: 'L3', key: 'NEURO', label: '神经表现', members: ['P-SPD', 'P-POW'], order: ['P-SPD', 'P-POW'], note: '赛前 2 周内优先保神经新鲜' },
  { level: 'L4', key: 'STRUCTURE', label: '结构/体能', members: ['P-HYP', 'P-END', 'P-MEND'], order: ['P-HYP', 'P-END', 'P-MEND'], note: '非赛季 HYP 优先，赛前 END 维持优先；MEND 排末位，只作维持性目标' },
  { level: 'L5', key: 'BODY', label: '体型', members: ['B-CUT', 'B-GAIN'], order: ['B-CUT', 'B-GAIN'], note: '赛前 12 周内 CUT；GAIN 只允许非赛季' },
  { level: 'L6', key: 'AUX', label: '辅助', members: ['P-SKL', 'G-IMM'], order: [], note: '只做监测，不让步主目标；G-IMM 不占 3 个名额' }
];

// ---------- 6. 六种让步模式 ----------
const CONCESSION_MODES = [
  { mode: 'forbid', label: '禁止共存', meaning: '同一时间窗不允许共存', examples: ['PEAK+CUT', 'REFUEL+CUT'] },
  { mode: 'cap', label: '允许但封顶', meaning: '允许共存但设上限', examples: ['CUT+POW 缺口≤400、辅助量-20~30%'] },
  { mode: 'sequence', label: '时间分离', meaning: '按顺序执行，避免同日叠加', examples: ['HYP+END 两练间隔≥6h', 'REFUEL 先 24h 再增肌'] },
  { mode: 'block', label: '阶段阻断', meaning: '当前阶段禁止，转到下一个时间窗', examples: ['赛前 GAIN → 非赛季'] },
  { mode: 'substitute', label: '等效替换', meaning: '换成可执行的目标', examples: ['赛前 GAIN → HOLD + 力量维持'] },
  { mode: 'monitor', label: '只监测', meaning: '证据弱或只是信号，只提示不让步', examples: ['SKL/IMM'] }
];
const CONCESSION_MODE_IDS = CONCESSION_MODES.map(function (m) { return m.mode; });

// §4 配方表与 §5.1 冲突边还使用 veto（护栏否决动作），它不属于 §5.3 的六种让步模式。
// 这里单独区分，避免把 veto 混进六种模式，也避免配方数据丢失文档原值。
const GUARDRAIL_ACTIONS = ['veto'];
const RECIPE_MODE_IDS = CONCESSION_MODE_IDS.concat(GUARDRAIL_ACTIONS);

module.exports = {
  GOAL_MATRIX_VERSION: GOAL_MATRIX_VERSION,
  PHASES: PHASES,
  ATOMS: ATOMS,
  MATRIX: MATRIX,
  COMPOSITES: COMPOSITES,
  CONFLICT_EDGES: CONFLICT_EDGES,
  PRIORITY_STACK: PRIORITY_STACK,
  CONCESSION_MODES: CONCESSION_MODES,
  CONCESSION_MODE_IDS: CONCESSION_MODE_IDS,
  GUARDRAIL_ACTIONS: GUARDRAIL_ACTIONS,
  RECIPE_MODE_IDS: RECIPE_MODE_IDS
};
