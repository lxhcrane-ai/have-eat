// 规则引擎回归测试：node scripts/test-rules.js
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));
const FOOD = require(path.join(__dirname, '../miniprogram/utils/food.js'));

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
ok(rules.KB.items.every(function (i) { return i.title && i.body && i.source && i.cat && i.tags; }), '每条都有 title/body/source/cat/tags');
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

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
