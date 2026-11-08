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

// refeed 结构化派生（文档 §7.6）：计划天数持久化在 profile.refeedDays（营养师经 coachApi.setRefeedPlan 写入，
// 0–7 整数；调用方可用 event.refeedDays 临时覆盖），缺省 null 表示本周不安排。
// 实际完成 = 当日 meals 碳水总量达到 refeed 日目标（默认 6 g/kg，高于减脂常规 3–5 g/kg）。
// 没有计划天数时不产出对象，goalAdherence 按“跳过该组件并重归一”处理。
function deriveRefeed(input) {
  input = input || {};
  const rawPlan = input.plannedDays !== undefined ? input.plannedDays : input.refeedDays;
  const plannedDays = Number(rawPlan);
  if (!isFinite(plannedDays) || plannedDays <= 0) return null;
  const endDate = input.endDate;
  if (!endDate) return null;
  const days = Math.min(Math.max(Number(input.days) || 7, 1), 28);
  const fromDate = shift(endDate, -(days - 1));
  const logs = (input.logs || []).filter(function (l) { return l && l.date; });
  const window = logs.filter(function (l) { return l.date >= fromDate && l.date <= endDate; });

  let bw = Number(input.weightKg);
  if (!isFinite(bw) || bw <= 0) {
    const morning = logs.filter(function (l) { return l.weights && l.weights.morning && l.weights.morning.kg; })
      .map(function (l) { return Number(l.weights.morning.kg); })
      .filter(function (v) { return isFinite(v) && v > 0; });
    bw = morning.length ? morning[morning.length - 1] : Number(input.profile && input.profile.weightKg);
  }
  if (!isFinite(bw) || bw <= 0) return null;

  const targetGPerKg = Number(input.carbGPerKg) || 6;
  const targetG = Math.round(bw * targetGPerKg);
  let okDays = 0;
  window.forEach(function (l) {
    const carbs = (l.meals || []).reduce(function (s, m) {
      const itemCarbs = (m.items || []).reduce(function (t, it) { return t + (Number(it.carbs) || 0); }, 0);
      return s + itemCarbs + (Number(m.carbs) || 0);
    }, 0);
    if (carbs >= targetG) okDays += 1;
  });
  const totalDays = Math.round(Math.min(plannedDays, days));
  const rate = totalDays ? Math.min(1, okDays / totalDays) : 0;
  return {
    plannedDays: totalDays,
    actualDays: okDays,
    successRate: Math.round(rate * 100),
    rate: rate,
    okDays: okDays,
    totalDays: totalDays,
    targetCarbsGPerKg: targetGPerKg,
    targetCarbsG: targetG
  };
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
  }).map(function (l) { return { date: l.date, kg: Number(l.weights.morning.kg) }; })
    .filter(function (p) { return isFinite(p.kg); });

  const rows = window.map(function (l) {
    const pts = weightsAll.filter(function (p) { return p.date <= l.date; });
    return { date: l.date, log: l, fb: rules.evaluate(l, { profile: profile, phase: phase, recentMorningWeights: pts }) };
  });

  // ---------- 体重 ----------
  const morning = window.filter(function (l) { return l.weights && l.weights.morning && l.weights.morning.kg; })
    .map(function (l) { return { date: l.date, kg: Number(l.weights.morning.kg) }; })
    .filter(function (m) { return isFinite(m.kg); });
  const firstKg = morning.length ? morning[0].kg : null;
  const lastKg = morning.length ? morning[morning.length - 1].kg : null;
  // 只有 1 个点时首末相同，差值恒为 0；不能把“没测到变化”显示成“周内 0kg”
  const deltaKg = (morning.length >= 2 && firstKg !== null && lastKg !== null)
    ? round(lastKg - firstKg, 1) : null;
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
  const energyOk = energyKnown.filter(function (r) { return r.fb.energy.level === 'ok'; });
  const energyRate = energyKnown.length ? Math.round(energyOk.length / energyKnown.length * 100) : null;
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
    const trend = weeklyRate === 0
      ? '体重持平（0kg/周）'
      : '体重' + (weeklyRate < 0 ? '降' : '增') + ' ' + Math.abs(weeklyRate) + 'kg/周（' + weeklyPct + '%）';
    conclusions.push(trend + '，' +
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

  // ---------- refeed（减脂期周频次目标） ----------
  const refeed = deriveRefeed({
    logs: all,
    endDate: endDate,
    days: days,
    profile: profile,
    weightKg: avgKg || lastKg || profile.weightKg,
    plannedDays: input.refeedDays,
    carbGPerKg: input.refeedCarbGPerKg
  });

  // ---------- 分享文本 ----------
  const text = [
    '【' + fromDate + ' ~ ' + endDate + ' 周报】' + prof.label,
    '晨重 ' + (firstKg === null ? '--'
      : (morning.length === 1 ? firstKg + 'kg（仅 1 个晨重点）' : firstKg + ' → ' + lastKg + 'kg')) +
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
    weight: { firstKg: firstKg, lastKg: lastKg, deltaKg: deltaKg, avgKg: avgKg, weeklyRate: weeklyRate, weeklyPct: weeklyPct, points: morning.length, series: morning },
    protein: { rate: proteinRate, okDays: proteinOk.length, knownDays: proteinKnown.length, avgG: proteinAvgG, targetG: proteinTargetG },
    energy: { rate: energyRate, okDays: energyOk.length, avgIntake: energyAvg, avgBalance: energyBal, knownDays: energyKnown.length },
    load: { total: loadTotal, avg: loadAvg, sessions: loadRows.length, maxDate: loadMaxRow ? loadMaxRow.date : '', max: loadMaxRow ? loadMaxRow.fb.sRPE : null },
    sleep: { avg: sleepAvg, shortDays: sleepShortDays, threshold: sleepThreshold },
    hydration: { measuredDays: hydMeasured, over2Days: hydOver2, planAvg: planAvg },
    recovery: { soreMax: soreMax, soreHighDays: soreHighDays, giBadDays: giBadDays },
    meals: { avg: mealsAvg },
    ruleHits: ruleHits,
    conclusions: conclusions,
    nextWeek: nextWeek,
    refeed: refeed,
    text: text
  };
}

// 与上一周对比：只比较两期都有数的指标；缺一期时明确说"不可对比"，不拿 0 充数。
// 数字格式在这里一次算好，页面与长图都直接取用，避免两套算法。
function hasNum(v) { return typeof v === 'number' && isFinite(v); }

function fixed(v, digits) {
  const k = Math.pow(10, digits === undefined ? 0 : digits);
  return Math.round(v * k) / k;
}

function hitTotal(w) {
  return (w && w.ruleHits ? w.ruleHits : []).reduce(function (s, h) { return s + (h.count || 0); }, 0);
}

function compareWeekly(cur, prev) {
  const prevAvailable = !!(prev && prev.loggedDays > 0);
  const curSafe = cur || { weight: {}, protein: {}, energy: {}, ruleHits: [] };
  const prevSafe = prev || { weight: {}, protein: {}, energy: {}, ruleHits: [] };

  function row(key, label, cv, pv, opts) {
    opts = opts || {};
    const digits = opts.digits === undefined ? 0 : opts.digits;
    const unit = opts.unit || '';
    const tv = function (v) {
      if (!hasNum(v)) return '--';
      return fixed(v, digits) + unit;
    };
    let curText = tv(cv);
    let prevText = prevAvailable ? tv(pv) : '--';
    let deltaText = '';
    let tone = '';
    if (!prevAvailable) {
      deltaText = '上周无数据可对比';
    } else if (!hasNum(cv)) {
      deltaText = '本期无数据';
    } else if (!hasNum(pv)) {
      deltaText = '上周无此项数据';
    } else {
      const d = fixed(cv - pv, digits);
      if (d === 0) {
        deltaText = opts.zeroText || '无变化';
      } else {
        deltaText = (d > 0 ? '+' : '-') + Math.abs(d) + (opts.deltaUnit || unit);
      }
      if (opts.better === 'up') tone = d > 0 ? 'good' : (d < 0 ? 'bad' : '');
      if (opts.better === 'down') tone = d < 0 ? 'good' : (d > 0 ? 'bad' : '');
    }
    return {
      key: key, label: label,
      cur: hasNum(cv) ? cv : null, prev: prevAvailable && hasNum(pv) ? pv : null,
      curText: curText, prevText: prevText, deltaText: deltaText,
      tone: tone
    };
  }

  const rows = [
    row('weight', '晨重（周末）', curSafe.weight.lastKg, prevSafe.weight.lastKg,
      { digits: 1, unit: ' kg', zeroText: '持平' }),
    row('weeklyRate', '体重速率', curSafe.weight.weeklyRate, prevSafe.weight.weeklyRate,
      { digits: 1, unit: ' kg/周', zeroText: '持平' }),
    row('proteinRate', '蛋白达标率', curSafe.protein.rate, prevSafe.protein.rate,
      { digits: 0, unit: '%', deltaUnit: ' 个百分点', better: 'up', zeroText: '无变化' }),
    row('energyRate', '能量达标率', curSafe.energy.rate, prevSafe.energy.rate,
      { digits: 0, unit: '%', deltaUnit: ' 个百分点', better: 'up', zeroText: '无变化' }),
    row('ruleHits', '规则命中', hitTotal(curSafe), prevAvailable ? hitTotal(prevSafe) : null,
      { digits: 0, unit: ' 天次', better: 'down', zeroText: '无变化' })
  ];

  return {
    prevAvailable: prevAvailable,
    prevLoggedDays: prev ? prev.loggedDays : 0,
    prevFromDate: prev ? prev.fromDate : '',
    prevEndDate: prev ? prev.toDate : '',
    curRuleHits: hitTotal(curSafe),
    prevRuleHits: prevAvailable ? hitTotal(prevSafe) : null,
    rows: rows
  };
}

module.exports = { buildWeekly: buildWeekly, compareWeekly: compareWeekly, deriveRefeed: deriveRefeed, shift: shift };
