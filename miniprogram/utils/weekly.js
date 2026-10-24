// 周报：把 7 天的记录压成"能发给教练的一段话 + 一张指标表"。
// 纯函数，无 wx.*；页面只负责渲染。
const rules = require('./rules.js');

function shift(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function round(v, n) {
  if (v === null || v === undefined || !isFinite(v)) return null;
  const k = Math.pow(10, n === undefined ? 1 : n);
  return Math.round(v * k) / k;
}

function avg(list) {
  const v = list.filter(function (x) { return x !== null && x !== undefined && isFinite(x); });
  if (!v.length) return null;
  return v.reduce(function (s, x) { return s + x; }, 0) / v.length;
}

// 用当周最后一天的阶段（周中换了阶段，周报以当前阶段口径解释；变更记录在 phaseHistory 外）
function buildWeekly(input) {
  input = input || {};
  const days = input.days || 7;
  const endDate = input.endDate;
  const profile = input.profile || {};
  const phase = rules.resolvePhase(input.phase || profile.phase);
  const prof = rules.getPhaseProfile(phase);
  const fromDate = shift(endDate, -(days - 1));

  const all = (input.logs || []).filter(function (l) { return l && l.date; })
    .slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  const window = all.filter(function (l) { return l.date >= fromDate && l.date <= endDate; });

  const weightsAll = all.filter(function (l) {
    return l.weights && l.weights.morning && l.weights.morning.kg;
  }).map(function (l) { return { date: l.date, kg: Number(l.weights.morning.kg) }; });

  const rows = window.map(function (l) {
    const pts = weightsAll.filter(function (p) { return p.date <= l.date; });
    return { date: l.date, log: l, fb: rules.evaluate(l, { profile: profile, phase: phase, recentMorningWeights: pts }) };
  });

  // ---------- 体重 ----------
  const morning = window.filter(function (l) { return l.weights && l.weights.morning && l.weights.morning.kg; })
    .map(function (l) { return { date: l.date, kg: Number(l.weights.morning.kg) }; });
  const firstKg = morning.length ? morning[0].kg : null;
  const lastKg = morning.length ? morning[morning.length - 1].kg : null;
  const deltaKg = (firstKg !== null && lastKg !== null) ? round(lastKg - firstKg, 1) : null;
  const weeklyRate = rules.weeklyRate(morning);
  const weeklyPct = (weeklyRate !== null && lastKg) ? round(Math.abs(weeklyRate) / lastKg * 100, 1) : null;
  const avgKg = round(avg(morning.map(function (m) { return m.kg; })), 2);

  // ---------- 蛋白 ----------
  const proteinKnown = rows.filter(function (r) { return r.fb.protein.level !== 'unknown'; });
  const proteinOk = proteinKnown.filter(function (r) { return r.fb.protein.level === 'ok'; });
  const proteinRate = proteinKnown.length ? Math.round(proteinOk.length / proteinKnown.length * 100) : null;
  const proteinAvgG = proteinKnown.length ? Math.round(avg(proteinKnown.map(function (r) { return r.fb.protein.actualG; }))) : null;
  const proteinTargetG = proteinKnown.length ? proteinKnown[proteinKnown.length - 1].fb.protein.targetG : null;

  // ---------- 能量 ----------
  const energyKnown = rows.filter(function (r) { return r.fb.energy.dataOk; });
  const energyAvg = energyKnown.length ? Math.round(avg(energyKnown.map(function (r) { return r.fb.energy.intake; }))) : null;
  const energyBal = energyKnown.length ? Math.round(avg(energyKnown.map(function (r) { return r.fb.energy.balance; }))) : null;

  // ---------- 训练负荷 ----------
  const loadRows = rows.filter(function (r) { return r.fb.sRPE; });
  const loadTotal = loadRows.reduce(function (s, r) { return s + r.fb.sRPE; }, 0);
  const loadAvg = loadRows.length ? Math.round(loadTotal / loadRows.length) : null;
  const loadMaxRow = loadRows.slice().sort(function (a, b) { return b.fb.sRPE - a.fb.sRPE; })[0];

  // ---------- 睡眠 ----------
  const sleepRows = rows.filter(function (r) { return r.fb.recovery.sleepHours !== null; });
  const sleepAvg = sleepRows.length ? round(avg(sleepRows.map(function (r) { return r.fb.recovery.sleepHours; })), 1) : null;
  const sleepThreshold = phase === 'peak' ? 7 : 6.5;
  const sleepShortDays = sleepRows.filter(function (r) { return r.fb.recovery.sleepHours < sleepThreshold; }).length;

  // ---------- 水合 ----------
  let hydMeasured = 0, hydOver2 = 0, planRates = [];
  rows.forEach(function (r) {
    if (r.fb.hydration.mode === 'plan') {
      if (r.fb.hydration.planRate !== null) planRates.push(r.fb.hydration.planRate);
      return;
    }
    if (r.fb.hydration.pct !== null) {
      hydMeasured += 1;
      if (r.fb.hydration.pct >= 2) hydOver2 += 1;
    }
  });
  const planAvg = planRates.length ? Math.round(avg(planRates)) : null;

  // ---------- 恢复 ----------
  const soreRows = rows.filter(function (r) { return r.fb.recovery.sorenessMax !== null; });
  const soreMax = soreRows.length ? Math.max.apply(null, soreRows.map(function (r) { return r.fb.recovery.sorenessMax; })) : null;
  const soreHighDays = soreRows.filter(function (r) { return r.fb.recovery.sorenessMax >= 7; }).length;
  const giBadDays = rows.filter(function (r) { return r.fb.recovery.giMax !== null && r.fb.recovery.giMax >= 2; }).length;

  // ---------- 记录完整度 ----------
  const loggedDays = window.length;
  const mealCounts = window.map(function (l) { return (l.meals || []).filter(function (m) { return m.items && m.items.length; }).length; });
  const mealsAvg = loggedDays ? round(avg(mealCounts), 1) : null;
  const completeDays = rows.filter(function (r) { return (r.fb.missingRequired || []).length === 0; }).length;

  // ---------- 规则触发统计（周报里最有用的一张表） ----------
  const hits = {};
  rows.forEach(function (r) {
    (r.fb.alerts || []).forEach(function (a) {
      if (!hits[a.ruleId]) hits[a.ruleId] = { ruleId: a.ruleId, name: a.ruleName, count: 0, red: 0, amber: 0, title: a.title };
      hits[a.ruleId].count += 1;
      if (a.level === 'red') hits[a.ruleId].red += 1;
      if (a.level === 'amber') hits[a.ruleId].amber += 1;
    });
  });
  const ruleHits = Object.keys(hits).map(function (k) { return hits[k]; })
    .sort(function (a, b) { return b.red - a.red || b.count - a.count; });

  // ---------- 结论（能落到数字上，不写空话） ----------
  const conclusions = [];
  if (weeklyRate !== null) {
    const dir = weeklyRate < 0 ? '降' : '增';
    conclusions.push('体重' + dir + ' ' + Math.abs(weeklyRate) + 'kg/周（' + weeklyPct + '%），' +
      (phase === 'cut'
        ? (weeklyPct > 1 ? '超过 1% 上限，减掉的会有相当比例是肌肉与水分' : (weeklyPct < 0.3 ? '低于 0.3%，进度偏慢' : '在 0.5–1% 的安全区间内'))
        : '本阶段不以减重为目标，仅作观察'));
  } else if (morning.length) {
    conclusions.push('本周只有 ' + morning.length + ' 个晨重点，算不出 7 日斜率（至少要 4 个）');
  }

  if (proteinRate !== null) {
    conclusions.push('蛋白达标 ' + proteinOk.length + '/' + proteinKnown.length + ' 天（' + proteinRate + '%），' +
      '日均 ' + proteinAvgG + 'g' + (proteinTargetG ? ' / 目标下限约 ' + Math.round(proteinTargetG * 0.9) + 'g' : '') +
      (proteinRate >= 85 ? '，执行到位' : '，是最值得先补的一项'));
  }

  if (phase === 'peak' && planAvg !== null) {
    conclusions.push('补液计划平均执行率 ' + planAvg + '%' + (planAvg >= 90 ? '，按计划走' : '，偏离计划会直接影响称重与场上状态'));
  } else if (hydMeasured) {
    conclusions.push('训练脱水 ≥2% 有 ' + hydOver2 + '/' + hydMeasured + ' 天' + (hydOver2 ? '，补液时机需要提前' : '，水合控制良好'));
  }

  if (sleepAvg !== null) {
    conclusions.push('睡眠均值 ' + sleepAvg + ' 小时，低于 ' + sleepThreshold + 'h 的有 ' + sleepShortDays + ' 天');
  }

  if (loadRows.length) {
    conclusions.push('训练负荷共 ' + loadTotal + ' sRPE（' + loadRows.length + ' 次课，均 ' + loadAvg + '）' +
      (loadMaxRow ? '，最高 ' + loadMaxRow.date.slice(5) + ' 的 ' + loadMaxRow.fb.sRPE : ''));
  }

  if (soreHighDays) conclusions.push('酸痛 ≥7 有 ' + soreHighDays + ' 天，峰值 ' + soreMax + '/10');
  if (giBadDays) conclusions.push('胃肠症状 ≥2 有 ' + giBadDays + ' 天（微调/恢复期要优先处理耐受）');

  // ---------- 下周建议（按阶段 + 最弱项） ----------
  const nextWeek = [];
  if (proteinRate !== null && proteinRate < 85) {
    nextWeek.push('蛋白：把 ' + (proteinTargetG ? proteinTargetG : '目标') + 'g 拆成 3–4 餐，每餐先定蛋白再配主食；优先乳清/鸡蛋/鸡胸');
  }
  if (phase === 'cut' && weeklyPct !== null && weeklyPct > 1) {
    nextWeek.push('减重速率：把每日缺口收到 300–600 kcal，别靠加练；本周安排一次 refeed');
  }
  if (phase === 'cut' && weeklyPct !== null && weeklyPct < 0.3) {
    nextWeek.push('减重偏慢：先核对是否漏记（饮料、坚果、油），再决定是否加深 100–200 kcal');
  }
  if (phase === 'peak') {
    nextWeek.push('微调期：固定补液计划的时间点与钠量，训练量下调但保持技术课强度');
  }
  if (sleepShortDays >= 2) {
    nextWeek.push('睡眠：先把入睡时间固定下来（比补觉有效），目标 7–9 小时');
  }
  if (hydOver2 >= 2) {
    nextWeek.push('水合：训练前 2h 补 500ml 含钠液体，训练中每 15–20 分钟 150–250ml');
  }
  if (mealsAvg !== null && mealsAvg < 2.5) {
    nextWeek.push('记录：每餐拍照+选食物，先把结构化餐次补到 3 餐，否则评分只代表已记录部分');
  }
  if (!nextWeek.length) {
    nextWeek.push('保持当前节奏：' + prof.label + '的目标是「' + prof.goal + '」，下周同一时间再看趋势');
  }

  // ---------- 分享文本 ----------
  const text = [
    '【' + fromDate + ' ~ ' + endDate + ' 周报】' + prof.label,
    '晨重 ' + (firstKg === null ? '--' : firstKg + ' → ' + lastKg + 'kg') +
      (weeklyRate !== null ? '（' + (weeklyRate > 0 ? '+' : '') + weeklyRate + 'kg/周，' + weeklyPct + '%）' : ''),
    '蛋白 ' + (proteinRate === null ? '数据不足' : proteinRate + '%（' + proteinOk.length + '/' + proteinKnown.length + ' 天）'),
    '训练 ' + (loadRows.length ? loadTotal + ' sRPE / ' + loadRows.length + ' 课' : '无记录') +
      (sleepAvg !== null ? ' · 睡眠 ' + sleepAvg + 'h' : ''),
    phase === 'peak' && planAvg !== null ? '补液执行 ' + planAvg + '%' : (hydMeasured ? '脱水≥2% ' + hydOver2 + '/' + hydMeasured + ' 天' : ''),
    '主要问题：' + (ruleHits.slice(0, 3).map(function (h) { return h.ruleId + ' ' + h.name + '×' + h.count; }).join('；') || '无'),
    '下周：' + nextWeek[0]
  ].filter(Boolean).join('\n');

  return {
    phase: phase,
    phaseLabel: prof.label,
    fromDate: fromDate,
    toDate: endDate,
    days: days,
    loggedDays: loggedDays,
    completeDays: completeDays,
    weight: { firstKg: firstKg, lastKg: lastKg, deltaKg: deltaKg, avgKg: avgKg, weeklyRate: weeklyRate, weeklyPct: weeklyPct, points: morning.length },
    protein: { rate: proteinRate, okDays: proteinOk.length, knownDays: proteinKnown.length, avgG: proteinAvgG, targetG: proteinTargetG },
    energy: { avgIntake: energyAvg, avgBalance: energyBal, knownDays: energyKnown.length },
    load: { total: loadTotal, avg: loadAvg, sessions: loadRows.length, maxDate: loadMaxRow ? loadMaxRow.date : '', max: loadMaxRow ? loadMaxRow.fb.sRPE : null },
    sleep: { avg: sleepAvg, shortDays: sleepShortDays, threshold: sleepThreshold },
    hydration: { measuredDays: hydMeasured, over2Days: hydOver2, planAvg: planAvg },
    recovery: { soreMax: soreMax, soreHighDays: soreHighDays, giBadDays: giBadDays },
    meals: { avg: mealsAvg },
    ruleHits: ruleHits,
    conclusions: conclusions,
    nextWeek: nextWeek,
    text: text
  };
}

module.exports = { buildWeekly: buildWeekly, shift: shift };
