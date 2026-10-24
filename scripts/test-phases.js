// 阶段状态机对照测试：同一份记录在 cut / peak 下必须产出不同告警集合与评分。
// 用法：node scripts/test-phases.js
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function ruleIds(fb) { return fb.alerts.map(function (a) { return a.ruleId; }); }
function has(fb, ruleId) { return ruleIds(fb).indexOf(ruleId) >= 0; }
function alertOf(fb, ruleId) { return fb.alerts.filter(function (a) { return a.ruleId === ruleId; })[0]; }

// ---------------------------------------------------------------------------
// 同一份记录：脱水 3.7%、蛋白 96g（cut 下限 116g，缺 20g）、酸痛 8、次日速度课、睡眠 6h
// ---------------------------------------------------------------------------
const shared = {
  date: '2026-06-10',
  weights: { morning: { kg: 58 }, pre: { kg: 59 }, post: { kg: 56.8 } },
  sleep: { hours: 6, quality: 2 },
  hydration: { waterMl: 800, urineColor: 6 },
  restingHr: 66,
  training: { sessionType: 'sparring', durationMin: 90, rpe: 8 },
  sorenessByArea: { shoulder: 8, back: 6, arm: 5, leg: 3, core: 2 },
  meals: [
    { slot: 'breakfast', items: [{ name: '燕麦+奶', kcal: 400, protein: 25, carbs: 60, fat: 10 }] },
    { slot: 'lunch', items: [{ name: '鸡胸饭', kcal: 600, protein: 38, carbs: 70, fat: 15 }] },
    { slot: 'dinner', items: [{ name: '鱼+饭', kcal: 500, protein: 33, carbs: 50, fat: 12 }] }
  ],
  nextPlan: { type: 'speed' },
  goal: {}
};
const profile = { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57, restingHrBaseline: 58 };

const cut = rules.evaluate(shared, { profile: profile, phase: 'cut' });
const peak = rules.evaluate(shared, { profile: profile, phase: 'peak' });

console.log('\n1) 基础量：同一份记录，两套结论');
ok(cut.hydration.pct === 3.7, '两边算出的脱水百分比都是 3.7%', cut.hydration.pct);
ok(peak.hydration.pct === 3.7, 'peak 也记录了这个数值（只是不据此告警）', peak.hydration.pct);
ok(cut.protein.actualG === 96, '蛋白摄入 96g', cut.protein.actualG);
ok(cut.protein.minG === 116 && peak.protein.minG === 93, '阶段不同 → 蛋白下限不同（cut 116 / peak 93）', [cut.protein.minG, peak.protein.minG]);

console.log('\n2) cut 期：脱水 + 蛋白缺口都要报');
ok(has(cut, 'HYD-01'), '脱水 3.7% 触发 HYD-01');
ok(alertOf(cut, 'HYD-01').level === 'red', 'HYD-01 是红灯');
ok(has(cut, 'PRO-01'), '蛋白缺口触发 PRO-01');
ok(/缺 20g|差 20g/.test(alertOf(cut, 'PRO-01').title), '蛋白缺口正好 20g', alertOf(cut, 'PRO-01').title);
ok(has(cut, 'REC-02'), '酸痛 8 + 次日速度课触发 REC-02');
ok(has(cut, 'SLE-01'), '睡眠 6h 触发 SLE-01');
ok(cut.planConflict !== null, 'cut 期识别到明日计划冲突');
ok(cut.phase === 'cut' && cut.phaseLabel === '减脂期', '结果带回阶段标签');

console.log('\n3) peak 期：脱水百分比被抑制，改看计划执行率');
ok(!has(peak, 'HYD-01'), 'peak 期不再对脱水 3.7% 报警');
ok(!has(peak, 'PRO-01'), '同一蛋白摄入在 peak 下限内 → 不报警', { min: peak.protein.minG, actual: peak.protein.actualG });
ok(!has(peak, 'ENE-01'), 'peak 期能量规则关闭');
ok(has(peak, 'HYD-05'), 'peak 期水合主指标变成 HYD-05（缺计划数据 → 数据不足）');
ok(alertOf(peak, 'HYD-05').code === 'hyd-plan-missing', 'HYD-05 用独立的 legacy code，不与 LOG-01 混淆');
ok(has(peak, 'REC-02'), 'peak 期仍判断酸痛与速度课冲突');
ok(has(peak, 'SLE-01'), 'peak 期仍判断睡眠');
ok(peak.suppressed.some(function (s) { return s.ruleId === 'HYD-01'; }), 'HYD-01 出现在 suppressed 审计列表里（抑制不等于删除）');
ok(peak.suppressed.some(function (s) { return s.ruleId === 'ENE-01'; }), 'ENE-01 同样被记录为抑制');
ok(peak.hydration.mode === 'plan', '水合判定模式切到 plan', peak.hydration.mode);

console.log('\n4) 评分：同一份数据，两套权重');
ok(cut.score !== peak.score, 'cut / peak 评分不同', { cut: cut.score, peak: peak.score });
ok(Math.abs(cut.score - peak.score) >= 5, '分数差 ≥ 5 分', Math.abs(cut.score - peak.score));
ok(cut.phaseProfile.metricWeights.hydration === 25, 'cut 水合权重 25');
ok(peak.phaseProfile.metricWeights.hydration === 30, 'peak 水合权重 30');
ok(peak.phaseProfile.metricWeights.energy === 0, 'peak 能量权重 0');

console.log('\n5) 计划内脱水（peak 正确姿势）不再报警');
const planned = JSON.parse(JSON.stringify(shared));
planned.hydrationPlan = { planMl: 3000, actualMl: 2900, sodiumOk: true };
planned.giSymptoms = { nausea: 0, bloating: 1, cramp: 0, appetite: 1 };
planned.supplementPlan = { planned: ['creatine'], taken: ['creatine'] };
const peakPlanned = rules.evaluate(planned, { profile: profile, phase: 'peak' });
ok(peakPlanned.hydration.planRate === 97, '执行率 2900/3000 = 97%', peakPlanned.hydration.planRate);
ok(!has(peakPlanned, 'HYD-05'), '执行率达标 → 不告警');
ok(!has(peakPlanned, 'HYD-01'), '仍然不因为掉 2.2kg 报警');
ok(peakPlanned.missingRequired.length === 0, '微调期必填项已补齐', peakPlanned.missingRequired);
ok(peakPlanned.score > peak.score, '补齐数据后评分上升（数据不足本身扣分）', { before: peak.score, after: peakPlanned.score });

console.log('\n6) 阶段别名与字段契约');
ok(rules.resolvePhase('weighin') === 'peak', '旧数据 weighin 映射到 peak');
ok(rules.resolvePhase('') === 'maintain', '空阶段兜底 maintain');
ok(rules.resolvePhase('乱写') === 'maintain', '非法阶段兜底 maintain');
const fCut = rules.fieldsFor('cut');
const fPeak = rules.fieldsFor('peak');
const fMaint = rules.fieldsFor('maintain');
const fRec = rules.fieldsFor('recover');
ok(fCut.required.some(function (x) { return x.key === 'soreness'; }), 'cut 期酸痛必填');
ok(!fMaint.required.some(function (x) { return x.key === 'soreness'; }), 'maintain 期酸痛非必填（表单收缩）');
ok(fPeak.required.some(function (x) { return x.key === 'hydration_plan'; }), 'peak 期补液计划必填');
ok(fPeak.required.some(function (x) { return x.key === 'gi_symptoms'; }), 'peak 期胃肠症状必填');
ok(fRec.required.some(function (x) { return x.key === 'post_weighin_fluid'; }), 'recover 期称重后补液必填');

console.log('\n7) 阶段-规则矩阵完整性');
const allIds = rules.listRules().map(function (r) { return r.ruleId; });
let union = {};
PHASES().forEach(function (p) {
  rules.PHASE_PROFILES[p].activeRuleIds.forEach(function (id) { union[id] = true; });
});
const uncovered = allIds.filter(function (id) { return !union[id]; });
ok(uncovered.length === 0, '每条登记规则至少被一个阶段启用', uncovered);
function PHASES() { return ['maintain', 'cut', 'peak', 'recover']; }
let badWeight = [];
PHASES().forEach(function (p) {
  const w = rules.PHASE_PROFILES[p].metricWeights;
  const sum = Object.keys(w).reduce(function (s, k) { return s + w[k]; }, 0);
  if (sum !== 100) badWeight.push(p + '=' + sum);
});
ok(badWeight.length === 0, '四个阶段的评分权重都合计 100', badWeight);
let overlap = [];
PHASES().forEach(function (p) {
  const prof = rules.PHASE_PROFILES[p];
  prof.activeRuleIds.forEach(function (id) {
    if (prof.suppressedRuleIds.indexOf(id) >= 0) overlap.push(p + ':' + id);
  });
});
ok(overlap.length === 0, '同一阶段里激活与抑制不重叠', overlap);

console.log('\n8) 可追溯性：每条告警都能落到 ruleId + 来源锚点');
let badAlert = [];
[cut, peak, peakPlanned].forEach(function (fb) {
  fb.alerts.forEach(function (a) {
    if (!a.ruleId || !rules.getRuleById(a.ruleId)) badAlert.push('未登记:' + a.ruleId);
    if (!a.evidence) badAlert.push(a.ruleId + ' 缺 evidence');
    if (!a.sources || !a.sources.length) badAlert.push(a.ruleId + ' 缺来源');
    (a.sources || []).forEach(function (s) {
      if (!s.citation || !s.anchor || !s.sourceType || !s.year) badAlert.push(a.ruleId + ' 来源字段不全');
      if (!s.doi && !s.url) badAlert.push(a.ruleId + ' 来源缺 doi/url');
    });
  });
});
ok(badAlert.length === 0, '所有告警可追溯到规则与文献锚点', badAlert);

console.log('\n9) 复核状态透传');
const reviewed = rules.evaluate(shared, { profile: profile, phase: 'cut', ruleReviews: { 'PRO-01': 'needs_review' } });
const pro = reviewed.alerts.filter(function (a) { return a.ruleId === 'PRO-01'; })[0];
ok(pro && pro.reviewStatus === 'needs_review', '教练标记待复核后，告警里带回 reviewStatus', pro && pro.reviewStatus);
ok(pro && pro.reviewStatusName === '待复核', '带回中文状态名');
const regPro = rules.getRuleById('PRO-01');
ok(regPro.reviewStatus === 'needs_review', '登记表本身已把 PRO-01 标为待复核（阈值冲突）', regPro.reviewStatus);

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
