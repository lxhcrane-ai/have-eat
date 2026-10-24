// 生成 14 天演示数据到 miniprogram/data/seed.js。
// 目的：开发者工具里一打开就能看到趋势图、周报、阶段建议的真实样子，不用等两周积累。
// 用法：node scripts/gen-seed.js [结束日期 YYYY-MM-DD]   默认今天
const fs = require('fs');
const path = require('path');

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function shift(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

const end = process.argv[2] || dateStr(new Date());
const DAYS = 14;
const START_KG = 60.6;
const DROP_PER_DAY = 0.07;         // 约 -0.49kg/周 ≈ 0.83% 体重/周，落在 0.5–1% 安全区中间

// 两天"没做好"的位置（从 0 开始，0 = 最早一天）：脱水 + 蛋白不足 + 睡眠差 + 酸痛 8 且次日速度课
const BAD = { 5: true, 9: true };
const SORE_DAY = 5;

// 餐食按"真实条目"给量，总量由规则引擎自己汇总（不要手填 m.protein，会被 normalizeLog 覆盖）
function meals(bad) {
  if (bad) {
    return [
      { slot: 'breakfast', time: '08:10', items: [
        { name: '燕麦片', grams: 60, kcal: 227, protein: 7.8, carbs: 39.6, fat: 4.1 },
        { name: '牛奶', grams: 200, kcal: 130, protein: 6.6, carbs: 9.8, fat: 7.2 }
      ] },
      { slot: 'lunch', time: '13:00', items: [
        { name: '米饭', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
        { name: '鸡胸肉', grams: 100, kcal: 165, protein: 31, carbs: 0, fat: 3.6 }
      ] },
      { slot: 'dinner', time: '19:40', items: [
        { name: '米饭', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
        { name: '蔬菜', grams: 200, kcal: 68, protein: 5.8, carbs: 14, fat: 0.8 }
      ] }
    ];
  }
  return [
    { slot: 'breakfast', time: '08:10', items: [
      { name: '燕麦片', grams: 80, kcal: 302, protein: 10.4, carbs: 52.8, fat: 5.4 },
      { name: '牛奶', grams: 250, kcal: 163, protein: 8.3, carbs: 12.3, fat: 9 },
      { name: '鸡蛋', grams: 100, kcal: 143, protein: 12.6, carbs: 1.1, fat: 9.5 }
    ] },
    { slot: 'lunch', time: '12:40', items: [
      { name: '米饭', grams: 250, kcal: 290, protein: 6.5, carbs: 64.8, fat: 0.8 },
      { name: '鸡胸肉', grams: 220, kcal: 363, protein: 68.2, carbs: 0, fat: 7.9 },
      { name: '西兰花', grams: 200, kcal: 68, protein: 5.6, carbs: 8.6, fat: 1.2 }
    ] },
    { slot: 'dinner', time: '19:10', items: [
      { name: '米饭', grams: 200, kcal: 232, protein: 5.2, carbs: 51.8, fat: 0.6 },
      { name: '鱼', grams: 180, kcal: 190, protein: 33.5, carbs: 0, fat: 6.1 },
      { name: '蔬菜', grams: 250, kcal: 85, protein: 7.2, carbs: 17.5, fat: 1 },
      { name: '乳清蛋白', grams: 30, kcal: 113, protein: 24, carbs: 3, fat: 1.2 }
    ] }
  ];
}


const list = [];
for (let i = 0; i < DAYS; i++) {
  const date = shift(end, i - (DAYS - 1));
  const kg = Number((START_KG - DROP_PER_DAY * i).toFixed(1));
  const bad = !!BAD[i];
  const sore = i === SORE_DAY ? 8 : (i % 4 === 0 ? 4 : 2);
  const session = ['technique', 'strength', 'sparring', 'cardio', 'technique', 'recovery'][i % 6];
  const duration = session === 'recovery' ? 40 : (session === 'sparring' ? 90 : 70);
  const rpe = session === 'recovery' ? 3 : (session === 'sparring' ? 8 : 6);
  const sleep = bad ? 5.6 : Number((6.8 + (i % 3) * 0.5).toFixed(1));
  const loss = bad ? 1.8 : 0.7;          // 训练前后体重差
  const pre = Number((kg + 0.9).toFixed(1));

  list.push({
    schemaVersion: 2,
    id: 'seed-' + date,
    date: date,
    tzOffset: 480,
    weights: {
      morning: { kg: kg, context: 'morning_fasted' },
      pre: { kg: pre, context: 'pre_train' },
      post: { kg: Number((pre - loss).toFixed(1)), context: 'post_train' }
    },
    sleep: { hours: sleep, quality: bad ? 2 : 4 },
    hydration: { waterMl: bad ? 900 : 2000, urineColor: bad ? 6 : 3 },
    restingHr: bad ? 66 : 58,
    training: { sessionType: session, durationMin: duration, rpe: rpe, rounds: session === 'sparring' ? 8 : null, content: '' },
    sorenessByArea: { shoulder: sore, back: Math.max(0, sore - 3), arm: 2, leg: 1, core: 1 },
    mood: { fatigue: bad ? 4 : 2, stress: 2, appetite: 2 },
    meals: meals(bad),
    nextPlan: { type: i === SORE_DAY ? 'speed' : 'technique', note: i === SORE_DAY ? '出拳速度强化' : '' },
    goal: { phase: 'cut', targetWeightKg: 57, weighInDate: shift(end, 35) },
    createdAt: date + 'T12:00:00.000Z'
  });
}

const header = '// 演示数据：由 scripts/gen-seed.js 生成（' + DAYS + ' 天，截至 ' + end + '）。\n' +
  '// 仅在本机无记录时导入一次；真实使用前把它改回 [] 或清空本机数据。\n' +
  '// 重新生成：node scripts/gen-seed.js 2026-10-25\n';
const body = 'module.exports = ' + JSON.stringify(list, null, 2) + ';\n';
fs.writeFileSync(path.join(__dirname, '../miniprogram/data/seed.js'), header + body);
console.log('已生成 ' + DAYS + ' 天演示数据：' + list[0].date + ' ~ ' + list[list.length - 1].date);
console.log('体重 ' + list[0].weights.morning.kg + ' → ' + list[list.length - 1].weights.morning.kg + 'kg；' +
  '蛋白不足 ' + Object.keys(BAD).length + ' 天；酸痛峰值 ' + Math.max.apply(null, list.map(function (l) { return l.sorenessByArea.shoulder; })));
