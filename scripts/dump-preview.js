// 导出三个案例的规则引擎输出，供 docs/preview.html 静态预览
const fs = require('fs');
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));

const P1 = { heightCm: 175, age: 24, sex: 'male', phase: 'cut', restingHrBaseline: 56 };

const c1 = {"date":"2026-05-16","morningWeight":"58","preTrainWeight":"59","postTrainWeight":"56.8","sleepQuality":"4","trainingContent":"有氧，手臂肩背力量","focusAreas":["肩部","背部"],"soreness":"8","nextPlan":"出拳速度强化","meals":[{"time":"15:51","note":"甜品布丁，泰式虾炒饭100g"}],"timestamp":"2026-05-16T09:07:15.099Z"};

const c2 = {
  date: '2026-05-16', tzOffset: 480,
  weights: { morning: { kg: 58 }, pre: { kg: 59 }, post: { kg: 56.8 } },
  sleep: { hours: 6, quality: 3 },
  hydration: { waterMl: 800, urineColor: 5 },
  restingHr: 63,
  training: { sessionType: 'strength', durationMin: 75, rpe: 8, content: '有氧 + 手臂肩背力量' },
  sorenessByArea: { shoulder: 8, back: 6, arm: 5, leg: 2, core: 1 },
  mood: { fatigue: 3, stress: 3, appetite: 3 },
  meals: [
    { slot: 'breakfast', time: '08:10', items: [{ name: '燕麦', grams: 60, kcal: 226, protein: 7.8, carbs: 39.6, fat: 4 }, { name: '牛奶', grams: 250, kcal: 163, protein: 8.3, carbs: 12.3, fat: 9 }, { name: '鸡蛋', grams: 100, kcal: 143, protein: 13, carbs: 1.1, fat: 9.5 }] },
    { slot: 'lunch', time: '12:40', items: [{ name: '米饭', grams: 200, kcal: 232, protein: 5.2, carbs: 51.8, fat: 0.6 }, { name: '鸡胸', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 }, { name: '西兰花', grams: 200, kcal: 68, protein: 5.6, carbs: 8.6, fat: 0.8 }] },
    { slot: 'dinner', time: '18:30', items: [{ name: '虾炒饭', grams: 300, kcal: 510, protein: 18, carbs: 72, fat: 16.5 }, { name: '布丁', grams: 100, kcal: 130, protein: 3, carbs: 22, fat: 3 }] }
  ],
  nextPlan: { type: 'speed', note: '出拳速度强化' },
  goal: { targetWeightKg: 56, weighInDate: '2026-06-20', phase: 'cut' }
};

const c3 = JSON.parse(JSON.stringify(c2));
c3.date = '2026-05-18';
c3.weights = { morning: { kg: 57.6 }, pre: { kg: 57.9 }, post: { kg: 57.2 } };
c3.sleep = { hours: 8, quality: 4 };
c3.hydration = { waterMl: 2600, urineColor: 2 };
c3.restingHr = 55;
c3.sorenessByArea = { shoulder: 2, back: 2, arm: 1, leg: 1, core: 0 };
c3.training = { sessionType: 'technique', durationMin: 90, rpe: 6, content: '速度技术课' };
c3.nextPlan = { type: 'sparring', note: '轻实战' };

function pack(title, note, log, recent) {
  const f = rules.evaluate(log, { profile: P1, recentMorningWeights: recent || [] });
  return {
    title: title, note: note,
    score: f.score, level: f.level, tone: f.levelTone, headline: f.headline,
    metrics: [
      { label: '晨重', value: f.bw || '--', unit: 'kg' },
      { label: '训练脱水', value: f.hydration.pct === null ? '--' : f.hydration.pct, unit: '%' },
      { label: '蛋白', value: f.protein.actualG, unit: '/ ' + (f.protein.targetG || '--') + 'g' },
      { label: '摄入', value: f.totals.kcal, unit: 'kcal' },
      { label: '酸痛峰', value: f.recovery.sorenessMax === null ? '--' : f.recovery.sorenessMax, unit: '/10' },
      { label: '睡眠', value: f.recovery.sleepHours === null ? '--' : f.recovery.sleepHours, unit: 'h' }
    ],
    alerts: f.alerts.map(function (a) {
      return { level: a.level, title: a.title, text: a.text, kbTitles: (a.kb || []).map(function (id) { return rules.KB_MAP[id] ? rules.KB_MAP[id].title : ''; }) };
    }),
    tips: f.tips.map(function (t) { return { title: t.title, body: t.body, sources: t.sources }; }),
    coachSummary: f.coachSummary,
    date: log.date
  };
}

const out = [
  pack('① 原来那条记录', '只有体重 + 一句话，信息不足，只能报警', c1, []),
  pack('② 同一天填全后', '三餐结构化 + 水合 + RPE + 分部位酸痛', c2,
    [{ date: '2026-05-12', kg: 58.6 }, { date: '2026-05-13', kg: 58.5 }, { date: '2026-05-14', kg: 58.3 }, { date: '2026-05-15', kg: 58.1 }]),
  pack('③ 两天后恢复到位', '同样字段，反馈变成"可以上强度"', c3,
    [{ date: '2026-05-14', kg: 58.3 }, { date: '2026-05-15', kg: 58.1 }, { date: '2026-05-16', kg: 58 }, { date: '2026-05-17', kg: 57.8 }])
];

fs.writeFileSync(path.join(__dirname, '../docs/preview-data.json'), JSON.stringify(out, null, 2));
console.log('已生成 docs/preview-data.json（' + out.length + ' 个案例）');
