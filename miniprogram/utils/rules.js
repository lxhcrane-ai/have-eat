// 运动营养规则引擎：纯 JS，无 wx.* 依赖，可在小程序与 Node（云函数/测试）中同一份运行。
// 设计原则：只输出能被知识库条目解释的结论，每个 alert 都带 kb 引用，不凭空给建议。

const KB = require('../data/knowledge.js');

const KB_MAP = {};
KB.items.forEach(function (it) { KB_MAP[it.id] = it; });

const PLAN_LABEL = {
  technique: '技术课', speed: '速度课', power: '爆发课',
  max_strength: '最大力量课', conditioning: '体能课', rest: '休息'
};

const SESSION_LABEL = {
  rest: '休息',
  cardio: '有氧',
  strength: '力量',
  technique: '技术',
  sparring: '实战/对练',
  recovery: '恢复'
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : null;
}

function round1(v) { return Math.round(v * 10) / 10; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 兼容 v1 老格式（字符串数值、扁平字段），使历史 JSON 可以直接导入
function normalizeLog(raw) {
  raw = raw || {};
  var w = raw.weights || {};
  var out = {
    schemaVersion: 2,
    id: raw.id || '',
    date: raw.date || '',
    // tzOffset 统一为「UTC 以东的分钟数」：北京 = +480（不要用 getTimezoneOffset 的符号）
    tzOffset: typeof raw.tzOffset === 'number' ? raw.tzOffset : 480,
    weights: {
      morning: w.morning || (num(raw.morningWeight) !== null ? { kg: num(raw.morningWeight), context: 'morning_fasted' } : null),
      pre: w.pre || (num(raw.preTrainWeight) !== null ? { kg: num(raw.preTrainWeight), context: 'pre_train' } : null),
      post: w.post || (num(raw.postTrainWeight) !== null ? { kg: num(raw.postTrainWeight), context: 'post_train' } : null),
      official: w.official || null
    },
    sleep: {
      hours: num(raw.sleep && raw.sleep.hours !== undefined ? raw.sleep.hours : raw.sleepHours),
      quality: num(raw.sleep && raw.sleep.quality !== undefined ? raw.sleep.quality : raw.sleepQuality)
    },
    hydration: {
      waterMl: num(raw.hydration && raw.hydration.waterMl !== undefined ? raw.hydration.waterMl : raw.waterMl) || 0,
      urineColor: num(raw.hydration && raw.hydration.urineColor !== undefined ? raw.hydration.urineColor : raw.urineColor)
    },
    restingHr: num(raw.restingHr),
    training: {
      sessionType: (raw.training && raw.training.sessionType) || raw.sessionType || '',
      durationMin: num(raw.training && raw.training.durationMin !== undefined ? raw.training.durationMin : raw.durationMin),
      rpe: num(raw.training && raw.training.rpe !== undefined ? raw.training.rpe : raw.rpe),
      rounds: num(raw.training && raw.training.rounds !== undefined ? raw.training.rounds : raw.rounds),
      content: (raw.training && raw.training.content) || raw.trainingContent || ''
    },
    sorenessByArea: raw.sorenessByArea || {},
    sorenessLegacy: num(raw.soreness),
    focusAreas: raw.focusAreas || [],
    mood: raw.mood || {},
    meals: (raw.meals || []).map(function (m) {
      var items = m.items || [];
      // 老格式没有结构化条目：只保留文字，热量记为 0 并标 estimated
      var kcal = 0, p = 0, c = 0, f = 0;
      items.forEach(function (i) {
        kcal += num(i.kcal) || 0; p += num(i.protein) || 0;
        c += num(i.carbs) || 0; f += num(i.fat) || 0;
      });
      return {
        time: m.time || '',
        note: m.note || '',
        items: items,
        kcal: Math.round(kcal), protein: round1(p), carbs: round1(c), fat: round1(f),
        photoFileId: m.photoFileId || ((m.photoFilenames && m.photoFilenames[0]) || ''),
        source: items.length ? (m.source || 'library') : 'text_only'
      };
    }),
    nextPlan: raw.nextPlan && typeof raw.nextPlan === 'object'
      ? raw.nextPlan
      : { type: '', areas: [], intensity: '', note: raw.nextPlan || '' },
    goal: raw.goal || {},
    createdAt: raw.createdAt || raw.timestamp || ''
  };
  if (!out.date) out.date = (out.createdAt || '').slice(0, 10);
  return out;
}

// 体重 7 日回归斜率（kg/周）。点太少返回 null。
function weeklyRate(points) {
  var pts = (points || []).filter(function (p) { return num(p.kg) !== null; });
  if (pts.length < 4) return null;
  var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
  var x0 = new Date(pts[0].date).getTime();
  pts.forEach(function (p) {
    var x = (new Date(p.date).getTime() - x0) / 86400000;
    var y = num(p.kg);
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  });
  var den = n * sxx - sx * sx;
  if (!den) return null;
  var slopePerDay = (n * sxy - sx * sy) / den;
  return round1(slopePerDay * 7);
}

function sumMeals(log) {
  var t = { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0, structured: 0, withPhoto: 0 };
  (log.meals || []).forEach(function (m) {
    t.kcal += num(m.kcal) || 0;
    t.protein += num(m.protein) || 0;
    t.carbs += num(m.carbs) || 0;
    t.fat += num(m.fat) || 0;
    t.count += 1;
    if (m.items && m.items.length) t.structured += 1;
    if (m.photoFileId) t.withPhoto += 1;
  });
  t.kcal = Math.round(t.kcal);
  t.protein = Math.round(t.protein);
  t.carbs = Math.round(t.carbs);
  t.fat = Math.round(t.fat);
  return t;
}

function estimateTdee(log, profile, bw) {
  var p = profile || {};
  var sess = log.training.sessionType;
  var active = !!sess && sess !== 'rest';
  var act = active ? 1.55 : 1.375;
  if (active && sess === 'sparring') act = 1.725;
  if (num(p.heightCm) && num(p.age) && p.sex) {
    var bmr = 10 * bw + 6.25 * num(p.heightCm) - 5 * num(p.age) + (p.sex === 'male' ? 5 : -161);
    return Math.round(bmr * act);
  }
  return Math.round(bw * (active ? 40 : 33));
}

function evaluate(rawLog, ctx) {
  ctx = ctx || {};
  var log = normalizeLog(rawLog);
  var profile = ctx.profile || {};
  var phase = log.goal.phase || profile.phase || 'maintain';

  var bw = num(log.weights.morning && log.weights.morning.kg)
    || num(log.weights.pre && log.weights.pre.kg)
    || num(log.weights.post && log.weights.post.kg)
    || num(profile.weightKg) || null;

  var alerts = [];
  function add(code, level, title, text, kbIds) {
    alerts.push({ code: code, level: level, title: title, text: text, kb: kbIds || [] });
  }

  // ---------- 1. 水合 ----------
  var pre = num(log.weights.pre && log.weights.pre.kg);
  var post = num(log.weights.post && log.weights.post.kg);
  var hydration = { lossKg: null, pct: null, needMl: 0, remainingMl: 0, level: 'unknown', text: '' };
  if (pre && post && pre > post) {
    var loss = round1(pre - post);
    var pct = round1((loss / pre) * 100);
    hydration.lossKg = loss;
    hydration.pct = pct;
    hydration.needMl = Math.round(loss * 1.25 * 1000);
    hydration.remainingMl = Math.max(0, hydration.needMl - (log.hydration.waterMl || 0));
    if (pct >= 3) {
      hydration.level = 'red';
      hydration.text = '脱水 ' + pct + '%（' + loss + 'kg），已进入危险区，出拳速度和抗打击都会掉。';
      add('hyd-critical', 'red', '脱水 ' + pct + '%：今天必须优先补液',
        '训练掉了 ' + loss + 'kg，按每 kg 补 1.25–1.5L 计算，需补 ' + hydration.needMl + '–' + Math.round(loss * 1.5 * 1000) +
        'ml 含钠液体，分 3–4 次喝完。已记录饮水 ' + (log.hydration.waterMl || 0) + 'ml，还差 ' + hydration.remainingMl + 'ml。',
        ['hyd-2pct', 'hyd-replace', 'hyd-sodium']);
    } else if (pct >= 2) {
      hydration.level = 'amber';
      hydration.text = '脱水 ' + pct + '%（' + loss + 'kg），已到影响表现的阈值。';
      add('hyd-high', 'amber', '脱水 ' + pct + '%：补 ' + hydration.needMl + 'ml',
        '超过 2% 就开始掉表现。建议分次补 ' + hydration.needMl + '–' + Math.round(loss * 1.5 * 1000) + 'ml，含钠效果更好。',
        ['hyd-2pct', 'hyd-replace']);
    } else {
      hydration.level = 'ok';
      hydration.text = '脱水 ' + pct + '%，在可接受范围。';
    }
  } else if (pre && post && post >= pre) {
    hydration.level = 'ok';
    hydration.text = '训练前后体重无下降，注意是否补水过量。';
  }

  if (log.hydration.urineColor && log.hydration.urineColor >= 5) {
    add('hyd-urine', 'amber', '晨尿偏深（' + log.hydration.urineColor + '/8）',
      '提示夜间轻度脱水，起床后先补 300–500ml 水，再开始训练。',
      ['hyd-urine']);
  }

  // ---------- 2. 蛋白与能量 ----------
  var totals = sumMeals(log);
  var protein = { targetG: 0, minG: 0, maxG: 0, actualG: totals.protein, pct: 0, level: 'unknown', text: '', gPerKg: 0 };
  var energy = { tdee: 0, intake: totals.kcal, balance: 0, level: 'unknown', text: '', dataOk: false };

  if (bw) {
    var gMin = phase === 'cut' ? 2.0 : 1.6;
    var gMax = phase === 'cut' ? 2.4 : 2.2;
    protein.minG = Math.round(bw * gMin);
    protein.maxG = Math.round(bw * gMax);
    protein.targetG = Math.round(bw * (gMin + gMax) / 2);
    protein.gPerKg = round1(totals.protein / bw);
    protein.pct = protein.targetG ? Math.round((totals.protein / protein.targetG) * 100) : 0;

    var dataOk = totals.count >= 2 && totals.structured >= 1;
    energy.dataOk = dataOk;
    energy.tdee = estimateTdee(log, profile, bw);
    energy.balance = totals.kcal - energy.tdee;
    energy.balanceShown = dataOk ? energy.balance : null;

    if (!dataOk) {
      protein.level = 'unknown';
      protein.text = '今天只有 ' + totals.count + ' 餐记录，无法判断蛋白是否达标（目标 ' + protein.minG + '–' + protein.maxG + 'g）。';
      add('log-insufficient', 'amber', '记录不足：只有 ' + totals.count + ' 餐',
        '少于 2 餐的结构化记录无法评估能量和蛋白。补记剩余餐次，或明天开始每餐拍照+选食物。',
        ['basic-logging']);
    } else {
      if (protein.pct >= 100) {
        protein.level = 'ok';
        protein.text = '蛋白 ' + totals.protein + 'g（' + protein.gPerKg + ' g/kg），达标。';
      } else if (protein.pct >= 80) {
        protein.level = 'amber';
        protein.text = '蛋白 ' + totals.protein + 'g，完成目标的 ' + protein.pct + '%，再补 ' + Math.max(0, protein.targetG - totals.protein) + 'g。';
        add('protein-short', 'amber', '蛋白差 ' + Math.max(0, protein.targetG - totals.protein) + 'g',
          '目标 ' + protein.minG + '–' + protein.maxG + 'g（' + gMin + '–' + gMax + ' g/kg）。差的一口用 200ml 牛奶 + 1 个鸡蛋补上。',
          ['pro-total', 'pro-spread']);
      } else {
        protein.level = 'red';
        protein.text = '蛋白 ' + totals.protein + 'g，只有目标的 ' + protein.pct + '%。';
        add('protein-low', 'red', '蛋白严重不足：' + totals.protein + '/' + protein.targetG + 'g',
          '减重期蛋白不足会优先掉肌肉，出拳力量跟着掉。今天再加一份 150g 鸡胸或 30g 乳清（约 30g 蛋白）。',
          ['pro-total', 'pro-quality', 'pro-timing']);
      }

      // 能量：按阶段判断
      var bal = energy.balance;
      if (phase === 'cut') {
        if (bal > 200) {
          energy.level = 'amber';
          energy.text = '摄入比消耗高 ' + bal + ' kcal，减重期这会拖慢进度。';
          add('energy-over', 'amber', '热量盈余 ' + bal + ' kcal（减重期）',
            '按粗估消耗 ' + energy.tdee + ' kcal，今天吃超了。减重期建议 -300~-600 kcal/天。',
            ['carb-training', 'basic-plate']);
        } else if (bal < -900) {
          energy.level = 'red';
          energy.text = '缺口 ' + Math.abs(bal) + ' kcal，过深，容易掉肌肉和状态。';
          add('energy-under', 'red', '缺口过深 ' + Math.abs(bal) + ' kcal',
            '单日缺口控制在 300–600 kcal。长期低于 30 kcal/kg 去脂体重/天会进入低能量可用性，激素、睡眠、免疫一起出问题。',
            ['carb-energy-availability', 'wc-rate']);
        } else {
          energy.level = 'ok';
          energy.text = '缺口 ' + Math.abs(bal) + ' kcal，节奏合适。';
        }
      } else {
        if (Math.abs(bal) <= 350) {
          energy.level = 'ok';
          energy.text = '能量基本平衡（' + (bal > 0 ? '+' : '') + bal + ' kcal）。';
        } else if (bal > 350) {
          energy.level = 'amber';
          energy.text = '盈余 ' + bal + ' kcal，非减重期正常偏高。';
        } else {
          energy.level = 'amber';
          energy.text = '缺口 ' + Math.abs(bal) + ' kcal，维持期不该这个量。';
          add('energy-low', 'amber', '维持期出现 ' + Math.abs(bal) + ' kcal 缺口',
            '维持期目标是体重稳定。如果是训练加量导致的，把碳水补回来；如果是有意节食，请改成走 cut 阶段流程。',
            ['carb-training', 'carb-energy-availability']);
        }
      }

      // 蛋白分配
      if (totals.count && totals.protein / totals.count < 20) {
        add('protein-spread', 'info', '单餐蛋白偏少（平均 ' + Math.round(totals.protein / totals.count) + 'g）',
          '每餐 25–35g 蛋白对合成更有效。把蛋白分散到 3–5 餐，而不是集中在一餐。',
          ['pro-spread']);
      }
    }
  }

  // ---------- 3. 体重速率 ----------
  var rate = { kgPerWeek: null, pctPerWeek: null, level: 'unknown', text: '' };
  var pts = (ctx.recentMorningWeights || []).slice();
  if (bw && !pts.length) {
    pts = [{ date: log.date, kg: bw }];
  } else if (bw) {
    var hasToday = pts.some(function (p) { return p.date === log.date; });
    if (!hasToday) pts.push({ date: log.date, kg: bw });
  }
  var r = weeklyRate(pts);
  if (r !== null && bw) {
    rate.kgPerWeek = r;
    rate.pctPerWeek = round1((Math.abs(r) / bw) * 100 * 10) / 10;
    if (r < 0 && rate.pctPerWeek > 1) {
      rate.level = 'red';
      rate.text = '每周掉 ' + Math.abs(r) + 'kg（' + rate.pctPerWeek + '%），减太快。';
      add('rate-fast', 'red', '减重过快：' + Math.abs(r) + 'kg/周',
        '安全上限是每周 0.5–1% 体重（你约 ' + Math.round(bw * 0.005 * 100) / 100 + '–' + Math.round(bw * 0.01 * 100) / 100 + 'kg）。再快会掉肌肉和力量。',
        ['wc-rate', 'pro-total']);
    } else if (r < 0 && rate.pctPerWeek < 0.3 && phase === 'cut') {
      rate.level = 'amber';
      rate.text = '每周只掉 ' + Math.abs(r) + 'kg，减重进度偏慢。';
      add('rate-slow', 'info', '减重偏慢：' + Math.abs(r) + 'kg/周',
        '确认记录是否漏了餐。若确实吃这么多，把每日缺口再加深 100–200 kcal，别靠加练。',
        ['wc-rate', 'basic-logging']);
    } else if (r > 0.5 && phase === 'cut') {
      rate.level = 'amber';
      rate.text = '体重在涨（+' + r + 'kg/周），与减重目标相反。';
      add('rate-up', 'amber', '减重期体重上升',
        '先看 7 日移动平均，单点波动不算。若持续上升，检查是否漏记高热量食物（饮料、坚果、油）。',
        ['basic-logging', 'wc-refeed']);
    } else {
      rate.level = 'ok';
      rate.text = '周变化 ' + r + 'kg，节奏正常。';
    }
  } else {
    rate.text = '至少 4 天晨重才能算趋势（现有 ' + pts.length + ' 天）。';
  }

  // ---------- 4. 恢复 ----------
  var sVals = [];
  Object.keys(log.sorenessByArea || {}).forEach(function (k) {
    var v = num(log.sorenessByArea[k]);
    if (v !== null) sVals.push({ area: k, v: v });
  });
  if (!sVals.length && log.sorenessLegacy !== null) sVals.push({ area: 'overall', v: log.sorenessLegacy });
  sVals.sort(function (a, b) { return b.v - a.v; });
  var sorenessMax = sVals.length ? sVals[0].v : null;
  var sorenessTop = sVals.length ? sVals[0].area : '';

  var AREA_LABEL = { shoulder: '肩', back: '背', arm: '手臂', leg: '腿', core: '核心', overall: '全身' };
  function areaText(a) { return AREA_LABEL[a] || a; }

  var recovery = { sorenessMax: sorenessMax, sleepHours: log.sleep.hours, level: 'unknown', text: '' };
  var sleepBad = log.sleep.hours !== null && log.sleep.hours < 6.5;

  if (log.sleep.hours !== null && log.sleep.hours < 6) {
    add('sleep-short', 'red', '睡眠 ' + log.sleep.hours + ' 小时，不足',
      '低于 6 小时会同时压低力量、反应和自控力。今晚优先补到 7–9 小时，明天强度课考虑减量 20%。',
      ['rec-sleep', 'rec-sleep-hygiene']);
  } else if (sleepBad) {
    add('sleep-low', 'amber', '睡眠 ' + log.sleep.hours + ' 小时，偏少',
      '目标 7–9 小时。连续 3 天不足会累积成恢复赤字。',
      ['rec-sleep']);
  }

  if (sorenessMax !== null && sorenessMax >= 8) {
    add('sore-red', 'red', areaText(sorenessTop) + (sorenessTop === 'overall' ? '' : '部') + '酸痛 ' + sorenessMax + '/10',
      '这个程度做速度/爆发课收益极低、受伤风险高。今天改成技术、战术或低强度有氧，速度课往后挪。',
      ['rec-soreness']);
  } else if (sorenessMax !== null && sorenessMax >= 7) {
    add('sore-high', 'amber', areaText(sorenessTop) + (sorenessTop === 'overall' ? '' : '部') + '酸痛 ' + sorenessMax + '/10',
      '接近红线。力量课可以保留但降组数，速度课建议顺延。',
      ['rec-soreness']);
  }

  var hrDelta = null;
  if (num(log.restingHr) && num(profile.restingHrBaseline)) {
    hrDelta = num(log.restingHr) - num(profile.restingHrBaseline);
    if (hrDelta >= 5) {
      add('hr-up', 'amber', '晨脉高于基线 ' + hrDelta + ' 次/分',
        '连续两天偏高通常意味着恢复不足、脱水或感染前兆。今天减量 10–20%。',
        ['rec-hrv', 'rec-soreness']);
    }
  }

  // 计划冲突：酸痛/睡眠 vs 次日计划类型
  var plan = log.nextPlan || {};
  var planType = plan.type || '';
  var FAST_TYPES = ['speed', 'power', 'max_strength'];
  var conflict = null;
  if (FAST_TYPES.indexOf(planType) >= 0 && (sorenessMax !== null && sorenessMax >= 7 || sleepBad)) {
    conflict = {
      planType: planType,
      planTypeLabel: PLAN_LABEL[planType] || planType,
      reason: (sorenessMax !== null && sorenessMax >= 7 ? '酸痛 ' + sorenessMax + '/10' : '') +
        (sleepBad ? (sorenessMax !== null && sorenessMax >= 7 ? '、' : '') + '睡眠 ' + log.sleep.hours + 'h' : ''),
      suggestion: '改为技术课或恢复课，把速度课挪到恢复之后'
    };
    add('plan-conflict', 'red', '明日计划与恢复状态冲突',
      '计划是「' + conflict.planTypeLabel + '」，但当前 ' + conflict.reason + '。建议：' + conflict.suggestion + '。',
      ['rec-soreness', 'rec-sleep']);
  }

  if (sorenessMax !== null && sorenessMax <= 3 && !sleepBad) {
    recovery.level = 'ok';
    recovery.text = '酸痛 ' + sorenessMax + '/10、睡眠 ' + (log.sleep.hours || '?') + 'h，恢复到可上强度的状态。';
  } else if (sorenessMax !== null) {
    recovery.level = sorenessMax >= 7 ? 'red' : 'amber';
    recovery.text = '酸痛 ' + sorenessMax + '/10' + (sleepBad ? '、睡眠不足' : '') + '，建议控制强度。';
  }

  // ---------- 5. 训练负荷 ----------
  var sRPE = null;
  if (log.training.durationMin && log.training.rpe) {
    sRPE = Math.round(log.training.durationMin * log.training.rpe);
  }

  // ---------- 6. 评分 ----------
  var score = 0;
  // 水合 25
  if (hydration.pct === null) score += 12;
  else if (hydration.pct <= 1) score += 25;
  else if (hydration.pct <= 2) score += 18;
  else if (hydration.pct <= 3) score += 10;
  else score += 3;
  // 蛋白 25
  if (bw && protein.level === 'unknown') score += 12;
  else if (protein.level === 'ok') score += 25;
  else if (protein.level === 'amber') score += 16;
  else if (protein.level === 'red') score += 5;
  // 能量 20
  if (!energy.dataOk) score += 10;
  else if (energy.level === 'ok') score += 20;
  else if (energy.level === 'amber') score += 13;
  else score += 6;
  // 恢复 20
  if (sorenessMax === null && log.sleep.hours === null) score += 10;
  else {
    var recScore = 20;
    if (sorenessMax !== null && sorenessMax >= 7) recScore -= 9;
    else if (sorenessMax !== null && sorenessMax >= 5) recScore -= 4;
    if (sleepBad) recScore -= 8;
    if (log.sleep.hours === null) recScore -= 4;
    score += Math.max(2, recScore);
  }
  // 记录完整 10
  if (totals.count >= 3) score += 10;
  else if (totals.count === 2) score += 7;
  else if (totals.count === 1) score += 2;
  score = clamp(Math.round(score), 0, 100);

  var level = score >= 85 ? '优' : score >= 70 ? '良' : score >= 55 ? '需调整' : '红灯';
  var levelTone = score >= 85 ? 'ok' : score >= 70 ? 'ok' : score >= 55 ? 'amber' : 'red';

  // 注意：red 的权重是 0，不能用 || 兜底（0 是 falsy，会被当成未知级别）
  const LEVEL_W = { red: 0, amber: 1, info: 2 };
  alerts.sort(function (a, b) {
    var wa = LEVEL_W[a.level] === undefined ? 3 : LEVEL_W[a.level];
    var wb = LEVEL_W[b.level] === undefined ? 3 : LEVEL_W[b.level];
    return wa - wb;
  });

  // ---------- 7. 知识库提示（未触发告警的相关条目） ----------
  var tips = [];
  function pushTip(id) {
    var it = KB_MAP[id];
    if (it && tips.length < 3 && !tips.some(function (t) { return t.id === id; })) {
      tips.push({ id: it.id, title: it.title, body: it.body, source: it.source, cat: it.cat });
    }
  }
  var sess = log.training.sessionType;
  if (sess === 'sparring') pushTip('carb-recovery');
  if (phase === 'cut') { pushTip('pro-total'); pushTip('wc-refeed'); }
  if (phase === 'maintain') { pushTip('carb-training'); }
  if (log.goal.weighInDate) pushTip('wc-phases');
  if (totals.count && totals.structured < totals.count) pushTip('basic-photo');
  if (log.training.durationMin && !log.training.rpe) pushTip('rec-load');
  if (log.sleep.hours === null) pushTip('rec-sleep');
  if (protein.level === 'ok' && energy.dataOk) pushTip('carb-timing');

  var headline = '';
  var reds = alerts.filter(function (a) { return a.level === 'red'; });
  if (reds.length) headline = reds[0].title;
  else if (alerts.length) headline = alerts[0].title;
  else headline = '今天各项正常，按计划吃练。';

  return {
    version: 2,
    date: log.date,
    score: score,
    level: level,
    levelTone: levelTone,
    headline: headline,
    bw: bw,
    phase: phase,
    weights: log.weights,
    hydration: hydration,
    protein: protein,
    energy: energy,
    totals: totals,
    rate: rate,
    recovery: recovery,
    sRPE: sRPE,
    planConflict: conflict,
    alerts: alerts,
    tips: tips,
    // 给教练端的一句话摘要
    coachSummary: buildCoachSummary(log, { score: score, level: level, hydration: hydration, protein: protein, energy: energy, rate: rate, recovery: recovery, sRPE: sRPE, totals: totals })
  };
}

function buildCoachSummary(log, f) {
  var parts = [];
  if (f.score !== undefined) parts.push('评分 ' + f.score + '(' + f.level + ')');
  if (log.weights && log.weights.morning && log.weights.morning.kg) parts.push('晨重 ' + log.weights.morning.kg + 'kg');
  if (f.hydration && f.hydration.pct !== null) parts.push('脱水 ' + f.hydration.pct + '%');
  if (f.protein && f.protein.actualG !== undefined) parts.push('蛋白 ' + f.protein.actualG + 'g');
  if (f.totals && f.totals.kcal) parts.push('摄入 ' + f.totals.kcal + 'kcal');
  if (f.recovery && f.recovery.sorenessMax !== null) parts.push('酸痛 ' + f.recovery.sorenessMax);
  if (f.sRPE) parts.push('sRPE ' + f.sRPE);
  return parts.join(' · ');
}

module.exports = {
  evaluate: evaluate,
  normalizeLog: normalizeLog,
  weeklyRate: weeklyRate,
  estimateTdee: estimateTdee,
  KB: KB,
  KB_MAP: KB_MAP,
  SESSION_LABEL: SESSION_LABEL,
  PLAN_LABEL: PLAN_LABEL
};
