// 不打开小程序也能看反馈长什么样：node scripts/demo-report.js
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));

function bar(s) { return '─'.repeat(s || 52); }
function tag(l) { return l === 'red' ? '[必须]' : (l === 'amber' ? '[注意]' : '[提示]'); }

function report(title, log, profile, recent) {
  const f = rules.evaluate(log, { profile: profile, recentMorningWeights: recent || [] });
  console.log('\n' + bar(58));
  console.log(title);
  console.log(bar(58));
  console.log('评分 ' + f.score + '  ' + f.level + '   ' + f.headline);
  console.log('晨重 ' + (f.bw || '--') + 'kg   脱水 ' + (f.hydration.pct === null ? '--' : f.hydration.pct + '%') +
    '   蛋白 ' + f.protein.actualG + '/' + (f.protein.targetG || '--') + 'g   ' +
    '摄入 ' + f.totals.kcal + 'kcal   酸痛 ' + (f.recovery.sorenessMax === null ? '--' : f.recovery.sorenessMax) +
    '   睡眠 ' + (f.recovery.sleepHours === null ? '--' : f.recovery.sleepHours + 'h'));
  if (f.alerts.length) {
    console.log('');
    f.alerts.forEach(function (a) {
      console.log(tag(a.level) + ' ' + a.title);
      console.log('       ' + a.text);
      if (a.kb && a.kb.length) {
        a.kb.forEach(function (id) {
          const it = rules.KB_MAP[id];
          if (it) console.log('       依据：' + it.title + '  —  ' + it.sources.map(function (s) { return s.citation; }).join('；'));
        });
      }
    });
  }
  if (f.tips.length) {
    console.log('\n今天值得知道：');
    f.tips.forEach(function (t) { console.log('  · ' + t.title); });
  }
  console.log('\n教练端会收到的摘要： ' + f.coachSummary);
}

// 1) 用户原来那条真实记录（v1，直接喂给引擎）
const v1 = {"date":"2026-05-16","morningWeight":"58","preTrainWeight":"59","postTrainWeight":"56.8","sleepQuality":"4","trainingContent":"有氧，手臂肩背力量","focusAreas":["肩部","背部"],"soreness":"8","nextPlan":"出拳速度强化","meals":[{"time":"15:51","note":"甜品布丁，泰式虾炒饭100g","photosCount":0,"photoFilenames":[]}],"extraImagesCount":0,"extraImageFilenames":[],"timestamp":"2026-05-16T09:07:15.099Z"};
report('① 原记录（v1，只有体重+一句话）：信息不足，只能报警',
  v1, { heightCm: 175, age: 24, sex: 'male', phase: 'cut' }, []);

// 2) 同一个人，按 v2 填全之后
const v2 = {
  date: '2026-05-16', tzOffset: 480,
  weights: { morning: { kg: 58 }, pre: { kg: 59 }, post: { kg: 56.8 } },
  sleep: { hours: 6, quality: 3 },
  hydration: { waterMl: 800, urineColor: 5 },
  restingHr: 63,
  training: { sessionType: 'strength', durationMin: 75, rpe: 8, content: '有氧 + 手臂肩背力量' },
  sorenessByArea: { shoulder: 8, back: 6, arm: 5, leg: 2, core: 1 },
  mood: { fatigue: 3, stress: 3, appetite: 3 },
  meals: [
    { slot: 'breakfast', time: '08:10', items: [
      { id: 'oat', name: '燕麦片（干）', grams: 60, kcal: 226, protein: 7.8, carbs: 39.6, fat: 4 },
      { id: 'milk', name: '全脂牛奶', grams: 250, kcal: 163, protein: 8.3, carbs: 12.3, fat: 9 },
      { id: 'egg', name: '鸡蛋', grams: 100, kcal: 143, protein: 13, carbs: 1.1, fat: 9.5 }] },
    { slot: 'lunch', time: '12:40', items: [
      { id: 'rice', name: '米饭（熟）', grams: 200, kcal: 232, protein: 5.2, carbs: 51.8, fat: 0.6 },
      { id: 'chicken', name: '鸡胸肉（熟）', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 },
      { id: 'broccoli', name: '西兰花', grams: 200, kcal: 68, protein: 5.6, carbs: 8.6, fat: 0.8 }] },
    { slot: 'dinner', time: '18:30', items: [
      { id: 'friedrice', name: '炒饭（泰式虾炒饭）', grams: 300, kcal: 510, protein: 18, carbs: 72, fat: 16.5 },
      { id: 'pudding', name: '甜品布丁', grams: 100, kcal: 130, protein: 3, carbs: 22, fat: 3 }] }
  ],
  nextPlan: { type: 'speed', note: '出拳速度强化' },
  goal: { targetWeightKg: 56, weighInDate: '2026-06-20', phase: 'cut' }
};
report('② 同一人，按 v2 填全（三餐结构化 + 水合 + RPE + 分部位酸痛）',
  v2, { heightCm: 175, age: 24, sex: 'male', phase: 'cut', restingHrBaseline: 56 },
  [{ date: '2026-05-12', kg: 58.6 }, { date: '2026-05-13', kg: 58.5 }, { date: '2026-05-14', kg: 58.3 }, { date: '2026-05-15', kg: 58.1 }]);

// 3) 恢复之后，计划执行
const v3 = JSON.parse(JSON.stringify(v2));
v3.date = '2026-05-18';
v3.weights = { morning: { kg: 57.6 }, pre: { kg: 57.9 }, post: { kg: 57.2 } };
v3.sleep = { hours: 8, quality: 4 };
v3.hydration = { waterMl: 2600, urineColor: 2 };
v3.restingHr = 55;
v3.sorenessByArea = { shoulder: 2, back: 2, arm: 1, leg: 1, core: 0 };
v3.training = { sessionType: 'technique', durationMin: 90, rpe: 6, content: '速度技术课' };
v3.nextPlan = { type: 'sparring', note: '轻实战' };
report('③ 两天后恢复到位：同样的字段，反馈变成"可以上强度"',
  v3, { heightCm: 175, age: 24, sex: 'male', phase: 'cut', restingHrBaseline: 56 },
  [{ date: '2026-05-14', kg: 58.3 }, { date: '2026-05-15', kg: 58.1 }, { date: '2026-05-16', kg: 58 }, { date: '2026-05-17', kg: 57.8 }]);

console.log('\n' + bar(58) + '\n说明：以上为规则引擎真实输出，可用 node scripts/demo-report.js 复现。');
