// 跟进队列的模拟数据集：3 名拳手 × 2 天。
// 测试（scripts/test-followup.js）和演示（scripts/demo-followup.js）共用这一份，避免两边数据漂移。
const D1 = '2026-10-24', D2 = '2026-10-25', D3 = '2026-10-26';

function mealsOf(proteinG, kcal) {
  // 拆成三餐，保证结构化计数 = 3
  const each = Math.round(proteinG / 3);
  const k = Math.round(kcal / 3);
  return [
    { slot: 'breakfast', items: [{ name: '早餐', kcal: k, protein: each, carbs: Math.round(k / 6), fat: Math.round(k / 30) }] },
    { slot: 'lunch', items: [{ name: '午餐', kcal: k, protein: each, carbs: Math.round(k / 6), fat: Math.round(k / 30) }] },
    { slot: 'dinner', items: [{ name: '晚餐', kcal: k, protein: proteinG - each * 2, carbs: Math.round(k / 6), fat: Math.round(k / 30) }] }
  ];
}

// ---------- 拳手 A 阿力：cut 期，两天都脱水 + 蛋白不足 + 晨脉偏高 ----------
const A = { athleteId: 'a-li', name: '阿力', phase: 'cut', profile: { heightCm: 175, age: 24, sex: 'male', weightKg: 58, targetWeightKg: 57, restingHrBaseline: 58 } };
A.D1 = {
  date: D1, weights: { morning: { kg: 58 }, pre: { kg: 59 }, post: { kg: 57.0 } },
  sleep: { hours: 7, quality: 3 }, hydration: { waterMl: 700, urineColor: 5 }, restingHr: 66,
  training: { sessionType: 'sparring', durationMin: 90, rpe: 8 },
  sorenessByArea: { shoulder: 4, back: 3, arm: 2, leg: 1, core: 1 },
  meals: mealsOf(88, 1700), nextPlan: { type: 'technique' }, goal: {}
};
A.D2 = JSON.parse(JSON.stringify(A.D1));
A.D2.date = D2;
A.D2.sleep = { hours: 6.5, quality: 2 };
A.D2.sorenessByArea = { shoulder: 8, back: 5, arm: 3, leg: 2, core: 1 };
A.D2.nextPlan = { type: 'speed' };
A.D2.meals = mealsOf(90, 1650);
A.D2.weights = { morning: { kg: 57.9 }, pre: { kg: 59 }, post: { kg: 57.0 } };

// ---------- 拳手 B 小马：peak 期，第 1 天正常，第 2 天执行率崩 + 胃肠症状 ----------
const B = { athleteId: 'xiao-ma', name: '小马', phase: 'peak', profile: { heightCm: 178, age: 26, sex: 'male', weightKg: 61, targetWeightKg: 60, restingHrBaseline: 55 } };
B.D1 = {
  date: D1, weights: { morning: { kg: 61 } },
  sleep: { hours: 8, quality: 4 },
  hydration: { waterMl: 2950, urineColor: 2 },
  hydrationPlan: { planMl: 3000, actualMl: 2950, sodiumOk: true },
  giSymptoms: { nausea: 0, bloating: 1, cramp: 0, appetite: 1 },
  supplementPlan: { planned: ['creatine', 'caffeine'], taken: ['creatine', 'caffeine'] },
  training: { sessionType: 'technique', durationMin: 60, rpe: 5 },
  sorenessByArea: { shoulder: 2, back: 2 },
  meals: mealsOf(125, 2600), nextPlan: { type: 'technique' }, goal: {}
};
B.D2 = JSON.parse(JSON.stringify(B.D1));
B.D2.date = D2;
B.D2.hydrationPlan = { planMl: 3000, actualMl: 2100, sodiumOk: false };
B.D2.giSymptoms = { nausea: 3, bloating: 2, cramp: 1, appetite: 2 };
B.D2.sleep = { hours: 6.5, quality: 3 };
B.D2.supplementPlan = { planned: ['creatine', 'caffeine'], taken: ['creatine'] };

// ---------- 拳手 C 阿杰：recover 期，称重后补液补糖不足 ----------
const C = { athleteId: 'a-jie', name: '阿杰', phase: 'recover', profile: { heightCm: 172, age: 23, sex: 'male', weightKg: 58, targetWeightKg: 57, restingHrBaseline: 60 } };
C.D1 = {
  date: D1, weights: { morning: { kg: 57.6 }, official: { kg: 54, context: 'official' } },
  sleep: { hours: 8, quality: 4 },
  postWeighIn: { fluidMl: 2200, carbG: 520, fluidSodium: true, subjective: 4, weighInKg: 54, glycogenDepleted: true },
  giSymptoms: { nausea: 0, bloating: 0, cramp: 0, appetite: 1 },
  meals: mealsOf(110, 2400), goal: {}
};
C.D2 = JSON.parse(JSON.stringify(C.D1));
C.D2.date = D2;
C.D2.weights = { morning: { kg: 54.6 }, official: { kg: 54, context: 'official' } };
C.D2.postWeighIn = { fluidMl: 300, carbG: 50, fluidSodium: false, subjective: 2, weighInKg: 54, glycogenDepleted: true };

const athletes = [A, B, C].map(function (a) {
  return { athleteId: a.athleteId, name: a.name, phase: a.phase, profile: a.profile, log: a.D1 };
});

const athletesDay2 = [A, B, C].map(function (a) {
  return { athleteId: a.athleteId, name: a.name, phase: a.phase, profile: a.profile, log: a.D2 };
});

module.exports = { D1: D1, D2: D2, D3: D3, A: A, B: B, C: C, athletes: athletes, athletesDay2: athletesDay2, mealsOf: mealsOf };
