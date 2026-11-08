// 规则引擎回归测试：node scripts/test-rules.js
const path = require('path');
const assert = require('assert');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));
const FOOD = require(path.join(__dirname, '../miniprogram/utils/food.js'));
const GM = require(path.join(__dirname, '../miniprogram/data/goalMatrix.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function has(fb, code) { return fb.alerts.some(function (a) { return a.code === code; }); }

console.log('\n1) 老格式数据（真实 boxer_logs_2026-05-16.json）');
const legacy = [{"date":"2026-05-16","morningWeight":"58","preTrainWeight":"59","postTrainWeight":"56.8","sleepQuality":"4","trainingContent":"有氧，手臂肩背力量","focusAreas":["肩部","背部"],"soreness":"8","nextPlan":"出拳速度强化","meals":[{"time":"15:51","note":"甜品布丁，泰式虾炒饭100g","photosCount":0,"photoFilenames":[]}],"extraImagesCount":0,"extraImageFilenames":[],"timestamp":"2026-05-16T09:07:15.099Z"}][0];

const n = rules.normalizeLog(legacy);
ok(typeof n.weights.morning.kg === 'number' && n.weights.morning.kg === 58, '晨重转为数字 58');
ok(n.weights.morning.context === 'morning_fasted', '晨重带称重条件');
ok(n.sleep.quality === 4 && n.sleep.hours === null, '睡眠质量保留、时长缺失为 null');
ok(n.meals[0].source === 'text_only', '老餐食标记为 text_only');

const fbA = rules.evaluate(legacy, { profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut' } });
ok(fbA.hydration.pct === 3.7, '脱水计算 3.7%', fbA.hydration.pct);
ok(fbA.hydration.needMl === 2750, '补液量 2750ml', fbA.hydration.needMl);
ok(has(fbA, 'hyd-critical'), '触发脱水红灯');
ok(has(fbA, 'log-insufficient'), '记录不足提醒');
ok(has(fbA, 'sore-red'), '酸痛 8 触发红灯');
ok(fbA.score < 60, '评分落红灯区', fbA.score);

console.log('\n2) 完整 v2 记录（状态良好）');
const good = {
  date: '2026-06-01', tzOffset: 480,
  weights: { morning: { kg: 57.2 }, pre: { kg: 57.4 }, post: { kg: 56.6 } },
  sleep: { hours: 8, quality: 4 },
  hydration: { waterMl: 2200, urineColor: 2 },
  restingHr: 56,
  training: { sessionType: 'technique', durationMin: 80, rpe: 6, content: '技术课' },
  sorenessByArea: { shoulder: 2, back: 3, arm: 2, leg: 1, core: 0 },
  mood: { fatigue: 2, stress: 2, appetite: 2 },
  meals: [
    { slot: 'breakfast', time: '08:00', items: [{ name: '燕麦片', grams: 80, kcal: 302, protein: 10.4, carbs: 52.8, fat: 5.4 }, { name: '牛奶', grams: 250, kcal: 163, protein: 8.3, carbs: 12.3, fat: 9 }] },
    { slot: 'lunch', time: '12:30', items: [{ name: '米饭', grams: 250, kcal: 290, protein: 6.5, carbs: 64.8, fat: 0.8 }, { name: '鸡胸肉', grams: 250, kcal: 413, protein: 77.5, carbs: 0, fat: 9 }] },
    { slot: 'dinner', time: '19:00', items: [{ name: '米饭', grams: 200, kcal: 232, protein: 5.2, carbs: 51.8, fat: 0.6 }, { name: '鱼', grams: 150, kcal: 158, protein: 27.9, carbs: 0, fat: 5.1 }, { name: '蔬菜', grams: 200, kcal: 68, protein: 5.8, carbs: 14, fat: 0.8 }] }
  ],
  nextPlan: { type: 'speed', note: '出拳速度' },
  goal: { phase: 'cut', targetWeightKg: 56, weighInDate: '2026-07-01' }
};
const fbB = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut' }, recentMorningWeights: [] });
ok(fbB.hydration.pct === 1.4, '脱水 1.4%', fbB.hydration.pct);
ok(fbB.protein.level === 'ok', '蛋白达标', { p: fbB.protein.actualG, t: fbB.protein.targetG });
ok(fbB.totals.count === 3, '三餐计数');
ok(fbB.score >= 70, '评分 >= 70', fbB.score);
ok(!has(fbB, 'plan-conflict'), '状态好时计划无冲突');
ok(fbB.sRPE === 480, 'sRPE = 80×6 = 480', fbB.sRPE);
ok(Math.abs(fbB.energy.tdee - 2500) < 600, 'TDEE 在合理量级', fbB.energy.tdee);

// v3.0 冻结 fixture：无目标时完整输出逐字段比对，唯一豁免 RULES_VERSION
const frozen = require(path.join(__dirname, 'fixtures/rules-v3-no-goals.json'));
const fbFrozen = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut' }, recentMorningWeights: [] });
const actualFrozen = JSON.parse(JSON.stringify(fbFrozen));
ok(typeof rules.RULES_VERSION === 'string' && rules.RULES_VERSION.length > 0, 'RULES_VERSION 存在（唯一豁免项，不参与输出断言）', rules.RULES_VERSION);
try {
  // 冻结 fixture 存于 output 下；唯一豁免 rulesVersion（版本号升级不影响断言）
  assert.deepStrictEqual(actualFrozen, frozen.output);
  ok(true, '无目标时完整输出 = v3.0 冻结 fixture（suppressed/missingRequired/tips/coachSummary 全覆盖）');
} catch (e) {
  ok(false, '无目标时完整输出 = v3.0 冻结 fixture', e.message);
}

console.log('\n3) 崩盘日：脱水 4%、蛋白不足、睡眠 5h、酸痛 9、明日速度课');
const bad = JSON.parse(JSON.stringify(good));
bad.weights.pre = { kg: 58 }; bad.weights.post = { kg: 55.68 };
bad.sleep = { hours: 5, quality: 2 };
bad.sorenessByArea = { shoulder: 9, back: 8, arm: 6, leg: 3, core: 2 };
bad.meals = [
  { slot: 'breakfast', time: '08:00', items: [{ name: '布丁', grams: 100, kcal: 130, protein: 3, carbs: 22, fat: 3 }] },
  { slot: 'lunch', time: '13:00', items: [{ name: '米饭', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 }] }
];
const fbC = rules.evaluate(bad, { profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut' }, recentMorningWeights: [] });
ok(has(fbC, 'hyd-critical'), '脱水 4% 红灯');
ok(has(fbC, 'sore-red'), '酸痛 9 红灯');
ok(has(fbC, 'sleep-short'), '睡眠 5h 红灯');
ok(has(fbC, 'protein-low') || has(fbC, 'protein-short'), '蛋白不足');
ok(fbC.planConflict !== null, '计划冲突被识别', fbC.planConflict);
ok(fbC.alerts[0].level === 'red', '红灯排在最前');
ok(fbC.score < 55, '崩盘日评分 < 55', fbC.score);

console.log('\n4) 体重速率：5 天每天 -0.2kg（约 2.4%/周）');
const pts = [];
for (let i = 0; i < 6; i++) {
  const d = new Date(Date.UTC(2026, 5, 1 + i));
  pts.push({ date: d.toISOString().slice(0, 10), kg: Number((57.2 - 0.2 * i).toFixed(1)) });
}
const rate = rules.weeklyRate(pts);
ok(rate !== null && Math.abs(rate - (-1.4)) < 0.11, '7 日斜率约 -1.4kg/周', rate);
const fbD = rules.evaluate({ date: pts[5].date, weights: { morning: { kg: pts[5].kg } }, goal: { phase: 'cut' } },
  { profile: { phase: 'cut', heightCm: 175, age: 24, sex: 'male' }, recentMorningWeights: pts });
ok(fbD.rate.pctPerWeek > 1.5, '周降幅百分比 > 1%', fbD.rate.pctPerWeek);
ok(has(fbD, 'rate-fast'), '触发减重过快红灯');

console.log('\n5) 空记录 / 边界');
const fbE = rules.evaluate({ date: '2026-06-02' }, { profile: {} });
ok(fbE.score >= 0 && fbE.score <= 100, '空记录评分在 0-100', fbE.score);
ok(fbE.hydration.pct === null, '无体重时脱水为 null');
ok(fbE.alerts.length >= 0, '空记录不崩溃');
const fbF = rules.evaluate({ date: '2026-06-03', weights: { morning: { kg: 60 }, pre: { kg: 59 }, post: { kg: 59 } } }, {});
ok(fbF.hydration.pct === null, '训练后未掉体重不出脱水结论');

console.log('\n6) 引用完整性：所有告警的知识库 id 必须存在');
const allFb = [fbA, fbB, fbC, fbD, fbE];
let missing = [];
allFb.forEach(function (fb) {
  fb.alerts.forEach(function (a) {
    (a.kb || []).forEach(function (id) { if (!rules.KB_MAP[id]) missing.push(a.code + '->' + id); });
  });
  fb.tips.forEach(function (t) { if (!rules.KB_MAP[t.id]) missing.push('tip->' + t.id); });
});
ok(missing.length === 0, '无悬空引用', missing);

console.log('\n7) 知识库结构');
const ids = rules.KB.items.map(function (i) { return i.id; });
ok(new Set(ids).size === ids.length, 'id 唯一（' + ids.length + ' 条）');
ok(rules.KB.items.every(function (i) { return i.title && i.body && i.sources && i.sources.length && i.cat && i.tags; }), '每条都有 title/body/sources/cat/tags');
const cats = rules.KB.items.map(function (i) { return i.cat; });
ok(rules.KB.categories.every(function (c) { return cats.indexOf(c.id) >= 0; }), '每个分类都有条目');

console.log('\n8) 食物库：热量与宏量营养素自洽（4/4/9 法则，容忍 25%）');
let badFood = [];
FOOD.forEach(function (f) {
  if (f.kcal < 20) return; // 咖啡/水这类热量极低的条目不参与校验
  const calc = f.p * 4 + f.c * 4 + f.f * 9;
  const diff = Math.abs(calc - f.kcal) / f.kcal;
  if (diff > 0.25) badFood.push(f.name + ' 标注' + f.kcal + ' 计算' + Math.round(calc));
});
ok(badFood.length === 0, FOOD.length + ' 种食物数据自洽', badFood);

console.log('\n9) G3 字段：fieldsFor(goals) 向后兼容 + 新字段归一');
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function keys(list) { return list.map(function (f) { return f.key; }); }

const BASE_OPTIONAL = {
  maintain: ['weights_pre', 'weights_post', 'water_ml', 'urine_color', 'resting_hr', 'training_type', 'training_rpe', 'soreness', 'next_plan', 'sleep_quality'],
  cut: ['weights_pre', 'weights_post', 'water_ml', 'sleep_hours', 'sleep_quality', 'training_type', 'training_rpe', 'next_plan', 'supplement'],
  peak: ['weights_pre', 'weights_post', 'water_ml', 'urine_color', 'resting_hr', 'training_type', 'training_rpe', 'soreness', 'next_plan', 'sleep_quality'],
  recover: ['water_ml', 'sleep_hours', 'sleep_quality', 'gi_symptoms', 'soreness', 'training_type', 'meals', 'resting_hr']
};
['maintain', 'cut', 'peak', 'recover'].forEach(function (p) {
  const f = rules.fieldsFor(p);
  ok(eq(keys(f.optional), BASE_OPTIONAL[p]), p + ' 无 goals 时 optional 与旧输出逐字段一致', keys(f.optional));
  ok(eq(f, rules.fieldsFor(p, [])), p + ' 空 goals 等价');
  ok(eq(f, rules.fieldsFor(p, null)), p + ' null goals 等价');
});
const withGoals = rules.fieldsFor('maintain', ['P-POW', 'G-IMM']);
const withKeys = keys(withGoals.optional);
ok(withKeys.indexOf('training_start_time') >= 0 && withKeys.indexOf('training_quality') >= 0 && withKeys.indexOf('health_illness') >= 0, '带目标追加三个可选字段', withKeys);
ok(withKeys.lastIndexOf('training_start_time') === withKeys.indexOf('training_start_time'), '目标字段不重复');
ok(eq(withGoals.required, rules.fieldsFor('maintain').required), 'required 不被目标修改');
ok(eq(withGoals.hidden, rules.fieldsFor('maintain').hidden), 'hidden 不被目标修改');
ok(eq(keys(rules.fieldsFor('maintain', ['P-POW', 'P-SPD']).optional).filter(function (k) { return k === 'training_start_time'; }).length, 1), '两个目标共享字段只追加一次');
ok(!keys(rules.fieldsFor('peak', ['P-HYP']).optional).some(function (k) { return k === 'training_start_time'; }), 'P-HYP 在 peak 非法 → 不追加');
ok(keys(rules.fieldsFor('maintain', ['P-HYP']).optional).indexOf('training_start_time') >= 0, 'P-HYP 在 maintain 合法 → 追加');
ok(!keys(rules.fieldsFor('recover', ['P-SKL']).optional).some(function (k) { return k === 'training_quality'; }), 'P-SKL 在 recover 非法 → 不追加');
ok(eq(rules.fieldsFor('cut', ['X-UNKNOWN', 'EN']), rules.fieldsFor('cut')), '未知目标 / 旧值 EN 不改变字段');
ok(keys(rules.fieldsFor('weighin', ['P-POW']).optional).indexOf('training_start_time') >= 0, 'weighin 别名按 peak 判定并追加');

const nlFull = rules.normalizeLog({ date: '2026-06-04', training: { sessionType: 'technique', startTime: '09:30', quality: 5 }, health: { illness: 0 } });
ok(nlFull.training.startTime === '09:30', 'startTime HH:mm 保留');
ok(nlFull.training.quality === 5, 'quality 5 保留');
ok(nlFull.health.illness === 0, 'illness 0 保留（不是默认值）');
const nlMissing = rules.normalizeLog({ date: '2026-06-05' });
ok(nlMissing.training.startTime === null, '缺 startTime → null');
ok(nlMissing.training.quality === null, '缺 quality → null');
ok(nlMissing.health.illness === null, '缺 illness → null');
ok(nlMissing.training.startTime !== '' && nlMissing.training.quality !== 0 && nlMissing.health.illness !== 0, '缺失不写默认值');
ok(rules.normalizeLog({ training: { startTime: '24:00' } }).training.startTime === null, '24:00 非法 → null');
ok(rules.normalizeLog({ training: { startTime: '9:30' } }).training.startTime === null, '非 HH:mm（9:30）→ null');
ok(rules.normalizeLog({ training: { startTime: '10:75' } }).training.startTime === null, '分钟越界 → null');
ok(rules.normalizeLog({ training: { quality: 0 } }).training.quality === null, 'quality 0 → null');
ok(rules.normalizeLog({ training: { quality: 6 } }).training.quality === null, 'quality 6 → null');
ok(rules.normalizeLog({ training: { quality: 2.5 } }).training.quality === null, 'quality 非整数 → null');
ok(rules.normalizeLog({ training: { quality: '3' } }).training.quality === 3, "quality '3' 归一为数字 3");
ok(rules.normalizeLog({ health: { illness: 3 } }).health.illness === null, 'illness 3 → null');
ok(rules.normalizeLog({ health: { illness: -1 } }).health.illness === null, 'illness -1 → null');
ok(rules.normalizeLog({ health: { illness: '1' } }).health.illness === 1, "illness '1' 归一为数字 1");

const goodG3 = JSON.parse(JSON.stringify(good));
goodG3.training.startTime = '09:30'; goodG3.training.quality = 4;
goodG3.health = { illness: 0 };
const fbG3 = rules.evaluate(goodG3, { profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut' }, recentMorningWeights: [] });
ok(fbG3.score === fbB.score && fbG3.alerts.length === fbB.alerts.length, '新增可选字段不改变 evaluate 评分与告警');

console.log('\n10) G4 目标叠加与 v4 向后兼容');
const baseCtx = { profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut' }, recentMorningWeights: [] };
const baseOut = rules.evaluate(good, baseCtx);
// v3.0 的返回字段顺序（不允许 G4 改动既有字段顺序）
const V3_KEYS = ['version', 'date', 'score', 'level', 'levelTone', 'headline', 'bw', 'phase', 'phaseLabel', 'phaseProfile', 'activeRuleIds', 'suppressedRuleIds', 'suppressed', 'missingRequired', 'weights', 'hydration', 'protein', 'energy', 'totals', 'rate', 'recovery', 'sRPE', 'planConflict', 'alerts', 'tips', 'coachSummary'];
ok(rules.RULES_VERSION === 'v4.0', 'RULES_VERSION 升到 v4.0', rules.RULES_VERSION);
ok(eq(Object.keys(baseOut), V3_KEYS), '无目标时字段顺序与 v3.0 一致', Object.keys(baseOut));
ok(!('goalPlan' in baseOut) && !('goalAdherence' in baseOut) && !('goalBlockers' in baseOut) && !('goalMatrixVersion' in baseOut), '无目标时不出现四个派生字段');
ok(!baseOut.activeRuleIds.some(function (id) { return id === 'GOAL-01' || id === 'GOAL-02'; }), '无目标时 activeRuleIds 不含 GOAL');
ok(baseOut.score === fbB.score && baseOut.alerts.map(function (a) { return a.code + ':' + a.level; }).join('|') === fbB.alerts.map(function (a) { return a.code + ':' + a.level; }).join('|'), '无目标时 score / 告警序列与旧基线一致', [baseOut.score, fbB.score]);

const goalsProfile = { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57, restingHrBaseline: 58, goals: ['P-POW', 'P-END'] };
const withG = rules.evaluate(good, { profile: goalsProfile, phase: 'cut' });
ok('goalPlan' in withG && 'goalAdherence' in withG && 'goalBlockers' in withG && 'goalMatrixVersion' in withG, '有目标时输出四个派生字段');
ok(withG.goalMatrixVersion === rules.GOAL_MATRIX_VERSION, 'goalMatrixVersion 透传数据层版本', withG.goalMatrixVersion);
ok(withG.goalPlan && Array.isArray(withG.goalPlan.atoms) && withG.goalPlan.phase === 'cut', 'goalPlan 带 atoms 与 phase');
ok(withG.score === baseOut.score, '叠加目标不改变 score', [withG.score, baseOut.score]);
const baseIds = baseOut.alerts.map(function (a) { return a.ruleId; }).filter(function (id) { return id !== 'GOAL-01' && id !== 'GOAL-02'; });
const goalIds = withG.alerts.map(function (a) { return a.ruleId; }).filter(function (id) { return id !== 'GOAL-01' && id !== 'GOAL-02'; });
ok(JSON.stringify(baseIds) === JSON.stringify(goalIds), '叠加目标不改变原有告警集合与顺序', { base: baseIds, withGoals: goalIds });
const g02 = withG.alerts.filter(function (a) { return a.ruleId === 'GOAL-02'; })[0];
ok(g02 && g02.level === 'amber', '同日 POW+END → GOAL-02 amber', g02 && g02.level);
ok(withG.goalPlan.lead === 'P-POW', 'GOAL-02 不改变计划主导', withG.goalPlan.lead);

const illegalProfile = { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57, goals: ['B-GAIN'] };
const illegal = rules.evaluate(good, { profile: illegalProfile, phase: 'cut' });
const g01 = illegal.alerts.filter(function (a) { return a.ruleId === 'GOAL-01'; })[0];
ok(g01 && g01.level === 'red', 'cut 期 B-GAIN → GOAL-01 red', g01 && g01.level);
ok(illegal.goalPlan === null, '非法目标不产生半成品计划');
ok(illegal.goalBlockers.some(function (b) { return b.blockerType === 'goal_illegal' && b.ruleId === 'GOAL-01'; }), 'goalBlockers 记录 goal_illegal');

const weakProfile = { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['P-SKL'] };
const weak = rules.evaluate(good, { profile: weakProfile, phase: 'cut' });
ok(weak.goalPlan.targets === null && weak.goalAdherence.score === null && weak.goalAdherence.unavailableReason === 'weak_evidence', '弱证据目标无数值处方、依从性 unknown');

const redSleep = JSON.parse(JSON.stringify(good));
redSleep.sleep = { hours: 5.5, quality: 2 };
const redProfile = { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['P-END', 'G-SLE'] };
const redPlan = rules.evaluate(redSleep, { profile: redProfile, phase: 'cut' });
ok(redPlan.goalPlan.lead === 'G-SLE', 'SLE-01 red 汇总进 ctx.guardrailRed 并越级主导', redPlan.goalPlan.lead);
const normalPlan = rules.evaluate(good, { profile: redProfile, phase: 'cut' });
ok(normalPlan.goalPlan.lead === 'P-END', '无护栏红灯时仍由 P-END 主导', normalPlan.goalPlan.lead);

ok(eq(Object.keys(withG.goalPlan), ['goals', 'atoms', 'composites', 'phase', 'legality', 'lead', 'concessions', 'targets', 'cells', 'evidenceStatus', 'notes']), 'goalPlan 字段集合与契约一致', Object.keys(withG.goalPlan));
ok(eq(Object.keys(withG).slice(-4), ['goalPlan', 'goalAdherence', 'goalBlockers', 'goalMatrixVersion']), '四个派生字段追加在末尾且顺序固定');
const g02Conc = withG.goalPlan.concessions.filter(function (c) { return c.goalId === 'P-END'; });
ok(g02Conc.length === 1 && g02Conc[0].mode === 'sequence', 'GOAL-02 与冲突边去重，P-END 只保留一条 sequence 让步', g02Conc);

const maintainCut = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['B-CUT'] }, phase: 'maintain' });
const mc = maintainCut.alerts.filter(function (a) { return a.ruleId === 'GOAL-01'; })[0];
ok(mc && mc.level === 'red', 'maintain 期 B-CUT → GOAL-01 red', mc && mc.level);
const maintainPeak = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['B-PEAK'] }, phase: 'maintain' });
const mp = maintainPeak.alerts.filter(function (a) { return a.ruleId === 'GOAL-01'; })[0];
ok(mp && mp.level === 'amber', 'maintain 期 B-PEAK → GOAL-01 amber', mp && mp.level);
ok(maintainCut.goalBlockers.some(function (b) { return b.goalId === 'B-CUT' && b.action === 'veto' && b.level === 'red'; }), 'GOAL-01 red → goalBlockers veto');

const immOut = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['P-END', 'G-IMM'] }, phase: 'cut' });
ok(immOut.goalPlan.lead === 'P-END', 'G-IMM 不进 guardrailRed、不做 lead', immOut.goalPlan.lead);
ok(!immOut.alerts.some(function (a) { return a.ruleId === 'GOAL-01' || a.ruleId === 'GOAL-02'; }), '仅 G-IMM 监测目标不产生 GOAL 告警');

// 条件合法：条件满足 → 放行；条件不满足 → 按矩阵 goal01Level 分级
function goal01Of(out) {
  return out.alerts.filter(function (a) { return a.ruleId === 'GOAL-01'; })[0] || null;
}
const holdLoose = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57, goals: ['B-HOLD'] }, phase: 'cut' });
ok(goal01Of(holdLoose) === null && holdLoose.goalPlan && holdLoose.goalPlan.lead === 'B-HOLD', 'cut+B-HOLD 且 gapPct≤1.5 → 合法放行', holdLoose.goalPlan && holdLoose.goalPlan.lead);
const holdTight = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 56, goals: ['B-HOLD'] }, phase: 'cut' });
ok(goal01Of(holdTight) && goal01Of(holdTight).level === 'red' && holdTight.goalPlan === null, 'cut+B-HOLD 且 gapPct>1.5 → GOAL-01 red', goal01Of(holdTight) && goal01Of(holdTight).level);
const gainEarly = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['B-GAIN'] }, phase: 'maintain', daysToWeigh: 30 });
ok(goal01Of(gainEarly) && goal01Of(gainEarly).level === 'amber', 'maintain+B-GAIN 且距称重<84 天 → amber', goal01Of(gainEarly) && goal01Of(gainEarly).level);
const gainLate = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: ['B-GAIN'] }, phase: 'maintain', daysToWeigh: 90 });
ok(goal01Of(gainLate) === null && gainLate.goalPlan && gainLate.goalPlan.lead === 'B-GAIN', 'maintain+B-GAIN 且距称重>84 天 → 合法放行', gainLate.goalPlan && gainLate.goalPlan.lead);

// 全表回核：所有 N/A 格的 GOAL-01 级别必须逐格等于矩阵 goal01Level
const levelMismatch = [];
['maintain', 'cut', 'peak', 'recover'].forEach(function (phase) {
  GM.ATOMS.forEach(function (atom) {
    var cell = GM.MATRIX[phase][atom.id];
    if (!cell || cell.legal) return;
    var out = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, goals: [atom.id] }, phase: phase });
    var a = goal01Of(out);
    if (!a || a.level !== cell.goal01Level) levelMismatch.push(phase + '/' + atom.id + ' -> ' + (a && a.level) + ' ≠ ' + cell.goal01Level);
  });
});
ok(levelMismatch.length === 0, 'GOAL-01 级别逐格等于矩阵 goal01Level（' + (4 * GM.ATOMS.length) + ' 格扫描）', levelMismatch);

console.log('\n13) EA/FFM（文档 §7.6）：不用全天 TDEE、缺数据不误报');
// 常规减脂日：摄入 2326 kcal、技术课 80min、体脂 12% → 净消耗≈160 kcal，EA≈43，不得判红。
// 旧实现用 energy.tdee（≈2500+）会让这项变成负数并误判 EA<30，本用例专门锁住这一偏差。
const cutDay = JSON.parse(JSON.stringify(good));
cutDay.meals.push({ slot: 'snack', time: '16:00', items: [{ name: '加餐', kcal: 700, protein: 30, carbs: 120, fat: 15 }] });
const eaProfile = { heightCm: 175, age: 24, sex: 'male', phase: 'cut', bodyFatPct: 12, goals: ['G-EA'] };
const eaNormal = rules.evaluate(cutDay, { profile: eaProfile, recentMorningWeights: [] });
ok(!eaNormal.goalBlockers.some(function (b) { return b.goalId === 'G-EA' && b.action === 'veto'; }), '常规减脂日不会因 TDEE 被误判 EA<30', eaNormal.goalBlockers);
ok(!eaNormal.goalBlockers.some(function (b) { return b.goalId === 'G-EA'; }), '常规减脂日 EA 已算出且 ≥30，无 data_missing');
ok(!eaNormal.alerts.some(function (a) { return a.level === 'red' && a.ruleId.indexOf('EA') === 0; }), '常规减脂日不产生 EA 红灯');

// 近 7 日晨重均值参与 FFM：当日 57.2kg，前 6 日均 53kg → 均值 53.6、FFM 47.2，EA≈31.3 放行；
// 若错用当日体重 57.2 → FFM 50.3，EA≈29.1 会被判红，本用例锁住“7 日均值”口径。
// 训练净消耗按 (MET−1)：技术课 80min、53.6kg ≈ 150 kcal（旧总 MET 算法为 225）。
const eaAvgDay = JSON.parse(JSON.stringify(cutDay));
eaAvgDay.meals = JSON.parse(JSON.stringify(good.meals));
const avgPts = [53, 53, 53, 53, 53, 53].map(function (kg, i) {
  return { date: '2026-05-' + (26 + i), kg: kg };
});
const eaAvg = rules.evaluate(eaAvgDay, { profile: eaProfile, recentMorningWeights: avgPts });
ok(!eaAvg.goalBlockers.some(function (b) { return b.goalId === 'G-EA' && b.action === 'veto'; }), 'FFM 用近 7 日晨重均值而非当日体重', eaAvg.goalBlockers);
ok(!eaAvg.goalBlockers.some(function (b) { return b.goalId === 'G-EA'; }), '按 7 日均重计算 EA 已 ≥30，不被当日体重误判');

// 缺 bodyFatPct → ea=null，只出 data_missing / monitor，不红灯、不 veto。
const noBf = rules.evaluate(cutDay, {
  profile: { heightCm: 175, age: 24, sex: 'male', phase: 'cut', goals: ['G-EA'] },
  recentMorningWeights: []
});
const noBfBlocker = noBf.goalBlockers.filter(function (b) { return b.goalId === 'G-EA'; })[0];
ok(noBfBlocker && noBfBlocker.blockerType === 'data_missing' && noBfBlocker.action === 'monitor', '缺 bodyFatPct → G-EA data_missing/monitor', noBfBlocker);
ok(!noBf.goalBlockers.some(function (b) { return b.action === 'veto'; }), '缺 bodyFatPct 不 veto');
ok(!noBf.alerts.some(function (a) { return a.level === 'red' && a.ruleId.indexOf('EA') === 0; }), '缺 bodyFatPct 不产生 EA 红灯');

// 缺训练消耗数据（无时长）→ ea=null，同样只出 data_missing / monitor。
const noTrain = JSON.parse(JSON.stringify(cutDay));
delete noTrain.training.durationMin;
const noTrainOut = rules.evaluate(noTrain, { profile: eaProfile, recentMorningWeights: [] });
const noTrainBlocker = noTrainOut.goalBlockers.filter(function (b) { return b.goalId === 'G-EA'; })[0];
ok(noTrainBlocker && noTrainBlocker.blockerType === 'data_missing' && noTrainBlocker.action === 'monitor', '缺训练消耗 → G-EA data_missing/monitor', noTrainBlocker);
ok(!noTrainOut.goalBlockers.some(function (b) { return b.action === 'veto'; }), '缺训练消耗不 veto');

console.log('\n14) C06 阶段主导');
const c06Cut = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57.5, goals: ['P-HYP', 'B-HOLD'] }, phase: 'cut' });
ok(c06Cut.goalPlan && c06Cut.goalPlan.composites.indexOf('C06') >= 0, 'cut 期 P-HYP+B-HOLD 命中 C06', c06Cut.goalPlan && c06Cut.goalPlan.composites);
ok(c06Cut.goalPlan && c06Cut.goalPlan.lead === 'B-HOLD', 'C06 cut 期主导 = B-HOLD', c06Cut.goalPlan && c06Cut.goalPlan.lead);
const c06Maintain = rules.evaluate(good, { profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57.5, goals: ['P-HYP', 'B-HOLD'] }, phase: 'maintain' });
ok(c06Maintain.goalPlan && c06Maintain.goalPlan.composites.indexOf('C06') >= 0, 'maintain 期 P-HYP+B-HOLD 命中 C06', c06Maintain.goalPlan && c06Maintain.goalPlan.composites);
ok(c06Maintain.goalPlan && c06Maintain.goalPlan.lead === 'P-HYP', 'C06 maintain 期主导 = P-HYP', c06Maintain.goalPlan && c06Maintain.goalPlan.lead);

console.log('\n15) ctx.goals 优先于 profile.goals（未保存目标预览/复核）');
const baseCutProfile = { heightCm: 175, age: 24, sex: 'male', phase: 'cut', goals: ['B-GAIN'] };
const withCtxGoals = rules.evaluate(good, { profile: baseCutProfile, goals: ['P-SKL'], recentMorningWeights: [] });
ok(withCtxGoals.goalPlan && withCtxGoals.goalPlan.atoms.length === 1 && withCtxGoals.goalPlan.atoms[0] === 'P-SKL',
  'ctx.goals 覆盖 profile.goals', withCtxGoals.goalPlan && withCtxGoals.goalPlan.atoms);
ok(!withCtxGoals.alerts.some(function (a) { return a.ruleId === 'GOAL-01'; }), '覆盖后不再按 profile.goals 判 GOAL-01');
const emptyCtxGoals = rules.evaluate(good, { profile: baseCutProfile, goals: [], recentMorningWeights: [] });
ok(emptyCtxGoals.goalPlan === undefined && !emptyCtxGoals.alerts.some(function (a) { return a.ruleId === 'GOAL-01'; }),
  'ctx.goals=[] 时按“无目标预览”处理，不回落 profile.goals', emptyCtxGoals.goalPlan);

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
