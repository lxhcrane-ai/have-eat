// 复合目标纯函数解析层对照测试：数据完整性、入口校验、冲突裁决、名额、弱证据与空目标。
// 用法：node scripts/test-goals.js
const path = require('path');
const GM = require(path.join(__dirname, '../miniprogram/data/goalMatrix.js'));
const goals = require(path.join(__dirname, '../miniprogram/utils/goals.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function hasMode(list, mode) { return list.some(function (c) { return c.mode === mode; }); }
function goalOf(plan, id) { return plan.goals.filter(function (g) { return g.id === id; })[0]; }

const SIX_MODES = ['forbid', 'cap', 'sequence', 'block', 'substitute', 'monitor'];

// ---------------------------------------------------------------------------
// 1) 数据层：15 原子 × 4 阶段 = 60 格，27 配方，EN 不进入数据
// ---------------------------------------------------------------------------
console.log('\n1) 数据层：60 格与 27 配方');
ok(GM.PHASES.length === 4, '阶段数 4', GM.PHASES.length);
ok(GM.ATOMS.length === 15, '目标原子 15 个', GM.ATOMS.length);
ok(GM.ATOMS.every(function (a) { return a.id !== 'EN'; }), '原子清单里没有 EN');

let cellCount = 0, illegalCount = 0, badCell = [];
GM.PHASES.forEach(function (phase) {
  GM.ATOMS.forEach(function (atom) {
    const c = GM.MATRIX[phase] && GM.MATRIX[phase][atom.id];
    if (!c) { badCell.push('缺格 ' + phase + '/' + atom.id); return; }
    cellCount++;
    if (c.cellId !== 'MX-' + phase.toUpperCase() + '-' + atom.id) badCell.push('cellId 不符 ' + c.cellId);
    if (typeof c.legal !== 'boolean') badCell.push('legal 非布尔 ' + c.cellId);
    if (['strong', 'moderate', 'weak', 'mixed'].indexOf(c.evidenceStatus) < 0) badCell.push('evidence 非法 ' + c.cellId);
    if (!c.legal) {
      illegalCount++;
      if (!c.illegalReason) badCell.push('N/A 格缺原因 ' + c.cellId);
      if (!c.goalRule) badCell.push('N/A 格缺 goalRule ' + c.cellId);
    }
  });
});
ok(cellCount === 60, '矩阵 60 格齐全', cellCount);
ok(illegalCount === 20, 'N/A 格 20 个', illegalCount);
ok(badCell.length === 0, '每格 cellId / legal / evidence / 原因齐全', badCell);

let weakBad = [];
GM.PHASES.forEach(function (phase) {
  GM.ATOMS.forEach(function (atom) {
    const c = GM.MATRIX[phase][atom.id];
    if (c.legal && c.evidenceStatus === 'weak' && c.targets) weakBad.push(c.cellId + ' 弱证据仍带 targets');
  });
});
ok(weakBad.length === 0, '合法弱证据格不携带数值 targets', weakBad);

ok(GM.COMPOSITES.length === 27, '配方 27 个', GM.COMPOSITES.length);
let badRecipe = [];
const atomIds = GM.ATOMS.map(function (a) { return a.id; });
GM.COMPOSITES.forEach(function (c, i) {
  if (c.id !== 'C' + (i + 1 < 10 ? '0' : '') + (i + 1)) badRecipe.push('编号不连续 ' + c.id);
  if (c.atoms.indexOf('EN') >= 0) badRecipe.push(c.id + ' atoms 含 EN');
  if (c.docAtoms && c.docAtoms.indexOf('EN') >= 0) badRecipe.push(c.id + ' docAtoms 含 EN');
  c.atoms.forEach(function (id) { if (atomIds.indexOf(id) < 0) badRecipe.push(c.id + ' 未知原子 ' + id); });
  if (SIX_MODES.indexOf(c.mode) < 0 && c.mode !== 'veto') badRecipe.push(c.id + ' mode 非法 ' + c.mode);
  if (c.guardrailAction && c.guardrailAction !== 'veto') badRecipe.push(c.id + ' guardrailAction 非法');
  (c.modes || []).forEach(function (m) {
    if (SIX_MODES.indexOf(m) < 0) badRecipe.push(c.id + ' modes 含 ' + m);
  });
});
ok(badRecipe.length === 0, '配方编号 / 原子 / 模式 / 护栏动作均合法', badRecipe);
ok(GM.COMPOSITES.filter(function (c) { return c.id === 'C11' || c.id === 'C12' || c.id === 'C22' || c.id === 'C24'; })
  .every(function (c) { return !c.docAtoms && !c.aliasNote; }), 'C11/C12/C22/C24 已删除 docAtoms 与 aliasNote');
const c18 = GM.COMPOSITES.filter(function (c) { return c.id === 'C18'; })[0];
const c19 = GM.COMPOSITES.filter(function (c) { return c.id === 'C19'; })[0];
ok(c18.mode === 'cap' && c18.guardrailAction === 'veto', 'C18 = cap + guardrailAction veto', [c18.mode, c18.guardrailAction]);
ok(c19.mode === 'monitor' && !c19.guardrailAction, 'C19 = monitor 且无 veto', [c19.mode, c19.guardrailAction]);
ok(GM.CONFLICT_EDGES.every(function (e) { return e.mode !== 'veto'; }), '冲突边不出现 veto 作为模式');

// ---------------------------------------------------------------------------
// 2) 入口归一：EN → G-SLE、去重、未知、禁用、名额
// ---------------------------------------------------------------------------
console.log('\n2) 入口归一与错误码');
const en = goals.normalizeGoals(['EN']);
ok(en.ok && en.atoms[0] === 'G-SLE', '旧值 EN 归一为 G-SLE', en.atoms);
ok(!en.goals.some(function (id) { return id === 'EN'; }), '归一结果不再出现 EN');
ok(en.aliases.length === 1 && en.aliases[0].from === 'EN' && en.aliases[0].to === 'G-SLE', '别名映射被记录', en.aliases);
const dup = goals.normalizeGoals(['P-POW', 'P-POW']);
ok(dup.ok && dup.atoms.length === 1 && dup.duplicates[0] === 'P-POW', '重复项去重并记录', dup.duplicates);
const unknown = goals.normalizeGoals(['X-FAKE']);
ok(!unknown.ok && unknown.errors[0].code === goals.ERROR_CODES.UNKNOWN, '未知 ID → E_GOAL_UNKNOWN');
const forbidden = goals.normalizeGoals(['G-MED']);
ok(!forbidden.ok && forbidden.errors[0].code === goals.ERROR_CODES.FORBIDDEN, 'G-MED → E_GOAL_FORBIDDEN');
const immOrder = goals.normalizeGoals(['G-IMM', 'P-POW', 'P-SPD', 'B-CUT']);
ok(immOrder.ok && immOrder.atoms.length === 4 && immOrder.atoms[3] === 'G-IMM', 'G-IMM 归一化到末尾', immOrder.atoms);
const quotaNorm = goals.normalizeGoals(['P-POW', 'P-SPD', 'P-HYP', 'P-END']);
ok(!quotaNorm.ok && quotaNorm.errors[0].code === goals.ERROR_CODES.QUOTA, '4 个主目标 → E_GOAL_QUOTA');

// ---------------------------------------------------------------------------
// 3) 非法阶段组合：直接拒绝，不产半成品计划
// ---------------------------------------------------------------------------
console.log('\n3) 非法阶段组合拒绝');
const badCases = [
  ['maintain', ['B-CUT'], '维持期禁减脂'],
  ['peak', ['B-CUT'], '微调期禁动缺口'],
  ['cut', ['B-GAIN'], '减脂期禁增重'],
  ['recover', ['P-POW'], '恢复期不排爆发课']
];
badCases.forEach(function (t) {
  const r = goals.resolveGoalPlan(t[0], t[1], {});
  ok(!r.ok && r.goalPlan === null && r.error.code === goals.ERROR_CODES.PHASE_ILLEGAL, t[2] + ' → E_GOAL_PHASE_ILLEGAL', r.error);
  ok(r.blocked.length >= 1 && r.blocked[0].blockerType === 'goal_illegal', t[2] + ' 记录被拦目标');
});
const badPhase = goals.resolveGoalPlan('bulk', ['P-POW'], {});
ok(!badPhase.ok && badPhase.error.code === goals.ERROR_CODES.PHASE_ILLEGAL, '未知阶段 → E_GOAL_PHASE_ILLEGAL');
const mixedIn = goals.resolveGoalPlan('maintain', ['P-POW', 'B-CUT'], {});
ok(!mixedIn.ok && mixedIn.goalPlan === null, '一个目标非法 → 整次拒绝，不返回部分计划');

const gainEarly = goals.resolveGoalPlan('maintain', ['B-GAIN'], { daysToWeigh: 30 });
ok(!gainEarly.ok && gainEarly.error.code === goals.ERROR_CODES.PHASE_ILLEGAL, 'B-GAIN 距称重 30 天 → 拒绝');
const gainLater = goals.resolveGoalPlan('maintain', ['B-GAIN'], { daysToWeigh: 90 });
ok(gainLater.ok, 'B-GAIN 距称重 90 天 → 允许', gainLater.error);
const holdTight = goals.resolveGoalPlan('cut', ['B-HOLD'], { gapPct: 1.6 });
ok(!holdTight.ok && holdTight.error.code === goals.ERROR_CODES.PHASE_ILLEGAL, 'B-HOLD cut 且 gap 1.6% → 拒绝');
const holdOk = goals.resolveGoalPlan('cut', ['B-HOLD'], { gapPct: 1.4 });
ok(holdOk.ok, 'B-HOLD cut 且 gap 1.4% → 允许', holdOk.error);

// ---------------------------------------------------------------------------
// 4) 优先级与让步裁决
// ---------------------------------------------------------------------------
console.log('\n4) 优先级栈与六种让步');
const c02 = goals.resolveGoalPlan('maintain', ['P-POW', 'B-HOLD'], {}).goalPlan;
ok(eq(c02.composites, ['C02']), 'POW+HOLD 命中 C02', c02.composites);
ok(c02.lead === 'P-POW', 'C02 主导 P-POW', c02.lead);
ok(hasMode(c02.concessions, 'cap') && c02.concessions.filter(function (c) { return c.goalId === 'B-HOLD'; })[0].mode === 'cap', 'HOLD 让步 cap');

const c01 = goals.resolveGoalPlan('cut', ['P-POW', 'B-CUT'], {}).goalPlan;
ok(c01.lead === 'B-CUT', 'C01 主导 B-CUT', c01.lead);
ok(c01.concessions[0].goalId === 'P-POW' && c01.concessions[0].mode === 'cap', 'POW 让步 cap', c01.concessions[0]);
ok(c01.targets && c01.targets.energyBalance.min === -400 && c01.targets.energyBalance.max === -300, 'C01 能量封顶 -400~-300', c01.targets && c01.targets.energyBalance);

const c10normal = goals.resolveGoalPlan('maintain', ['P-END', 'G-SLE'], {}).goalPlan;
ok(c10normal.lead === 'P-END', 'C10 无护栏红灯 → P-END 主导', c10normal.lead);
const c10red = goals.resolveGoalPlan('maintain', ['P-END', 'G-SLE'], { guardrailRed: ['G-SLE'] }).goalPlan;
ok(c10red.lead === 'G-SLE', 'C10 护栏红灯 → G-SLE 越级主导', c10red.lead);

const c11 = goals.resolveGoalPlan('maintain', ['B-HOLD', 'G-SLE'], {}).goalPlan;
ok(c11.lead === 'B-HOLD' && hasMode(c11.concessions, 'monitor'), 'C11 主导 HOLD，SLE 只监测');
const c18plan = goals.resolveGoalPlan('cut', ['B-CUT', 'G-EA'], {}).goalPlan;
const c18cut = c18plan.concessions.filter(function (c) { return c.goalId === 'B-CUT'; })[0];
ok(c18plan.lead === 'G-EA', 'C18 主导 G-EA', c18plan.lead);
ok(c18cut && c18cut.mode === 'cap' && c18cut.guardrailAction === 'veto', 'C18 让步 cap + guardrailAction veto', c18cut);
const c19plan = goals.resolveGoalPlan('maintain', ['P-END', 'G-IMM'], {}).goalPlan;
ok(c19plan.lead === 'P-END', 'C19 只有监测原子时不把 G-IMM 当 lead', c19plan.lead);
ok(c19plan.concessions.every(function (c) { return c.mode !== 'veto'; }), 'C19 的让步不出现 veto');

const noRecipe = goals.resolveGoalPlan('maintain', ['P-POW', 'P-SPD'], {}).goalPlan;
ok(noRecipe.lead === 'P-SPD', '无配方时按 L3 SPD > POW', noRecipe.lead);

let badConcession = [];
[ c02, c01, c10normal, c10red, c11, c18plan, c19plan ].forEach(function (plan) {
  plan.concessions.forEach(function (c) {
    if (SIX_MODES.indexOf(c.mode) < 0) badConcession.push(c.goalId + ' mode=' + c.mode);
    if (c.mode === 'veto') badConcession.push(c.goalId + ' mode=veto');
    if (c.guardrailAction && c.guardrailAction !== 'veto') badConcession.push(c.goalId + ' guardrailAction=' + c.guardrailAction);
    if (!c.reason || !c.phaseWindow) badConcession.push(c.goalId + ' 缺 reason/phaseWindow');
  });
});
ok(badConcession.length === 0, '所有 concessions.mode 属于六种，veto 只在 guardrailAction', badConcession);
ok([c02, c01, c10normal, c10red, c11, c18plan, c19plan].every(function (p) {
  return p.goals.filter(function (g) { return g.countsTowardQuota; }).length <= 3 &&
    p.goals.filter(function (g) { return !g.countsTowardQuota; }).every(function (g) { return g.id === 'G-IMM' && g.role === 'monitor'; });
}), '每份计划的配额与 role 合法');

// ---------------------------------------------------------------------------
// 5) 名额上限：3 个主目标 + 1 个 G-IMM 监测
// ---------------------------------------------------------------------------
console.log('\n5) 名额上限');
const quotaPlan = goals.resolveGoalPlan('maintain', ['P-POW', 'P-SPD', 'P-HYP', 'P-END'], {});
ok(!quotaPlan.ok && quotaPlan.error.code === goals.ERROR_CODES.QUOTA, '4 个合法主目标仍被名额拒绝');
const threePlusImm = goals.resolveGoalPlan('maintain', ['P-POW', 'P-SPD', 'P-END', 'G-IMM'], {}).goalPlan;
ok(threePlusImm.atoms.length === 4 && threePlusImm.atoms[3] === 'G-IMM', '3 主目标 + G-IMM 可共存');
ok(goalOf(threePlusImm, 'G-IMM').role === 'monitor' && goalOf(threePlusImm, 'G-IMM').countsTowardQuota === false, 'G-IMM role=monitor 且不占名额');
ok(threePlusImm.goals.filter(function (g) { return g.countsTowardQuota; }).length === 3, '计入名额的仍为 3 个');
const immOnly = goals.resolveGoalPlan('maintain', ['G-IMM'], {}).goalPlan;
ok(immOnly.lead === null, '仅 G-IMM 时没有 lead', immOnly.lead);
ok(goalOf(immOnly, 'G-IMM').role === 'monitor', '仅 G-IMM 时 role=monitor');

// ---------------------------------------------------------------------------
// 6) 弱证据：只监测，不带数值处方
// ---------------------------------------------------------------------------
console.log('\n6) 弱证据目标无数值');
const skl = goals.resolveGoalPlan('maintain', ['P-SKL'], {}).goalPlan;
ok(skl.evidenceStatus === 'weak' && skl.targets === null, 'P-SKL 单独 → weak 且 targets=null', [skl.evidenceStatus, skl.targets]);
ok(skl.notes.some(function (n) { return /证据偏弱/.test(n); }), 'notes 写明证据偏弱');
const c12 = goals.resolveGoalPlan('cut', ['B-CUT', 'G-SLE'], {}).goalPlan;
ok(c12.composites[0] === 'C12' && c12.evidenceStatus === 'weak' && c12.targets === null, 'C12 weak → targets=null');
const c24 = goals.resolveGoalPlan('cut', ['P-SKL', 'G-SLE'], {}).goalPlan;
ok(c24.composites[0] === 'C24' && c24.targets === null, 'C24 weak → targets=null');
const c11weak = goals.resolveGoalPlan('maintain', ['B-HOLD', 'G-SLE'], {}).goalPlan;
ok(c11weak.targets === null, 'C11 weak → targets=null');
const immWeak = goals.resolveGoalPlan('maintain', ['G-IMM'], {}).goalPlan;
ok(immWeak.evidenceStatus === 'weak' && immWeak.targets === null, 'G-IMM 只监测、无 targets');

let strongHasTargets = 0;
[['cut', ['P-POW', 'B-CUT']], ['cut', ['P-END', 'B-CUT']], ['recover', ['B-REFUEL']]].forEach(function (t) {
  const p = goals.resolveGoalPlan(t[0], t[1], {}).goalPlan;
  if (p.targets) strongHasTargets++;
});
ok(strongHasTargets === 3, '强/中证据目标仍输出数值区间', strongHasTargets);

// ---------------------------------------------------------------------------
// 7) 零目标：空计划，供上层保持原行为
// ---------------------------------------------------------------------------
console.log('\n7) 零目标空输出');
const empty = goals.resolveGoalPlan('cut', [], {});
ok(empty.ok && empty.error === null, '零目标不报错');
const ep = empty.goalPlan;
ok(ep.goals.length === 0 && ep.atoms.length === 0 && ep.composites.length === 0, 'goals/atoms/composites 全空');
ok(ep.legality === 'legal' && ep.lead === null && ep.concessions.length === 0, 'legality=legal、lead=null、无让步');
ok(ep.targets === null && ep.cells.length === 0 && ep.notes.length === 0, 'targets/cells/notes 为空');
ok(ep.phase === 'cut' && ep.evidenceStatus === 'strong', '仍带回阶段与默认证据状态');
ok(empty.blocked.length === 0, '零目标不产生 blocked');

// ---------------------------------------------------------------------------
// 8) goalAdherence：独立评分，不进总分
// ---------------------------------------------------------------------------
console.log('\n8) goalAdherence');
const adEmpty = goals.goalAdherence({}, ep, {});
ok(adEmpty.score === null && adEmpty.level === 'unknown' && adEmpty.unavailableReason === 'no_goals', '零目标 → unknown/no_goals');
const adWeak = goals.goalAdherence({}, skl, {});
ok(adWeak.score === null && adWeak.unavailableReason === 'weak_evidence', '只有弱证据 → unknown/weak_evidence');

const powPlan = goals.resolveGoalPlan('maintain', ['P-POW'], {}).goalPlan;
const adNoData = goals.goalAdherence({}, powPlan, {});
ok(adNoData.score === null && adNoData.unavailableReason === 'no_startTime', '缺 startTime → no_startTime', adNoData);
const adGood = goals.goalAdherence({
  training: { startTime: '10:00', quality: 4 },
  meals: [{ time: '08:00', carbs: 50 }]
}, powPlan, {});
ok(adGood.score === 90 && adGood.level === 'ok', '时机 100 + 质量 80 → 90 / ok', adGood);
ok(adGood.components.length === 2 && adGood.components.reduce(function (s, c) { return s + c.weight; }, 0) === 1, '两项权重合计 1.0', adGood.components);
let badComponent = [];
adGood.components.forEach(function (c) {
  if (['fuelTiming', 'sessionQuality', 'refeedCadence'].indexOf(c.id) < 0) badComponent.push(c.id);
  if (!c.sourceFields || !c.sourceFields.length) badComponent.push(c.id + ' 缺 sourceFields');
});
ok(badComponent.length === 0, '组件只允许文档定义的三类，且带 sourceFields', badComponent);

const cutPlan = goals.resolveGoalPlan('cut', ['B-CUT'], {}).goalPlan;
const adRefeed = goals.goalAdherence({}, cutPlan, { refeed: { okDays: 5, totalDays: 7 } });
ok(adRefeed.score === 71 && adRefeed.level === 'amber', 'refeed 5/7 → 71 / amber', adRefeed);
ok(adRefeed.components[0].id === 'refeedCadence', 'CUT 只统计 refeed 节奏');

// ---------------------------------------------------------------------------
// 9) goalBlockers：不是告警，引用 owner 规则
// ---------------------------------------------------------------------------
console.log('\n9) goalBlockers');
const noBlock = goals.goalBlockers(ep, {}, {});
ok(noBlock.length === 0, '零目标 → 无 blocker');

const giPlan = goals.resolveGoalPlan('maintain', ['G-GI'], {}).goalPlan;
const giBlock = goals.goalBlockers(giPlan, {}, {});
ok(giBlock.length === 1 && giBlock[0].blockerType === 'phase_suppressed', 'maintain 的 GI → phase_suppressed');
ok(giBlock[0].ruleId === 'GI-01' && giBlock[0].action === 'monitor' && giBlock[0].suppressedByPhase === true, 'GI blocker 引用 GI-01 / monitor / 阶段抑制');

const endSle = goals.resolveGoalPlan('cut', ['P-END', 'G-SLE'], {}).goalPlan;
const sleep55 = goals.goalBlockers(endSle, { sleep: { hours: 5.5 } }, {});
ok(sleep55.length === 1 && sleep55[0].ruleId === 'SLE-01', '睡眠 5.5h → 一条 SLE-01 引用', sleep55);
ok(sleep55[0].goalId === 'P-END' && sleep55[0].level === 'red' && sleep55[0].action === 'veto', 'SLE 红灯否决 P-END 的加量', sleep55[0]);
const sleep62 = goals.goalBlockers(endSle, { sleep: { hours: 6.2 } }, {});
ok(sleep62[0].level === 'amber' && sleep62[0].action === 'cap', '睡眠 6.2h → amber / cap', sleep62[0]);

const eaPlan = goals.resolveGoalPlan('cut', ['B-CUT', 'G-EA'], {}).goalPlan;
const eaMissing = goals.goalBlockers(eaPlan, {}, {});
ok(eaMissing.some(function (b) { return b.goalId === 'G-EA' && b.blockerType === 'data_missing' && b.action === 'monitor'; }), '缺 bodyFatPct → data_missing');
const eaLow = goals.goalBlockers(eaPlan, {}, { bodyFatPct: 12, eaKcalKgFfm: 28 });
const eaBlock = eaLow.filter(function (b) { return b.goalId === 'G-EA'; })[0];
ok(eaBlock && eaBlock.blockerType === 'guardrail' && eaBlock.level === 'red' && eaBlock.action === 'veto', 'EA<30 → guardrail red veto', eaBlock);
ok(eaBlock && eaBlock.ruleId === null, 'G-EA 没有 owner 规则，ruleId 留空', eaBlock && eaBlock.ruleId);

const sklBlock = goals.goalBlockers(skl, {}, {});
ok(sklBlock.some(function (b) { return b.blockerType === 'evidence_weak' && b.action === 'monitor' && b.ruleId === null; }), '弱证据 → evidence_weak / monitor / ruleId=null');

const giPeak = goals.resolveGoalPlan('peak', ['G-GI'], {}).goalPlan;
const giPeakBlock = goals.goalBlockers(giPeak, { giSymptoms: { nausea: 2 } }, {});
ok(giPeakBlock.length === 1 && giPeakBlock[0].blockerType === 'guardrail' && giPeakBlock[0].ruleId === 'GI-01' && giPeakBlock[0].action === 'cap', 'peak 胃肠≥2 → guardrail cap', giPeakBlock);

const legacy = goals.goalBlockers({ phase: 'maintain', atoms: ['B-CUT'], goals: [] }, {}, {});
ok(legacy.some(function (b) { return b.blockerType === 'goal_illegal' && b.ruleId === 'GOAL-01' && b.action === 'veto'; }), '阶段被改后旧目标 → goal_illegal / GOAL-01');

let badBlocker = [];
[sleep55, sleep62, eaMissing, eaLow, sklBlock, giPeakBlock, legacy].forEach(function (list) {
  list.forEach(function (b) {
    if (['guardrail', 'phase_suppressed', 'evidence_weak', 'data_missing', 'goal_illegal', 'goal_conflict'].indexOf(b.blockerType) < 0) badBlocker.push(b.blockerType);
    if (['red', 'amber', 'info'].indexOf(b.level) < 0) badBlocker.push('level=' + b.level);
    if (['veto', 'cap', 'sequence', 'monitor'].indexOf(b.action) < 0) badBlocker.push('action=' + b.action);
    if (!b.message || typeof b.suppressedByPhase !== 'boolean') badBlocker.push(b.goalId + ' 缺字段');
  });
});
ok(badBlocker.length === 0, 'blockerType / level / action / 必填字段合法', badBlocker);

// ---------------------------------------------------------------------------
// 10) B-REFUEL 的碳水双区间
// ---------------------------------------------------------------------------
console.log('\n10) B-REFUEL 碳水区间数组');
const refuel = goals.resolveGoalPlan('recover', ['B-REFUEL'], {}).goalPlan;
const carb = refuel.targets && refuel.targets.carb;
ok(Array.isArray(carb) && carb.length === 2, 'carb 是两个区间的数组', carb);
ok(eq(carb, [[4, 7], [8, 12]]), 'carb = [[4,7],[8,12]]', carb);
ok(!(carb && typeof carb === 'object' && !Array.isArray(carb) && 'min' in carb), 'carb 不是 {min,max} 连续区间');
ok(carb[0][1] < carb[1][0], '两段不连续：7 < 8，没有 7–8 中间值', [carb[0][1], carb[1][0]]);
const refuelCopy = goals.resolveGoalPlan('recover', ['B-REFUEL'], {}).goalPlan;
refuelCopy.targets.carb[0][0] = 99;
ok(refuel.targets.carb[0][0] === 4, 'targets 为深拷贝，不污染数据层');

// ---------------------------------------------------------------------------
// 11) G4 数据旧值清理、护栏红灯排序、goalAdherence 三组件
// ---------------------------------------------------------------------------
console.log('\n11) G4 数据旧值与叠加口径');
ok(c19.lead === 'P-END', 'C19 主导 P-END（G-IMM 只监测）', c19.lead);
const c23 = GM.COMPOSITES.filter(function (c) { return c.id === 'C23'; })[0];
ok(c23.lead === 'B-HOLD', 'C23 主导 B-HOLD（生长/医疗优先）', c23.lead);
const monitorMode = GM.CONCESSION_MODES.filter(function (m) { return m.mode === 'monitor'; })[0];
ok(eq(monitorMode.examples, ['SKL/IMM']), 'monitor 示例只保留 SKL/IMM', monitorMode.examples);
ok(GM.CONCESSION_MODES.every(function (m) {
  return m.examples.every(function (x) { return x.split(/[^A-Z]+/).indexOf('EN') < 0; });
}), '让步模式示例不出现旧值 EN（按目标 token 判定）');

const giFirst = goals.resolveGoalPlan('peak', ['P-END', 'G-GI', 'G-SLE'], { guardrailRed: ['G-SLE', 'G-GI'] }).goalPlan;
ok(giFirst.lead === 'G-GI', '双护栏红灯按 G-EA→G-GI→G-SLE 取 G-GI', giFirst.lead);
const eaFirst = goals.resolveGoalPlan('cut', ['B-CUT', 'G-EA', 'G-SLE'], { guardrailRed: ['G-SLE', 'G-EA'] }).goalPlan;
ok(eaFirst.lead === 'G-EA', 'EA 红灯优先于 SLE', eaFirst.lead);
const immOnlyPlan = goals.resolveGoalPlan('cut', ['P-END', 'G-IMM'], { guardrailRed: ['G-IMM'] }).goalPlan;
ok(immOnlyPlan.lead === 'P-END', '即使 guardrailRed 误含 G-IMM，也不让它主导', immOnlyPlan.lead);

const triple = goals.resolveGoalPlan('cut', ['P-POW', 'B-CUT'], {}).goalPlan;
ok(triple.composites[0] === 'C01', 'POW+CUT 命中 C01', triple.composites);
const ad3 = goals.goalAdherence(
  { training: { startTime: '10:00', quality: 3 }, meals: [{ time: '08:00', carbs: 50 }] },
  triple, { refeed: { rate: 1 } }
);
ok(ad3.components.length === 3, 'POW+CUT 三组件齐全', ad3.components.map(function (c) { return c.id; }));
ok(eq(ad3.components.map(function (c) { return c.id; }), ['fuelTiming', 'sessionQuality', 'refeedCadence']), '组件顺序固定');
ok(eq(ad3.components.map(function (c) { return c.weight; }), [0.34, 0.33, 0.33]), '三组件等权 0.34/0.33/0.33', ad3.components.map(function (c) { return c.weight; }));
ok(ad3.score === 87 && ad3.level === 'ok', '100×.34 + 60×.33 + 100×.33 = 87', ad3.score);

const ad2 = goals.goalAdherence({ training: { quality: 3 } }, triple, { refeed: { rate: 1 } });
ok(ad2.components.length === 2 && eq(ad2.components.map(function (c) { return c.weight; }), [0.5, 0.5]), '缺失组件跳过并重归一 0.5/0.5', ad2.components);
ok(ad2.score === 80, '60×0.5 + 100×0.5 = 80', ad2.score);

const ad1 = goals.goalAdherence({ training: { quality: 5 } }, triple, {});
ok(ad1.components.length === 1 && ad1.components[0].weight === 1 && ad1.score === 100, '只剩 1 个组件仍评分', ad1);

// ---------------------------------------------------------------------------
// 12) G5 goalView：页面只读视图（无目标等价、弱证据不出数值、unknown 不显示 0）
// ---------------------------------------------------------------------------
console.log('\n12) G5 goalView');
ok(goals.goalView(null).hasGoals === false && goals.goalView(undefined).hasGoals === false, '无 plan → hasGoals=false');
const viewLog = { training: { startTime: '10:00', quality: 4 }, meals: [{ time: '08:00', carbs: 50 }] };
const viewCutPlan = goals.resolveGoalPlan('cut', ['P-POW', 'B-CUT'], {}).goalPlan;
const cutView = goals.goalView(viewCutPlan, goals.goalAdherence(viewLog, viewCutPlan, { refeed: { rate: 1 } }), [], { targetWeightKg: 56 });
ok(cutView.hasGoals === true && cutView.leadName === '减脂', '有目标时输出 leadName', cutView.leadName);
ok(cutView.goalNames.length === 2 && cutView.goalNames[1].roleLabel === '主导' && cutView.goalNames[0].roleLabel === '让步', '目标角色标签来自 plan.goals', cutView.goalNames);
ok(cutView.targetLines.map(function (t) { return t.key; }).join(',') === 'protein,carb,fat,energyBalance', '目标区间按 plan.targets 输出', cutView.targetLines);
ok(cutView.targetLines[0].text === '2–2.4 g/kg', '区间文案保留单位', cutView.targetLines[0].text);
ok(cutView.weight && cutView.weight.kg === 56, '强证据 + 目标体重 → 可画体重参考线', cutView.weight);
ok(cutView.adherence.show && !cutView.adherence.unknown && cutView.adherence.scoreText === '93 分', '依从卡：score 独立展示', cutView.adherence);
ok(cutView.adherence.components.length === 3 && cutView.adherence.components[0].weightText === '34%', '组件权重 34/33/33', cutView.adherence.components);

const weakPlan = goals.resolveGoalPlan('cut', ['P-SKL'], {}).goalPlan;
const weakView = goals.goalView(weakPlan, goals.goalAdherence({}, weakPlan, {}), [], { targetWeightKg: 56 });
ok(weakView.weak === true && weakView.targetLines.length === 0 && weakView.weight === null, '弱证据 → 不给数值线', { t: weakView.targetLines, w: weakView.weight });
ok(weakView.evidenceNote.indexOf('不给数值线') >= 0, '弱证据留文字提示', weakView.evidenceNote);
ok(weakView.adherence.unknown === true && weakView.adherence.scoreText === '' && weakView.adherence.levelLabel === '数据不足', 'unknown 不显示 0 分', weakView.adherence);

const noDataPlan = goals.resolveGoalPlan('cut', ['P-END'], {}).goalPlan;
const noDataView = goals.goalView(noDataPlan, goals.goalAdherence({}, noDataPlan, {}), [], {});
ok(noDataView.adherence.unknown === true && noDataView.adherence.hint === '没填训练开始时间，补给时机不评分', '缺数据时给出未评分原因', noDataView.adherence);
ok(noDataView.weight === null, '无目标体重 → 不画参考线');

// ---------------------------------------------------------------------------
// 13) G6 setGoals 写入校验：整次拒绝、错误码、单次补丁
// ---------------------------------------------------------------------------
console.log('\n13) G6 validateGoalWrite');
function writeErr(input, profile, ctx) {
  const r = goals.validateGoalWrite(input, profile, ctx);
  return r.ok ? null : r.error.code;
}
const cutProfile = { phase: 'cut', weightKg: 58, targetWeightKg: 57 };
ok(writeErr({ goals: ['P-POW', 'P-END', 'P-SKL', 'B-CUT'], goalEffectiveDate: '2026-11-08' }, cutProfile) === 'E_GOAL_QUOTA', '超过 3 个主目标 → E_GOAL_QUOTA');
ok(writeErr({ goals: ['B-CUT', 'B-CUT'], goalEffectiveDate: '2026-11-08' }, cutProfile) === 'E_GOAL_DUPLICATE', '重复目标 → E_GOAL_DUPLICATE');
ok(writeErr({ goals: ['EN', 'G-SLE'], goalEffectiveDate: '2026-11-08' }, cutProfile) === 'E_GOAL_DUPLICATE', 'EN 与 G-SLE 等价重复仍判重复');
ok(writeErr({ goals: ['X-NO'], goalEffectiveDate: '2026-11-08' }, cutProfile) === 'E_GOAL_UNKNOWN', '未知 ID → E_GOAL_UNKNOWN');
ok(writeErr({ goals: ['G-MED'], goalEffectiveDate: '2026-11-08' }, cutProfile) === 'E_GOAL_FORBIDDEN', 'G-MED 不可选 → E_GOAL_FORBIDDEN');
ok(writeErr({ goals: ['B-CUT'], goalEffectiveDate: '2026-11-08' }, { phase: 'maintain' }) === 'E_GOAL_PHASE_ILLEGAL', 'maintain 期 B-CUT → E_GOAL_PHASE_ILLEGAL');
ok(writeErr({ goals: ['B-HOLD'], goalEffectiveDate: '2026-11-08' }, { phase: 'cut' }, { gapPct: 2 }) === 'E_GOAL_PHASE_ILLEGAL', 'cut 期 B-HOLD 且 gapPct>1.5 → 条件不满足');
ok(writeErr({ goals: ['B-CUT'], goalEffectiveDate: '2026-11-08' }, { phase: 'cut', weightKg: 58, targetWeightKg: 57 }, { gapPct: 1.2 }) === null, 'cut 期 B-HOLD 条件满足可写', writeErr({ goals: ['B-HOLD'], goalEffectiveDate: '2026-11-08' }, { phase: 'cut' }, { gapPct: 1.2 }));
ok(writeErr({ goals: ['B-CUT'] }, cutProfile) === 'E_GOAL_EMPTY_DATE', '缺生效日期 → E_GOAL_EMPTY_DATE');
ok(writeErr({ goals: ['B-CUT'], goalEffectiveDate: '2026-02-30' }, cutProfile) === 'E_GOAL_EMPTY_DATE', '无效日期 → E_GOAL_EMPTY_DATE');
ok(writeErr({ goals: ['B-CUT'], goalEffectiveDate: '2026-11-08', bodyFatPct: 2.5 }, cutProfile) === 'E_GOAL_BODYFAT', 'bodyFatPct 越界 → E_GOAL_BODYFAT');

const writeOk = goals.validateGoalWrite({ goals: ['G-SLE', 'B-CUT'], goalEffectiveDate: '2026-11-08' }, cutProfile, { gapPct: 1.2 });
ok(writeOk.ok === true, '合法组合整次通过');
ok(eq(writeOk.goals, ['G-SLE', 'B-CUT']) && writeOk.goalSource === 'nutritionist', '写入目标顺序与固定来源', writeOk);
ok(writeOk.goalEffectiveDate === '2026-11-08' && writeOk.bodyFatPct === null, '写入生效日期，未传体脂时为 null', [writeOk.goalEffectiveDate, writeOk.bodyFatPct]);
ok(writeOk.goalPlan && writeOk.goalPlan.legality === 'legal', '通过后返回 legal plan', writeOk.goalPlan && writeOk.goalPlan.legality);

const writeImm = goals.validateGoalWrite({ goals: ['B-CUT', 'G-IMM'], goalEffectiveDate: '2026-11-08' }, cutProfile);
ok(writeImm.ok && writeImm.goals.indexOf('G-IMM') === 1, 'G-IMM 不占名额、排在最后', writeImm.goals);

const writeClear = goals.validateGoalWrite({ goals: [], goalEffectiveDate: '' }, cutProfile);
ok(writeClear.ok && eq(writeClear.goals, []) && writeClear.goalEffectiveDate === '', '空目标允许清空且不要求日期', writeClear);

const viewChips = goals.goalChips('cut', ['B-CUT', 'G-SLE'], { gapPct: 1.2 });
ok(viewChips.hasGoals && viewChips.chips.length === 2 && viewChips.conflict === false, 'goalChips 有目标时出 chips');
ok(goals.goalChips('cut', [], {}).hasGoals === false, 'goalChips 无目标时 hasGoals=false');
ok(goals.goalChips('maintain', ['B-CUT'], {}).conflict === true, 'goalChips 阶段冲突时带标记');

const reviewView = goals.goalView(triple, null, [{ goalId: 'B-GAIN', blockerType: 'goal_illegal', level: 'red', action: 'veto', message: 'x' }], {});
ok(reviewView.compositeNames.length === 1 && reviewView.compositeNames[0].id === 'C01', 'goalView 输出复合配方名', reviewView.compositeNames);
ok(reviewView.strategyText && reviewView.strategyText.indexOf('C01') >= 0, 'goalView 输出主导策略文本', reviewView.strategyText);
ok(reviewView.blockers[0].blockerTypeLabel === '阶段不合法', 'goalView 阻断项带中文类型', reviewView.blockers[0]);

// ---------------------------------------------------------------------------
// 14) G8 目标设置页：名额实时计数、置灰原因、调序、错误码映射
// ---------------------------------------------------------------------------
console.log('\n14) G8 目标设置页');
const draft = require(path.join(__dirname, '../miniprogram/utils/goalDraft.js'));

// 名额实时计数
const q0 = draft.quota([]);
ok(q0.main === 0 && q0.monitor === 0 && q0.maxMain === 3 && q0.maxMonitor === 1, '空选择 0/3、0/1', q0);
const q3 = draft.quota(['P-POW', 'P-SPD', 'P-END', 'G-IMM']);
ok(q3.main === 3 && q3.monitor === 1 && q3.mainFull && q3.monitorFull && !q3.over, '3 主目标 + G-IMM：名额满且不越界', q3);
ok(draft.quota(['P-POW', 'P-SPD', 'P-END', 'P-HYP']).over === true, '4 主目标 → over 标记');
ok(draft.quota(['G-IMM']).main === 0 && draft.quota(['G-IMM']).monitor === 1, 'G-IMM 只占监测名额');

// 置灰：阶段不合法 / 条件不满足 / G-MED
function st(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
const maintainStates = draft.atomStates('maintain', { today: '2026-11-08' });
ok(st(maintainStates, 'B-CUT').allowed === false && /维持期/.test(st(maintainStates, 'B-CUT').reason),
  'maintain 期 B-CUT 置灰并写明原因', st(maintainStates, 'B-CUT').reason);
ok(st(maintainStates, 'G-MED').allowed === false && /人工处理/.test(st(maintainStates, 'G-MED').reason),
  'G-MED 永远置灰并说明人工处理', st(maintainStates, 'G-MED').reason);
const gainBlocked = st(draft.atomStates('maintain', { today: '2026-11-08', daysToWeigh: 40 }), 'B-GAIN');
ok(gainBlocked.allowed === false && /需满足：非赛季且距称重>84 天/.test(gainBlocked.reason),
  'B-GAIN 距称重 40 天 → 置灰并显示需满足条件', gainBlocked.reason);
const gainOk = st(draft.atomStates('maintain', { today: '2026-11-08', daysToWeigh: 100 }), 'B-GAIN');
ok(gainOk.allowed === true && gainOk.conditionMet === true && /非赛季且距称重>84 天/.test(gainOk.condition),
  'B-GAIN 距称重 100 天 → 可选且条件已记录');
const holdBlocked = st(draft.atomStates('cut', { gapPct: 2 }), 'B-HOLD');
ok(holdBlocked.allowed === false && /需满足：仅 gapPct≤1.5%/.test(holdBlocked.reason),
  'cut 期 B-HOLD gapPct=2 → 置灰并显示需满足条件', holdBlocked.reason);
const holdAllowed = st(draft.atomStates('cut', { gapPct: 1 }), 'B-HOLD');
ok(holdAllowed.allowed === true && holdAllowed.conditionMet === true, 'cut 期 B-HOLD gapPct=1 → 可选');

// 选择：置灰不可加、名额满不可加、已选可移除
const cutStates = draft.atomStates('cut', { gapPct: 1 });
const rDisabled = draft.toggle(['B-CUT'], 'G-MED', cutStates);
ok(!rDisabled.ok && !rDisabled.added && rDisabled.reason.length > 0, '置灰目标不可添加且有原因', rDisabled.reason);
const rFull = draft.toggle(['P-POW', 'P-END', 'B-CUT'], 'G-SLE', cutStates);
ok(!rFull.ok && /主目标已满 3 个/.test(rFull.reason), '主目标满 3 个后添加被拒', rFull.reason);
const rImm = draft.toggle(['P-POW', 'P-END', 'B-CUT'], 'G-IMM', cutStates);
ok(rImm.ok && rImm.selected.length === 4 && rImm.selected[3] === 'G-IMM', '主目标满仍可加 G-IMM（单独名额）', rImm.selected);
const rRemove = draft.toggle(['P-POW', 'G-IMM'], 'P-POW', cutStates);
ok(rRemove.ok && eq(rRemove.selected, ['G-IMM']), '再次点击已选目标即移除');

// 调序：顺序即优先级
const movedDown = draft.move(['P-POW', 'P-SPD', 'P-END'], 0, 'down');
ok(movedDown.ok && eq(movedDown.selected, ['P-SPD', 'P-POW', 'P-END']), '第一位下移 → 顺序正确', movedDown.selected);
const movedUp = draft.move(['P-POW', 'P-SPD', 'P-END'], 2, 'up');
ok(movedUp.ok && eq(movedUp.selected, ['P-POW', 'P-END', 'P-SPD']), '最后一位上移 → 顺序正确', movedUp.selected);
ok(draft.move(['P-POW'], 0, 'up').moved === false, '首位上移越界不动');
const sv = draft.selectedView(['P-END', 'P-POW'], cutStates);
ok(sv[0].id === 'P-END' && sv[0].order === 1 && sv[1].order === 2 && sv[0].canUp === false && sv[0].canDown === true,
  '已选列表序号与可移动状态跟随顺序', sv);

// 回填：空 goals 可新建；已有 goals 保留顺序并剔除不可选项
const emptyFill = draft.sanitize([]);
ok(emptyFill.selected.length === 0 && emptyFill.dropped.length === 0, 'goals 为空时可正常进入并新建');
const fill = draft.sanitize(['P-END', 'G-MED', 'P-SPD', 'EN', 'X-NO']);
ok(eq(fill.selected, ['P-END', 'P-SPD', 'G-SLE']), '回填保留顺序、EN 归一、剔除 G-MED/未知', fill.selected);
ok(fill.dropped.indexOf('G-MED') >= 0 && fill.dropped.indexOf('X-NO') >= 0, '剔除项有记录', fill.dropped);

// 错误码映射：覆盖全部服务端码，绝不出现“操作失败”
const MAP_CODES = ['E_GOAL_UNKNOWN', 'E_GOAL_DUPLICATE', 'E_GOAL_QUOTA', 'E_GOAL_PHASE_ILLEGAL',
  'E_GOAL_FORBIDDEN', 'E_GOAL_CONFLICT', 'E_GOAL_EMPTY_DATE', 'E_GOAL_BODYFAT', 'E_GOAL_WRITE', 'PENDING_ADMISSION'];
const mapBad = MAP_CODES.filter(function (c) {
  const t = goals.goalErrorText(c);
  return !goals.ERROR_LABELS[c] || !t || /操作失败/.test(t);
});
ok(mapBad.length === 0, '错误码映射齐全且无“操作失败”字样', mapBad);
ok(/E_NO_SUCH/.test(goals.goalErrorText('E_NO_SUCH')), '未知错误码保留原始码，便于排查');
ok(/云端未返回原因/.test(goals.goalErrorText('', '')), '无码无文案时给出可解释兜底');

// 提交前预检：本地可判的日期/体脂错误也走同一套中文
const preDate = draft.precheck(['B-CUT'], '', '');
ok(!preDate.ok && preDate.code === 'E_GOAL_EMPTY_DATE' && /请填写目标生效日期/.test(preDate.reason),
  '缺日期预检 → E_GOAL_EMPTY_DATE 中文', preDate);
const preBf = draft.precheck(['B-CUT'], '52', '2026-11-08');
ok(!preBf.ok && preBf.code === 'E_GOAL_BODYFAT' && /3–50/.test(preBf.reason),
  '体脂越界预检 → E_GOAL_BODYFAT 中文', preBf);
const preOk = draft.precheck(['B-CUT'], '12.5', '2026-11-08');
ok(preOk.ok && preOk.bodyFatPct === 12.5, '合法体脂预检通过并返回数值', preOk);
ok(draft.precheck([], '', '').ok === true, '空目标不要求日期，允许清空');

// ---------------------------------------------------------------------------
// 15) 终审补齐：双区间、refeed 缺失、L0 无 veto、G-SLE 名称、体脂共存
// ---------------------------------------------------------------------------
console.log('\n15) 终审补齐口径');

// A3 双区间：B-REFUEL 的 carb 是 [[4,7],[8,12]]，必须逐段渲染，不能出现 undefined/中间值。
const refuelPlan = goals.resolveGoalPlan('recover', ['B-REFUEL'], {}).goalPlan;
const refuelView = goals.goalView(refuelPlan, null, [], {});
const carbLine = refuelView.targetLines.filter(function (t) { return t.key === 'carb'; })[0];
ok(carbLine && carbLine.text === '4–7 或 8–12 g/kg', '双区间渲染为“4–7 或 8–12 g/kg”', carbLine && carbLine.text);
ok(!/undefined/.test(JSON.stringify(refuelView.targetLines)), '区间文案不含 undefined', refuelView.targetLines);
ok(goals.rangeText([[4, 7], [8, 12]], 'g/kg').indexOf('4–7 或 8–12') === 0 &&
  !/7–8/.test(goals.rangeText([[4, 7], [8, 12]], 'g/kg')), '不把 7–8 中间值当合法', goals.rangeText([[4, 7], [8, 12]], 'g/kg'));
ok(goals.rangeText([], 'g/kg') === '按监测执行', '空区间数组给出监测文案，不拼 undefined');
ok(goals.rangeText({ min: 2, max: 2.4, unit: 'g/kg' }) === '2–2.4 g/kg', '对象区间保持原文案');

// A2 refeed 缺失：组件跳过并重归一，不伪造分数；有结构化数据时按 okDays/totalDays 计分。
const adCutNoRefeed = goals.goalAdherence({}, cutPlan, {});
ok(adCutNoRefeed.score === null && adCutNoRefeed.unavailableReason === 'not_weekly', 'CUT 仅缺 refeed → not_weekly（不伪造 0 分）');
const adStructured = goals.goalAdherence({}, cutPlan, { refeed: { plannedDays: 2, actualDays: 2, successRate: 100, rate: 1 } });
ok(adStructured.score === 100 && adStructured.level === 'ok', '结构化 refeed（2/2）→ 100 分', adStructured);

// B8 L0 不再携带 action=veto；旧 mode=veto 迁移时写提示再归为 cap。
const l0 = GM.PRIORITY_STACK.filter(function (l) { return l.level === 'L0'; })[0];
ok(!Object.prototype.hasOwnProperty.call(l0, 'action') && !!l0.note, 'L0 无 action 字段、保留 note', l0);
const modeNotes = [];
ok(goals.normalizeMode('veto', modeNotes, 'P-X') === 'cap', '旧 mode=veto 归为 cap');
ok(modeNotes.length === 1 && /迁移/.test(modeNotes[0]), '迁移提示写入 notes 来源', modeNotes);
ok(goals.normalizeMode('cap') === 'cap', '正常 mode 原样返回');

// B9 数据层 G-SLE 名称补“含精力”。
const sleAtom = GM.ATOMS.filter(function (a) { return a.id === 'G-SLE'; })[0];
ok(sleAtom && sleAtom.name === '睡眠/恢复（含精力）', 'G-SLE 名称为“睡眠/恢复（含精力）”', sleAtom && sleAtom.name);

// B5 bodyFatPct 两者共存：setGoals 未传体脂时保留已有值；coachApi 另提供 setBodyComp。
const keepBf = goals.validateGoalWrite({ goals: ['B-CUT'], goalEffectiveDate: '2026-11-08' }, { phase: 'cut', bodyFatPct: 12 }, { gapPct: 1.2 });
ok(keepBf.ok && keepBf.bodyFatPct === 12, '未传 bodyFatPct 时保留已有体脂', keepBf && keepBf.bodyFatPct);
const clearBf = goals.validateGoalWrite({ goals: ['B-CUT'], goalEffectiveDate: '2026-11-08', bodyFatPct: null }, { phase: 'cut', bodyFatPct: 12 }, { gapPct: 1.2 });
ok(clearBf.ok && clearBf.bodyFatPct === null, '显式 null 清除体脂', clearBf && clearBf.bodyFatPct);
const badBf = goals.validateGoalWrite({ goals: ['B-CUT'], goalEffectiveDate: '2026-11-08', bodyFatPct: 80 }, { phase: 'cut', bodyFatPct: 12 }, { gapPct: 1.2 });
ok(!badBf.ok && badBf.error && badBf.error.code === 'E_GOAL_BODYFAT', '非法体脂报 E_GOAL_BODYFAT', badBf && badBf.error && badBf.error.code);
const coachApi = require(path.join(__dirname, '../miniprogram/utils/coachApi.js'));
ok(typeof coachApi.setBodyComp === 'function', 'coachApi.setBodyComp 已导出');
ok(typeof coachApi.setRefeedPlan === 'function', 'coachApi.setRefeedPlan 已导出');

// B 组：refeedDays 0–7 整数校验（省略/空 = 清除，非法值给错误码）。
const rr = goals.normalizeRefeedDays;
ok(rr(undefined).ok && rr(undefined).days === null, 'refeedDays 省略 → null（不安排）');
ok(rr('').ok && rr('').days === null, 'refeedDays 留空 → null');
ok(rr(0).ok && rr(0).days === 0, 'refeedDays 0 为合法值');
ok(rr('7').ok && rr('7').days === 7, 'refeedDays 7 为合法值（字符串输入也接受）');
ok(!rr(-1).ok && rr(-1).code === 'E_GOAL_REFEED', 'refeedDays -1 报 E_GOAL_REFEED');
ok(!rr(7.5).ok && rr(7.5).code === 'E_GOAL_REFEED', 'refeedDays 非整数报 E_GOAL_REFEED');
ok(!rr(8).ok && rr(8).code === 'E_GOAL_REFEED', 'refeedDays 超上限报 E_GOAL_REFEED');

// D 组：L0–L6 均不再携带未消费的 action 字段，保留 note。
ok(GM.PRIORITY_STACK.every(function (l) {
  return !Object.prototype.hasOwnProperty.call(l, 'action') && typeof l.note === 'string' && l.note.length > 0;
}), 'PRIORITY_STACK L0–L6 全部无 action、保留 note', GM.PRIORITY_STACK.map(function (l) { return l.level + (l.action ? '(action)' : ''); }));

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
