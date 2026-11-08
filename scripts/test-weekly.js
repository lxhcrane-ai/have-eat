// 阶段建议 + 周报的回归测试
// 用法：node scripts/test-weekly.js
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));
const weekly = require(path.join(__dirname, '../miniprogram/utils/weekly.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function shiftDate(date, days) { return weekly.shift(date, days); }

console.log('\n1) 阶段建议：距称重天数决定建议阶段');
const base = { phase: 'maintain', weightKg: 58, targetWeightKg: 57, heightCm: 175, age: 24, sex: 'male' };
const today = '2026-10-25';
const cases = [
  { days: 100, want: 'maintain', label: '>12 周还没到减脂窗口' },
  { days: 84, want: 'cut', label: '12 周整进入减脂期' },
  { days: 35, want: 'cut', label: '5 周 → 减脂期' },
  { days: 15, want: 'cut', label: '15 天仍在减脂期' },
  { days: 14, want: 'peak', label: '14 天进入微调期' },
  { days: 3, want: 'peak', label: '3 天仍在微调期' },
  { days: 0, want: 'peak', label: '称重当天（还没过）仍按微调期' },
  { days: -1, want: 'recover', label: '称重后 1 天 → 恢复期' },
  { days: -2, want: 'recover', label: '称重后 2 天 → 恢复期' },
  { days: -4, want: 'maintain', label: '称重后 4 天 → 回到维持期' }
];
cases.forEach(function (c) {
  const p = Object.assign({}, base, { weighInDate: shiftDate(today, c.days) });
  const s = rules.suggestPhase(p, { today: today });
  ok(s.phase === c.want, '距称重 ' + c.days + ' 天 → ' + c.want + '（' + c.label + '）', { got: s.phase, reason: s.reason });
  ok(s.reason.length > 4, '给出文字理由（' + c.days + ' 天）');
});

console.log('\n2) 阶段建议：体重已接近目标时不建议减脂');
const near = Object.assign({}, base, { weightKg: 57.5, targetWeightKg: 57, weighInDate: shiftDate(today, 40) });
const sNear = rules.suggestPhase(near, { today: today });
ok(sNear.phase === 'maintain', '40 天但体重差 0.9% → 维持期', sNear);
ok(/接近目标/.test(sNear.reason), '理由里说明体重已接近目标', sNear.reason);
ok(sNear.gapPct !== null && sNear.gapPct < 1.5, '算出偏差百分比', sNear.gapPct);

console.log('\n3) 阶段建议：变更标记与紧急度');
const far = Object.assign({}, base, { phase: 'maintain', weighInDate: shiftDate(today, 40) });
const sFar = rules.suggestPhase(far, { today: today });
ok(sFar.changed === true, '建议与当前不同 → changed=true');
ok(sFar.urgency === 'amber' || sFar.urgency === 'info', '带紧急度', sFar.urgency);
const same = Object.assign({}, far, { phase: 'cut' });
ok(rules.suggestPhase(same, { today: today }).changed === false, '建议与当前一致 → changed=false');
const noDate = rules.suggestPhase({ phase: 'cut' }, { today: today });
ok(noDate.phase === 'maintain' && noDate.changed === true, '未设称重日 → 建议维持期');
ok(/未设称重日/.test(noDate.reason), '缺称重日时说明原因');

// ---------- 周报 ----------
function mkLog(date, i, opt) {
  opt = opt || {};
  const kg = Number((59.4 - 0.16 * i).toFixed(1));
  const pre = Number((kg + 0.8).toFixed(1));
  const drop = opt.drop === undefined ? 0.7 : opt.drop;
  return {
    date: date,
    weights: { morning: { kg: kg }, pre: { kg: pre }, post: { kg: Number((pre - drop).toFixed(1)) } },
    sleep: { hours: opt.sleep === undefined ? 7.5 : opt.sleep, quality: 3 },
    hydration: { waterMl: opt.water || 1800, urineColor: opt.urine || 3 },
    restingHr: 60,
    training: { sessionType: opt.session || 'technique', durationMin: opt.dur || 70, rpe: opt.rpe || 6 },
    sorenessByArea: { shoulder: opt.sore || 3, back: 2, arm: 1, leg: 1, core: 1 },
    meals: opt.protein === undefined ? [
      { slot: 'breakfast', items: [{ kcal: 500, protein: 35, carbs: 60, fat: 12 }] },
      { slot: 'lunch', items: [{ kcal: 700, protein: 45, carbs: 80, fat: 18 }] },
      { slot: 'dinner', items: [{ kcal: 600, protein: 40, carbs: 60, fat: 15 }] }
    ] : [
      { slot: 'breakfast', items: [{ kcal: 400, protein: Math.round(opt.protein * 0.3), carbs: 55, fat: 10 }] },
      { slot: 'lunch', items: [{ kcal: 600, protein: Math.round(opt.protein * 0.4), carbs: 70, fat: 15 }] },
      { slot: 'dinner', items: [{ kcal: 500, protein: opt.protein - Math.round(opt.protein * 0.3) - Math.round(opt.protein * 0.4), carbs: 55, fat: 12 }] }
    ],
    nextPlan: { type: 'technique' },
    goal: {}
  };
}

console.log('\n4) 周报：完整 7 天（cut）');
const end = '2026-06-30';
const logsCut = [];
for (let i = 0; i < 8; i++) {
  const d = shiftDate(end, i - 7);
  // 第 4、5 天故意蛋白不足 + 脱水 2.6% + 睡眠 5.8h
  const bad = (i === 4 || i === 5);
  logsCut.push(Object.assign(mkLog(d, i, {
    drop: bad ? 1.5 : 0.7,
    protein: bad ? 90 : 132,
    sleep: bad ? 5.8 : 7.5
  }), {}));
}
const profileCut = { phase: 'cut', weightKg: 58, targetWeightKg: 56, heightCm: 175, age: 24, sex: 'male', restingHrBaseline: 58 };
const w = weekly.buildWeekly({ logs: logsCut, profile: profileCut, endDate: end, days: 7 });

ok(w.loggedDays === 7, '统计 7 天', w.loggedDays);
ok(w.phase === 'cut' && w.phaseLabel === '减脂期', '带阶段标签');
ok(w.weight.points === 7, '7 个晨重点', w.weight.points);
ok(w.weight.firstKg !== null && w.weight.lastKg !== null && w.weight.lastKg < w.weight.firstKg, '体重在降', [w.weight.firstKg, w.weight.lastKg]);
ok(w.weight.weeklyRate !== null && w.weight.weeklyRate < 0, '算出周斜率', w.weight.weeklyRate);
ok(w.protein.rate !== null && w.protein.rate < 100, '蛋白达标率不是 100%', w.protein.rate);
ok(w.protein.okDays >= 4, '达标天数 >= 4', w.protein.okDays);
ok(w.hydration.over2Days >= 2, '脱水 ≥2% 至少 2 天', w.hydration);
ok(w.sleep.shortDays >= 2, '睡眠不足至少 2 天', w.sleep);
ok(w.load.total > 0 && w.load.sessions === 7, '训练负荷累计', w.load);
ok(w.ruleHits.length > 0 && w.ruleHits[0].ruleId, '规则触发统计有内容', w.ruleHits[0]);
ok(w.ruleHits.some(function (h) { return h.ruleId === 'PRO-01'; }), 'PRO-01 出现在触发统计里');
ok(w.ruleHits.some(function (h) { return h.ruleId === 'HYD-01'; }), 'HYD-01 出现在触发统计里');
ok(w.conclusions.length >= 4, '至少 4 条结论', w.conclusions.length);
ok(w.nextWeek.length >= 1, '至少 1 条下周建议', w.nextWeek);
ok(w.text.indexOf('周报') >= 0 && w.text.indexOf('蛋白') >= 0 && w.text.indexOf('下周') >= 0, '分享文本含关键段落');
ok(w.text.split('\n').length >= 6, '分享文本至少 6 行', w.text.split('\n').length);
ok(w.completeDays >= 5, '完整记录天数 ≥5', w.completeDays);

console.log('\n5) 周报：微调期口径（看计划执行率，不看脱水百分比）');
const logsPeak = [];
for (let i = 0; i < 7; i++) {
  const d = shiftDate(end, i - 6);
  const l = mkLog(d, i, { protein: 130, sleep: 7.8 });
  l.hydrationPlan = { planMl: 3000, actualMl: i === 6 ? 2400 : 2950, sodiumOk: true };
  l.giSymptoms = { nausea: 0, bloating: 1, cramp: 0, appetite: 1 };
  l.supplementPlan = { planned: ['creatine'], taken: ['creatine'] };
  logsPeak.push(l);
}
const profilePeak = { phase: 'peak', weightKg: 58, targetWeightKg: 56, heightCm: 175, age: 24, sex: 'male' };
const wp = weekly.buildWeekly({ logs: logsPeak, profile: profilePeak, endDate: end, days: 7 });
ok(wp.phase === 'peak', '周报按微调期口径', wp.phase);
ok(wp.hydration.planAvg !== null && wp.hydration.planAvg < 100, '算出补液计划平均执行率', wp.hydration.planAvg);
ok(wp.hydration.measuredDays === 0, '微调期不统计脱水百分比天数', wp.hydration.measuredDays);
ok(!wp.ruleHits.some(function (h) { return h.ruleId === 'HYD-01'; }), '周报里不出现被抑制的 HYD-01');
ok(wp.sleep.threshold === 7, '微调期睡眠阈值 7h', wp.sleep.threshold);
ok(wp.conclusions.some(function (c) { return c.indexOf('补液计划') >= 0; }), '结论里提到补液计划执行率', wp.conclusions);

console.log('\n6) 周报：空数据与稀疏数据');
const wEmpty = weekly.buildWeekly({ logs: [], profile: {}, endDate: end, days: 7 });
ok(wEmpty.loggedDays === 0 && wEmpty.weight.weeklyRate === null, '空数据不崩、斜率 null');
ok(wEmpty.text.indexOf('周报') >= 0, '空数据也能生成一段文本');
const wSparse = weekly.buildWeekly({ logs: [mkLog(end, 0)], profile: profileCut, endDate: end, days: 7 });
ok(wSparse.loggedDays === 1, '只有 1 天也算得出来');
ok(wSparse.weight.weeklyRate === null, '少于 4 个点不给斜率');
ok(wSparse.conclusions.some(function (c) { return c.indexOf('晨重点') >= 0 || c.indexOf('斜率') >= 0; }), '说明为什么算不出斜率', wSparse.conclusions);

console.log('\n7) 周报与阶段引擎一致性');
ok(wp.ruleHits.every(function (h) { return rules.getRuleById(h.ruleId); }), '周报统计的每个 ruleId 都在登记表里');
const allowed = rules.PHASE_PROFILES.peak.activeRuleIds;
ok(wp.ruleHits.every(function (h) { return allowed.indexOf(h.ruleId) >= 0; }), '微调期周报只出现本阶段启用的规则', wp.ruleHits.map(function (h) { return h.ruleId; }));

console.log('\n8) 周报：单日、空数据、零斜率与跨月边界');
ok(wSparse.weight.deltaKg === null, '单日不把 0kg 当成周内变化', wSparse.weight.deltaKg);
ok(wSparse.text.indexOf('仅 1 个晨重点') >= 0, '单日分享文本不写成“x → x”', wSparse.text.split('\n')[1]);
ok(wEmpty.weight.deltaKg === null && wEmpty.weight.avgKg === null, '空数据体重字段为 null');
ok(wEmpty.protein.rate === null && wEmpty.load.sessions === 0, '空数据没有除零或假计数');

const endMar = '2026-03-03';
const crossMonth = [];
for (let i = 0; i < 7; i++) crossMonth.push(mkLog(shiftDate(endMar, i - 6), i, {}));
const wCross = weekly.buildWeekly({ logs: crossMonth, profile: profileCut, endDate: endMar, days: 7 });
ok(wCross.fromDate === '2026-02-25' && wCross.toDate === '2026-03-03', '跨月窗口边界正确', [wCross.fromDate, wCross.toDate]);
ok(wCross.loggedDays === 7 && wCross.weight.weeklyRate !== null, '跨月仍能统计 7 天并算出斜率', { loggedDays: wCross.loggedDays, rate: wCross.weight.weeklyRate });
ok(weekly.shift('2026-02-28', 1) === '2026-03-01', '月末 +1 天跨到下月');
ok(weekly.shift('2028-02-28', 1) === '2028-02-29', '闰年 2 月 28 日 +1 天');
ok(weekly.shift('2028-03-01', -1) === '2028-02-29', '闰年 3 月 1 日 -1 天');

const flat = [];
for (let i = 0; i < 7; i++) {
  const l = mkLog(shiftDate(end, i - 6), i, {});
  l.weights.morning.kg = 59;
  flat.push(l);
}
const wFlat = weekly.buildWeekly({ logs: flat, profile: profileCut, endDate: end, days: 7 });
ok(wFlat.weight.weeklyRate === 0, '体重持平时速率为 0', wFlat.weight.weeklyRate);
ok(wFlat.conclusions.some(function (c) { return c.indexOf('体重持平') >= 0; }), '0 斜率写成“持平”，不写成“增 0”', wFlat.conclusions[0]);

const badWeight = mkLog(end, 0, {});
badWeight.weights.morning.kg = 'abc';
const wBad = weekly.buildWeekly({ logs: [badWeight], profile: profileCut, endDate: end, days: 7 });
ok(wBad.weight.points === 0 && wBad.weight.lastKg === null, '非数字晨重被过滤，不显示 NaN', { points: wBad.weight.points, lastKg: wBad.weight.lastKg });

console.log('\n9) 周报：能量达标率与跨周对比');
ok(w.energy.rate !== null && w.energy.rate >= 0 && w.energy.rate <= 100, '能量达标率是 0–100 的百分比', w.energy.rate);
ok(w.energy.okDays <= w.energy.knownDays && w.energy.knownDays <= 7, '能量达标天数不超过可判断天数', w.energy);
ok(w.weight.series.length === 7 && w.weight.series[0].date === shiftDate(end, -6), '晨重序列按日期输出，可画曲线', w.weight.series[0]);
ok(wEmpty.energy.rate === null && wEmpty.energy.okDays === 0, '空数据能量达标率为 null，不除零');

const prevEnd = shiftDate(end, -7);
const logsPrev = [];
for (let i = 0; i < 7; i++) logsPrev.push(mkLog(shiftDate(prevEnd, i - 6), i, { protein: 85, sleep: 6.2 }));
const wPrev = weekly.buildWeekly({ logs: logsPrev, profile: profileCut, endDate: prevEnd, days: 7 });
const cmp = weekly.compareWeekly(w, wPrev);
ok(cmp.prevAvailable === true && cmp.rows.length === 5, '上一周有数据 → 输出 5 项对比', { ok: cmp.prevAvailable, rows: cmp.rows.length });
ok(cmp.prevFromDate === shiftDate(prevEnd, -6) && cmp.prevEndDate === prevEnd, '对比区间是上一周窗口', [cmp.prevFromDate, cmp.prevEndDate]);
ok(cmp.rows.every(function (r) { return r.curText !== undefined && r.prevText !== undefined && r.deltaText; }), '每项都有本期/上周/差值文案');
const pRow = cmp.rows.filter(function (r) { return r.key === 'proteinRate'; })[0];
ok(/个百分点/.test(pRow.deltaText) || pRow.deltaText === '无变化', '百分比差值用“个百分点”', pRow.deltaText);

const cmpNone = weekly.compareWeekly(w, null);
ok(cmpNone.prevAvailable === false, '没有上一周 → prevAvailable=false');
ok(cmpNone.rows.every(function (r) { return r.deltaText === '上周无数据可对比' && r.prevText === '--' && r.prev === null; }),
  '缺上周时明确写“上周无数据可对比”，不拿 0 冒充', cmpNone.rows[0]);
const cmpZeroWeek = weekly.compareWeekly(w, wEmpty);
ok(cmpZeroWeek.prevAvailable === false, '上一周为空数据（0 天）同样视为不可对比');

const cmpSame = weekly.compareWeekly(wFlat, wFlat);
ok(cmpSame.prevAvailable === true, '两期都有数据才允许对比');
ok(cmpSame.rows.filter(function (r) { return r.key === 'weight'; })[0].deltaText === '持平', '差值为 0 时写“持平”');
ok(cmpSame.rows.filter(function (r) { return r.key === 'ruleHits'; })[0].deltaText === '无变化', '规则命中差值为 0 时写“无变化”');

console.log('\n10) 周报：结构化 refeed（计划天数 / 实际完成 / 成功率）');
// 体重约 58.6kg × 6 g/kg ≈ 352g 碳水；第 3、5 天给 420g 碳水 → 命中 refeed 日。
const logsRefeed = [];
for (let i = 0; i < 7; i++) {
  const l = mkLog(shiftDate(end, i - 6), i, {});
  if (i === 2 || i === 4) l.meals = [{ slot: 'refeed', items: [{ kcal: 2800, protein: 140, carbs: 420, fat: 60 }] }];
  logsRefeed.push(l);
}
const wr2 = weekly.buildWeekly({ logs: logsRefeed, profile: profileCut, endDate: end, days: 7, refeedDays: 2 });
ok(wr2.refeed && wr2.refeed.plannedDays === 2, '输出计划天数 2', wr2.refeed);
ok(wr2.refeed && wr2.refeed.actualDays === 2, '实际完成天数 2', wr2.refeed && wr2.refeed.actualDays);
ok(wr2.refeed && wr2.refeed.successRate === 100 && wr2.refeed.rate === 1, '成功率 100%', wr2.refeed);
ok(wr2.refeed && wr2.refeed.targetCarbsGPerKg === 6, 'refeed 日目标 6 g/kg', wr2.refeed && wr2.refeed.targetCarbsG);
const wr3 = weekly.buildWeekly({ logs: logsRefeed, profile: profileCut, endDate: end, days: 7, refeedDays: 3 });
ok(wr3.refeed && wr3.refeed.actualDays === 2 && wr3.refeed.successRate === 67, '计划 3 完成 2 → 67%', wr3.refeed);
const wrNone = weekly.buildWeekly({ logs: logsRefeed, profile: profileCut, endDate: end, days: 7 });
ok(wrNone.refeed === null, '无计划天数 → refeed=null（goalAdherence 跳过该组件并重归一）');
ok(weekly.deriveRefeed({ logs: logsRefeed, endDate: end, days: 7, plannedDays: 1, weightKg: null, profile: {} }) !== null,
  '体重可从晨重记录回退，不因未传 weightKg 丢数据');

console.log('\n--- 分享文本示例（cut 周报） ---');
console.log(w.text);

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
