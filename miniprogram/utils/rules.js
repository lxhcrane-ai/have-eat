// 运动营养规则引擎：纯 JS，无 wx.* 依赖，可在小程序与 Node（云函数/测试）中同一份运行。
// 设计原则：
//   1) 只输出能被规则登记表（data/ruleRegistry.js）解释的结论，每条告警带 ruleId + 来源锚点。
//   2) 阶段是一等公民：PHASE_PROFILES 决定哪些规则生效、哪些被抑制、字段必填、评分权重。
//   3) 抑制不等于删除：被抑制的规则记进 result.suppressed，教练端能看到"本阶段没看什么、为什么"。

const KB = require('../data/knowledge.js');
const REG = require('../data/ruleRegistry.js');

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

// 字段中文名：给"还差什么没填"的提示用
const FIELD_LABELS = {
  weights_morning: '晨重（空腹）',
  weights_pre: '训练前体重',
  weights_post: '训练后体重',
  sleep_hours: '睡眠时长',
  sleep_quality: '睡眠质量',
  resting_hr: '晨脉',
  urine_color: '晨尿颜色',
  water_ml: '饮水总量',
  hydration_plan: '补液/控水计划与实际量',
  training_type: '训练类型',
  training_rpe: '训练 RPE',
  soreness: '分部位酸痛',
  meals: '三餐结构化记录',
  next_plan: '明日训练计划',
  gi_symptoms: '胃肠症状',
  supplement: '补剂执行',
  post_weighin_fluid: '称重后补液量',
  post_weighin_carb: '称重后碳水',
  post_weighin_subjective: '主观恢复感'
};

// ---------------------------------------------------------------------------
// 阶段配置：阶段决定规则集、字段、评分权重、主告警
// ---------------------------------------------------------------------------
const PHASE_PROFILES = {
  maintain: {
    id: 'maintain',
    label: '维持期',
    short: '维持',
    window: '非赛季 / 一般准备期',
    goal: '体重稳定在参赛级别附近，正常吃练，不主动制造缺口',
    activeRuleIds: ['HYD-01', 'HYD-02', 'HYD-03', 'PRO-01', 'PRO-02', 'ENE-01', 'PHASE-02', 'SLE-01', 'REC-02', 'REC-03', 'LOG-01'],
    suppressedRuleIds: ['HYD-04', 'HYD-05', 'PHASE-01', 'REC-01', 'REC-04', 'GI-01', 'SUP-01'],
    fieldSchema: {
      required: ['weights_morning', 'sleep_hours', 'meals'],
      critical: ['meals'],
      optional: ['weights_pre', 'weights_post', 'water_ml', 'urine_color', 'resting_hr', 'training_type', 'training_rpe', 'soreness', 'next_plan', 'sleep_quality'],
      hidden: ['hydration_plan', 'gi_symptoms', 'supplement', 'post_weighin_fluid', 'post_weighin_carb', 'post_weighin_subjective']
    },
    metricWeights: { hydration: 20, protein: 25, energy: 20, recovery: 25, logging: 10 },
    primaryAlertTypes: ['SLE-01', 'REC-02', 'REC-03', 'PRO-01', 'ENE-01'],
    notes: '维持期不追减重速率，也不看称重后恢复。日记能填就行，重点是睡眠与蛋白。'
  },
  cut: {
    id: 'cut',
    label: '减脂期',
    short: '减脂',
    window: '赛前 8–12 周',
    goal: '每周降 0.5–1% 体重，蛋白上调保肌，缺口 300–600 kcal',
    activeRuleIds: ['HYD-01', 'HYD-02', 'HYD-03', 'PRO-01', 'PRO-02', 'ENE-01', 'PHASE-01', 'SLE-01', 'REC-02', 'REC-03', 'SUP-01', 'LOG-01'],
    suppressedRuleIds: ['HYD-04', 'HYD-05', 'REC-01', 'REC-04', 'GI-01', 'PHASE-02'],
    fieldSchema: {
      required: ['weights_morning', 'meals', 'soreness', 'resting_hr', 'urine_color'],
      critical: ['meals'],
      optional: ['weights_pre', 'weights_post', 'water_ml', 'sleep_hours', 'sleep_quality', 'training_type', 'training_rpe', 'next_plan', 'supplement'],
      hidden: ['hydration_plan', 'gi_symptoms', 'post_weighin_fluid', 'post_weighin_carb', 'post_weighin_subjective']
    },
    metricWeights: { hydration: 25, protein: 25, energy: 20, recovery: 20, logging: 10 },
    primaryAlertTypes: ['PRO-01', 'ENE-01', 'PHASE-01', 'REC-02', 'SLE-01'],
    notes: '项目最常用的阶段。水合按训练前后体重差判，蛋白与减重速率是主告警。'
  },
  peak: {
    id: 'peak',
    label: '微调期',
    short: '微调',
    window: '赛前 1–2 周',
    goal: '只动水、钠、纤维与胃肠内容物；不再动热量缺口',
    activeRuleIds: ['HYD-03', 'HYD-05', 'PRO-01', 'SLE-01', 'REC-02', 'REC-03', 'GI-01', 'SUP-01', 'LOG-01'],
    suppressedRuleIds: ['HYD-01', 'HYD-02', 'ENE-01', 'PHASE-01', 'PHASE-02', 'PRO-02', 'REC-01', 'REC-04'],
    fieldSchema: {
      required: ['weights_morning', 'hydration_plan', 'gi_symptoms', 'supplement', 'sleep_hours'],
      critical: ['hydration_plan', 'gi_symptoms'],
      optional: ['weights_pre', 'weights_post', 'water_ml', 'urine_color', 'resting_hr', 'training_type', 'training_rpe', 'soreness', 'next_plan', 'sleep_quality'],
      hidden: ['post_weighin_fluid', 'post_weighin_carb', 'post_weighin_subjective']
    },
    metricWeights: { hydration: 30, protein: 20, energy: 0, recovery: 35, logging: 15 },
    primaryAlertTypes: ['HYD-05', 'GI-01', 'SLE-01', 'REC-02'],
    notes: '关键差别：脱水百分比在本阶段被抑制（水盐操作必然异常），水合改看计划执行率；能量规则关闭。'
  },
  recover: {
    id: 'recover',
    label: '恢复期',
    short: '恢复',
    window: '称重后 12–24h',
    goal: '补液补糖，把体重与状态拉回比赛水平',
    activeRuleIds: ['HYD-04', 'PRO-01', 'REC-01', 'REC-04', 'GI-01', 'SLE-01', 'LOG-01'],
    suppressedRuleIds: ['HYD-01', 'HYD-02', 'HYD-03', 'HYD-05', 'ENE-01', 'PHASE-01', 'PHASE-02', 'PRO-02', 'REC-02', 'REC-03', 'SUP-01'],
    fieldSchema: {
      required: ['weights_morning', 'post_weighin_fluid', 'post_weighin_carb', 'post_weighin_subjective'],
      critical: ['post_weighin_fluid'],
      optional: ['water_ml', 'sleep_hours', 'sleep_quality', 'gi_symptoms', 'soreness', 'training_type', 'meals', 'resting_hr'],
      hidden: ['weights_pre', 'weights_post', 'hydration_plan', 'next_plan', 'supplement', 'urine_color']
    },
    metricWeights: { hydration: 35, protein: 15, energy: 0, recovery: 35, logging: 15 },
    primaryAlertTypes: ['HYD-04', 'REC-01', 'REC-04', 'GI-01'],
    notes: '恢复期不看训练脱水（已经不打训练课了），也不看晨脉（称重后心率偏高是生理性的）。REC-02 保留：恢复期仍要判断能不能上强度课。'
  }
};

// 旧数据里写的是 weighin，统一映射到 peak；保留别名避免历史记录失效
const PHASE_ALIAS = { weighin: 'peak', micro: 'peak', recovery: 'recover', bulk: 'maintain' };
const PHASE_ORDER = ['maintain', 'cut', 'peak', 'recover'];

function resolvePhase(phase) {
  var p = String(phase || '').trim();
  if (PHASE_ALIAS[p]) return PHASE_ALIAS[p];
  return PHASE_PROFILES[p] ? p : 'maintain';
}

function getPhaseProfile(phase) {
  return PHASE_PROFILES[resolvePhase(phase)];
}

function phaseLabel(phase) { return getPhaseProfile(phase).label; }

// 阶段字段：返回必填/选填/隐藏 + 中文名，前端据此收缩或展开表单
function fieldsFor(phase) {
  var prof = getPhaseProfile(phase);
  var fs = prof.fieldSchema;
  function pack(k) { return { key: k, label: FIELD_LABELS[k] || k }; }
  return {
    phase: prof.id,
    required: fs.required.map(pack),
    optional: fs.optional.map(pack),
    hidden: fs.hidden.map(pack),
    critical: (fs.critical || []).map(pack)
  };
}

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
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
  var hp = raw.hydrationPlan || {};
  var gi = raw.giSymptoms || {};
  var sp = raw.supplementPlan || {};
  var pw = raw.postWeighIn || {};
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
    // 微调期专用：计划补液量 vs 实际执行量（ml）
    hydrationPlan: {
      planMl: num(hp.planMl),
      actualMl: num(hp.actualMl !== undefined ? hp.actualMl : (raw.hydration && raw.hydration.waterMl)) ,
      sodiumOk: hp.sodiumOk === true || hp.sodiumOk === 'true' ? true : (hp.sodiumOk === false ? false : null)
    },
    // 微调/恢复期专用：0–4 主观量表
    giSymptoms: {
      nausea: num(gi.nausea),
      bloating: num(gi.bloating),
      cramp: num(gi.cramp),
      appetite: num(gi.appetite),
      vomiting: gi.vomiting === true
    },
    supplementPlan: {
      planned: sp.planned || [],
      taken: sp.taken || [],
      caffeineMg: num(sp.caffeineMg),
      creatineG: num(sp.creatineG)
    },
    // 恢复期专用
    postWeighIn: {
      fluidMl: num(pw.fluidMl),
      carbG: num(pw.carbG),
      fluidSodium: pw.fluidSodium === true,
      subjective: num(pw.subjective),
      weighInKg: num(pw.weighInKg),
      glycogenDepleted: pw.glycogenDepleted !== false
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
        slot: m.slot || '',
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

// 阶段化的蛋白区间（g/kg 体重）
function proteinBand(phase) {
  if (phase === 'cut') return { min: 2.0, max: 2.4 };
  if (phase === 'recover') return { min: 1.6, max: 2.0 };
  return { min: 1.6, max: 2.2 };
}

// 日期差（a → b，天数；b 在后为正）
function daysBetween(a, b) {
  if (!a || !b) return null;
  var t1 = new Date(a + 'T00:00:00').getTime();
  var t2 = new Date(b + 'T00:00:00').getTime();
  if (!isFinite(t1) || !isFinite(t2)) return null;
  return Math.round((t2 - t1) / 86400000);
}

// ---------------------------------------------------------------------------
// 阶段建议：只建议，不自动改。真正切换仍由营养师在后台点（setAthletePhase）。
//   - 距称重 ≤14 天 → peak
//   - 15–84 天且体重未接近目标 → cut
//   - 称重已过 0–2 天 → recover
//   - 其余 → maintain
// ---------------------------------------------------------------------------
function suggestPhase(profile, ctx) {
  ctx = ctx || {};
  var p = profile || {};
  var current = resolvePhase(p.phase);
  var today = ctx.today || '';
  var out = {
    current: current,
    currentLabel: phaseLabel(current),
    phase: current,
    phaseLabel: phaseLabel(current),
    reason: '',
    daysToWeigh: null,
    gapPct: null,
    changed: false,
    urgency: 'ok'
  };
  var weighIn = p.weighInDate || '';
  if (!weighIn || !today) {
    out.reason = '未设称重日（或缺当天日期），按维持期算';
    out.phase = 'maintain';
    out.phaseLabel = '维持期';
    out.changed = out.phase !== current;
    out.urgency = out.changed ? 'info' : 'ok';
    return out;
  }

  var days = daysBetween(today, weighIn);
  out.daysToWeigh = days;
  var bw = num(p.weightKg);
  var tgt = num(p.targetWeightKg);
  if (bw && tgt) out.gapPct = round1(((bw - tgt) / tgt) * 100);

  if (days < 0) {
    if (days >= -2) {
      out.phase = 'recover';
      out.reason = '称重已过 ' + Math.abs(days) + ' 天，处于 12–24h 恢复窗口：补液补糖，把体重拉回';
    } else {
      out.phase = 'maintain';
      out.reason = '称重已过 ' + Math.abs(days) + ' 天，比赛结束回到维持期';
    }
  } else if (days <= 14) {
    out.phase = 'peak';
    out.reason = '距称重 ' + days + ' 天（≤2 周）：只动水、钠、纤维与胃肠内容物，不再动热量缺口';
  } else if (days <= 84) {
    if (out.gapPct !== null && out.gapPct <= 1.5) {
      out.phase = 'maintain';
      out.reason = '距称重 ' + days + ' 天，但体重只差 ' + out.gapPct + '%（已接近目标），不需要主动减脂';
    } else {
      out.phase = 'cut';
      out.reason = '距称重 ' + days + ' 天（约 ' + Math.round(days / 7) + ' 周）：进入减脂期，周降 0.5–1%';
    }
  } else {
    out.phase = 'maintain';
    out.reason = '距称重 ' + days + ' 天（>12 周）：还没到减脂窗口，先维持';
  }

  out.phaseLabel = phaseLabel(out.phase);
  out.changed = out.phase !== current;
  out.urgency = out.changed ? (days <= 21 ? 'amber' : 'info') : 'ok';
  return out;
}

// ---------- 规则登记表桥接 ----------
function ruleSources(ruleId) {
  var r = REG.getRule(ruleId);
  return r ? r.sources.map(function (s) {
    return {
      citation: s.citation,
      sourceType: s.sourceType,
      sourceTypeName: REG.sourceTypeName(s.sourceType),
      year: s.year,
      anchor: s.anchor,
      doi: s.doi || '',
      url: s.url || (s.doi ? 'https://doi.org/' + s.doi : '')
    };
  }) : [];
}

function reviewStateOf(ruleId, overrides) {
  var r = REG.getRule(ruleId);
  var base = (r && r.reviewStatus) || 'active';
  if (overrides && overrides[ruleId]) base = overrides[ruleId];
  var meta = REG.reviewStatusMeta(base);
  return { status: base, name: meta.name, tone: meta.tone };
}

// ---------------------------------------------------------------------------
// 入口：evaluate(rawLog, ctx)
//   ctx.phase           覆盖阶段（营养师预览 / 历史回放用），优先于 log.goal.phase / profile.phase
//   ctx.profile         档案
//   ctx.recentMorningWeights  [{date,kg}]
//   ctx.ruleReviews     { 'HYD-01': 'needs_review' } 复核状态覆盖（来自 rule_reviews 集合）
// ---------------------------------------------------------------------------
function evaluate(rawLog, ctx) {
  ctx = ctx || {};
  var log = normalizeLog(rawLog);
  var profile = ctx.profile || {};
  var phase = resolvePhase(ctx.phase || log.goal.phase || profile.phase);
  var prof = PHASE_PROFILES[phase];

  var active = {};
  prof.activeRuleIds.forEach(function (id) { active[id] = true; });

  var bw = num(log.weights.morning && log.weights.morning.kg)
    || num(log.weights.pre && log.weights.pre.kg)
    || num(log.weights.post && log.weights.post.kg)
    || num(profile.weightKg) || null;

  var alerts = [];
  var suppressedLog = [];

  // 统一出口：只有该阶段启用的规则才能产生告警；被抑制的规则记录下来供教练端审计
  function emit(ruleId, legacyCode, level, title, text, kbIds, evidence) {
    if (!active[ruleId]) {
      suppressedLog.push({ ruleId: ruleId, legacyCode: legacyCode, title: title, reason: '阶段抑制' });
      return false;
    }
    var rule = REG.getRule(ruleId);
    var review = reviewStateOf(ruleId, ctx.ruleReviews);
    alerts.push({
      code: legacyCode,          // 兼容旧前端与历史数据
      ruleId: ruleId,
      ruleName: rule ? rule.name : ruleId,
      level: level,
      title: title,
      text: text,
      evidence: evidence || '',
      kb: kbIds || [],
      sources: ruleSources(ruleId),
      reviewStatus: review.status,
      reviewStatusName: review.name,
      requiresFollowUp: !!(rule && rule.requiresHumanFollowUp)
    });
    return true;
  }
  function skip(ruleId, reason) {
    if (!active[ruleId]) suppressedLog.push({ ruleId: ruleId, reason: reason });
  }

  // ---------- 1. 水合 ----------
  var pre = num(log.weights.pre && log.weights.pre.kg);
  var post = num(log.weights.post && log.weights.post.kg);
  var hydration = {
    lossKg: null, pct: null, needMl: 0, remainingMl: 0, level: 'unknown', text: '',
    planMl: log.hydrationPlan.planMl, actualMl: log.hydrationPlan.actualMl,
    planRate: null, mode: 'pct', postFluidMl: log.postWeighIn.fluidMl
  };

  if (pre && post && pre > post) {
    var loss = round1(pre - post);
    var pct = round1((loss / pre) * 100);
    hydration.lossKg = loss;
    hydration.pct = pct;
    hydration.needMl = Math.round(loss * 1.25 * 1000);
    hydration.remainingMl = Math.max(0, hydration.needMl - (log.hydration.waterMl || 0));

    if (phase === 'peak') {
      // 微调期不判脱水百分比：赛前水盐操作会让数值必然异常，改看计划执行率
      hydration.mode = 'plan';
      skip('HYD-01', '微调期以补液计划执行率为准，脱水百分比不作为告警依据');
      hydration.text = '微调期不按体重差判水合（掉 ' + loss + 'kg 属于计划内），看补液计划执行率。';
    } else if (phase === 'recover') {
      hydration.mode = 'recover';
      skip('HYD-01', '恢复期不判训练脱水');
      hydration.text = '恢复期看称重后补液量。';
    } else {
      if (pct >= 3) {
        hydration.level = 'red';
        hydration.text = '脱水 ' + pct + '%（' + loss + 'kg），已进入危险区，出拳速度和抗打击都会掉。';
        emit('HYD-01', 'hyd-critical', 'red', '脱水 ' + pct + '%：今天必须优先补液',
          '训练掉了 ' + loss + 'kg，按每 kg 补 1.25–1.5L 计算，需补 ' + hydration.needMl + '–' + Math.round(loss * 1.5 * 1000) +
          'ml 含钠液体，分 3–4 次喝完。已记录饮水 ' + (log.hydration.waterMl || 0) + 'ml，还差 ' + hydration.remainingMl + 'ml。',
          ['hyd-2pct', 'hyd-replace', 'hyd-sodium'],
          '训练前 ' + pre + 'kg → 训练后 ' + post + 'kg，掉 ' + loss + 'kg，脱水 ' + pct + '%；饮水 ' + (log.hydration.waterMl || 0) + 'ml，缺口 ' + hydration.remainingMl + 'ml');
      } else if (pct >= 2) {
        hydration.level = 'amber';
        hydration.text = '脱水 ' + pct + '%（' + loss + 'kg），已到影响表现的阈值。';
        emit('HYD-01', 'hyd-high', 'amber', '脱水 ' + pct + '%：补 ' + hydration.needMl + 'ml',
          '超过 2% 就开始掉表现。建议分次补 ' + hydration.needMl + '–' + Math.round(loss * 1.5 * 1000) + 'ml，含钠效果更好。',
          ['hyd-2pct', 'hyd-replace'],
          '训练前 ' + pre + 'kg → 训练后 ' + post + 'kg，掉 ' + loss + 'kg（' + pct + '%）');
      } else {
        hydration.level = 'ok';
        hydration.text = '脱水 ' + pct + '%，在可接受范围。';
      }
    }
  } else if (pre && post && post >= pre) {
    hydration.level = 'ok';
    hydration.text = '训练前后体重无下降，注意是否补水过量。';
  }

  // HYD-02：补齐液量建议（不单独告警，挂在结果里给文案用）
  if (active['HYD-02'] && hydration.lossKg) {
    hydration.rehydrationAdvice = '按 1.25–1.5L/kg 补 ' + hydration.needMl + '–' + Math.round(hydration.lossKg * 1.5 * 1000) + 'ml 含钠液体';
  } else if (!active['HYD-02']) {
    skip('HYD-02', '本阶段不单独给补液量建议');
  }

  if (log.hydration.urineColor && log.hydration.urineColor >= 5) {
    emit('HYD-03', 'hyd-urine', 'amber', '晨尿偏深（' + log.hydration.urineColor + '/8）',
      '提示夜间轻度脱水，起床后先补 300–500ml 水，再开始训练。单次尿色受饮水时间与维生素影响，按趋势看。',
      ['hyd-urine'],
      '晨尿 ' + log.hydration.urineColor + '/8');
  }

  // HYD-05：微调期补液计划执行率（peak 期的水合主指标）
  if (active['HYD-05']) {
    var planMl = num(log.hydrationPlan.planMl);
    var actualMl = num(log.hydrationPlan.actualMl);
    if (planMl && planMl > 0 && actualMl !== null) {
      var rate = Math.round((actualMl / planMl) * 100);
      hydration.planRate = rate;
      if (rate >= 90) {
        hydration.level = 'ok';
        hydration.text = '补液计划执行 ' + actualMl + '/' + planMl + 'ml（' + rate + '%），达标。';
      } else if (rate >= 80) {
        hydration.level = 'amber';
        hydration.text = '补液计划执行 ' + rate + '%，略低于计划。';
        emit('HYD-05', 'hyd-plan', 'info', '补液计划执行率 ' + rate + '%',
          '计划 ' + planMl + 'ml，实际 ' + actualMl + 'ml。微调期水盐操作按计划执行比"补够"更重要，差 ' + (planMl - actualMl) + 'ml。',
          ['wc-dehydration-risk', 'hyd-replace'],
          '计划 ' + planMl + 'ml / 实际 ' + actualMl + 'ml = ' + rate + '%');
      } else {
        hydration.level = 'red';
        hydration.text = '补液计划执行 ' + rate + '%，明显偏离计划。';
        emit('HYD-05', 'hyd-plan', 'amber', '补液计划只执行了 ' + rate + '%',
          '计划 ' + planMl + 'ml，实际 ' + actualMl + 'ml，差 ' + (planMl - actualMl) + 'ml。赛前水盐操作偏离计划会直接影响称重与场上状态，今天按剩余时段平摊补回。',
          ['wc-dehydration-risk', 'hyd-replace'],
          '计划 ' + planMl + 'ml / 实际 ' + actualMl + 'ml = ' + rate + '%');
      }
    } else {
      hydration.level = 'unknown';
      hydration.text = '微调期必填：补液计划的计划量与执行量。缺这两项无法判断水合。';
      emit('HYD-05', 'hyd-plan-missing', 'amber', '微调期缺补液计划执行数据',
        '微调期不看脱水百分比，只按计划执行率判断。请在「填写」里填今天的计划补液量与实际完成量。',
        ['basic-logging', 'wc-dehydration-risk'],
        'planMl=' + (planMl === null ? '缺失' : planMl) + '，actualMl=' + (actualMl === null ? '缺失' : actualMl));
    }
  }

  // HYD-04：称重后补液（恢复期）
  if (active['HYD-04']) {
    var pf = num(log.postWeighIn.fluidMl);
    if (pf === null) {
      hydration.level = 'unknown';
      hydration.text = '恢复期必填：称重后补液量（ml）。';
    } else if (pf >= 1000) {
      hydration.level = 'ok';
      hydration.text = '称重后已补 ' + pf + 'ml' + (log.postWeighIn.fluidSodium ? '（含钠）' : '（注意用含钠液体）') + '。';
      if (!log.postWeighIn.fluidSodium) {
        emit('HYD-04', 'hyd-post', 'info', '称重后补液 ' + pf + 'ml，但没有用含钠液体',
          '纯水会稀释血钠。按口服补液盐 1–1.5 L/h、钠 50–90 mmol/L 补，恢复血浆容量更快。',
          ['hyd-sodium', 'wc-weighin-recovery'],
          '补液 ' + pf + 'ml，sodium=false');
      }
    } else if (pf >= 500) {
      hydration.level = 'amber';
      hydration.text = '称重后只补了 ' + pf + 'ml，偏少。';
      emit('HYD-04', 'hyd-post', 'amber', '称重后补液不足（' + pf + 'ml）',
        '目标 1–1.5 L/h 口服补液盐。先补到 1000ml 以上，再按体重回升情况加量。',
        ['wc-weighin-recovery', 'hyd-sodium'],
        '称重后补液 ' + pf + 'ml');
    } else {
      hydration.level = 'red';
      hydration.text = '称重后只补了 ' + pf + 'ml，远低于需要量。';
      emit('HYD-04', 'hyd-post', 'red', '称重后补液严重不足（' + pf + 'ml）',
        '称重后 12–24h 是补液补糖窗口。按 1–1.5 L/h 口服补液盐分次补，同时开始快碳。',
        ['wc-weighin-recovery', 'hyd-sodium'],
        '称重后补液 ' + pf + 'ml');
    }
  }

  // ---------- 2. 蛋白与能量 ----------
  var totals = sumMeals(log);
  var protein = { targetG: 0, minG: 0, maxG: 0, actualG: totals.protein, pct: 0, level: 'unknown', text: '', gPerKg: 0 };
  var energy = { tdee: 0, intake: totals.kcal, balance: 0, level: 'unknown', text: '', dataOk: false };

  if (bw) {
    var band = proteinBand(phase);
    var gMin = band.min, gMax = band.max;
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
      emit('LOG-01', 'log-insufficient', 'amber', '记录不足：只有 ' + totals.count + ' 餐',
        '少于 2 餐的结构化记录无法评估能量和蛋白。补记剩余餐次，或明天开始每餐拍照+选食物。',
        ['basic-logging'],
        '结构化餐食 ' + totals.structured + ' 餐 / 共 ' + totals.count + ' 餐');
    } else {
      // 判定基准用区间下限：落在区间内即达标，低于下限 20% 以上才红灯
      var pctOfMin = protein.minG ? totals.protein / protein.minG : 0;
      if (pctOfMin >= 1) {
        protein.level = 'ok';
        protein.text = '蛋白 ' + totals.protein + 'g（' + protein.gPerKg + ' g/kg），在 ' + protein.minG + '–' + protein.maxG + 'g 区间内。';
      } else if (pctOfMin >= 0.8) {
        protein.level = 'amber';
        protein.text = '蛋白 ' + totals.protein + 'g，离下限 ' + protein.minG + 'g 还差 ' + (protein.minG - totals.protein) + 'g。';
        emit('PRO-01', 'protein-short', 'amber', '蛋白差 ' + (protein.minG - totals.protein) + 'g 到下限',
          '目标区间 ' + protein.minG + '–' + protein.maxG + 'g（' + gMin + '–' + gMax + ' g/kg）。差的一口用 200ml 牛奶 + 1 个鸡蛋补上。',
          ['pro-total', 'pro-spread'],
          '摄入 ' + totals.protein + 'g / 区间 ' + protein.minG + '–' + protein.maxG + 'g，' + protein.gPerKg + ' g/kg');
      } else {
        protein.level = 'red';
        protein.text = '蛋白 ' + totals.protein + 'g，只有下限的 ' + Math.round(pctOfMin * 100) + '%。';
        emit('PRO-01', 'protein-low', 'red', '蛋白严重不足：' + totals.protein + '/' + protein.minG + 'g（下限）',
          phase === 'cut'
            ? '减重期蛋白不足会优先掉肌肉，出拳力量跟着掉。今天再加一份 150g 鸡胸或 30g 乳清（约 30g 蛋白）。'
            : '今天再加一份 150g 鸡胸或 30g 乳清（约 30g 蛋白），优先补够总量。',
          ['pro-total', 'pro-quality', 'pro-timing'],
          '摄入 ' + totals.protein + 'g / 下限 ' + protein.minG + 'g（' + Math.round(pctOfMin * 100) + '%）');
      }

      // 能量：按阶段判断（peak/recover 权重为 0，规则不在激活集里，不产生告警）
      var bal = energy.balance;
      if (active['ENE-01']) {
        if (phase === 'cut') {
          if (bal > 200) {
            energy.level = 'amber';
            energy.text = '摄入比消耗高 ' + bal + ' kcal，减重期这会拖慢进度。';
            emit('ENE-01', 'energy-over', 'amber', '热量盈余 ' + bal + ' kcal（减重期）',
              '按粗估消耗 ' + energy.tdee + ' kcal，今天吃超了。减重期建议 -300~-600 kcal/天。',
              ['carb-training', 'basic-plate'],
              '摄入 ' + totals.kcal + ' kcal，粗估消耗 ' + energy.tdee + ' kcal，盈余 ' + bal + ' kcal');
          } else if (bal < -900) {
            energy.level = 'red';
            energy.text = '缺口 ' + Math.abs(bal) + ' kcal，过深，容易掉肌肉和状态。';
            emit('ENE-01', 'energy-under', 'red', '缺口过深 ' + Math.abs(bal) + ' kcal',
              '单日缺口控制在 300–600 kcal。长期低于 30 kcal/kg 去脂体重/天会进入低能量可用性，激素、睡眠、免疫一起出问题。',
              ['carb-energy-availability', 'wc-rate'],
              '摄入 ' + totals.kcal + ' kcal，粗估消耗 ' + energy.tdee + ' kcal，缺口 ' + Math.abs(bal) + ' kcal');
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
            emit('ENE-01', 'energy-low', 'amber', '维持期出现 ' + Math.abs(bal) + ' kcal 缺口',
              '维持期目标是体重稳定。如果是训练加量导致的，把碳水补回来；如果想减重，请在后台把阶段切到减脂期。',
              ['carb-training', 'carb-energy-availability'],
              '摄入 ' + totals.kcal + ' kcal，粗估消耗 ' + energy.tdee + ' kcal');
          }
        }
      } else {
        energy.level = 'ok';
        energy.text = '本阶段不判能量盈亏（' + prof.label + '不动热量缺口）。';
        skip('ENE-01', prof.label + '不判能量盈亏');
      }

      // 蛋白分配（PRO-02 只在 maintain/cut 激活）
      if (active['PRO-02'] && totals.count && totals.protein / totals.count < 20) {
        emit('PRO-02', 'protein-spread', 'info', '单餐蛋白偏少（平均 ' + Math.round(totals.protein / totals.count) + 'g）',
          '每餐 25–35g 蛋白对合成更有效。把蛋白分散到 3–5 餐，而不是集中在一餐。',
          ['pro-spread'],
          '共 ' + totals.count + ' 餐，蛋白 ' + totals.protein + 'g，平均 ' + Math.round(totals.protein / totals.count) + 'g/餐');
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
    if (active['PHASE-01']) {
      if (r < 0 && rate.pctPerWeek > 1) {
        rate.level = 'red';
        rate.text = '每周掉 ' + Math.abs(r) + 'kg（' + rate.pctPerWeek + '%），减太快。';
        emit('PHASE-01', 'rate-fast', 'red', '减重过快：' + Math.abs(r) + 'kg/周',
          '安全上限是每周 0.5–1% 体重（你约 ' + Math.round(bw * 0.005 * 100) / 100 + '–' + Math.round(bw * 0.01 * 100) / 100 + 'kg）。再快会掉肌肉和力量。',
          ['wc-rate', 'pro-total'],
          '7 日斜率 ' + r + 'kg/周（' + rate.pctPerWeek + '% 体重/周，体重 ' + bw + 'kg）');
      } else if (r < 0 && rate.pctPerWeek < 0.3) {
        rate.level = 'amber';
        rate.text = '每周只掉 ' + Math.abs(r) + 'kg，减重进度偏慢。';
        emit('PHASE-01', 'rate-slow', 'info', '减重偏慢：' + Math.abs(r) + 'kg/周',
          '确认记录是否漏了餐。若确实吃这么多，把每日缺口再加深 100–200 kcal，别靠加练。',
          ['wc-rate', 'basic-logging'],
          '7 日斜率 ' + r + 'kg/周（' + rate.pctPerWeek + '% 体重/周）');
      } else if (r > 0.5) {
        rate.level = 'amber';
        rate.text = '体重在涨（+' + r + 'kg/周），与减重目标相反。';
        emit('PHASE-01', 'rate-up', 'amber', '减重期体重上升',
          '先看 7 日移动平均，单点波动不算。若持续上升，检查是否漏记高热量食物（饮料、坚果、油）。',
          ['basic-logging', 'wc-refeed'],
          '7 日斜率 +' + r + 'kg/周');
      } else {
        rate.level = 'ok';
        rate.text = '周变化 ' + r + 'kg，节奏正常。';
      }
    } else {
      skip('PHASE-01', prof.label + '不判减重速率');
      rate.level = 'ok';
      rate.text = '本阶段不看减重速率（周变化 ' + r + 'kg）。';
    }
  } else {
    rate.text = '至少 4 天晨重才能算趋势（现有 ' + pts.length + ' 天）。';
  }

  // PHASE-02：维持期体重偏离
  if (active['PHASE-02'] && bw && num(profile.targetWeightKg)) {
    var tgt = num(profile.targetWeightKg);
    var driftPct = round1(((bw - tgt) / tgt) * 100);
    var bandMax = num(profile.maintainBandPct) || 5;
    if (driftPct > bandMax) {
      emit('PHASE-02', 'maintain-drift', 'info', '维持期体重比参赛级别高 ' + driftPct + '%',
        '项目设定带宽是 +' + bandMax + '%（ISSN 2025 对 MMA 类项目给的是非赛季 +12–15%）。超出带宽先确认是肌肉增长还是脂肪，再决定是否提前进入减脂期。',
        ['wc-phases'],
        '晨重 ' + bw + 'kg，目标 ' + tgt + 'kg，偏离 +' + driftPct + '%');
    }
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

  var recovery = { sorenessMax: sorenessMax, sleepHours: log.sleep.hours, giMax: null, level: 'unknown', text: '' };
  var sleepThreshold = phase === 'peak' ? 7 : 6.5;
  var sleepBad = log.sleep.hours !== null && log.sleep.hours < sleepThreshold;

  if (active['SLE-01'] && log.sleep.hours !== null) {
    if (log.sleep.hours < 6) {
      emit('SLE-01', 'sleep-short', 'red', '睡眠 ' + log.sleep.hours + ' 小时，不足',
        '低于 6 小时会同时压低力量、反应和自控力。今晚优先补到 7–9 小时，明天强度课考虑减量 20%。',
        ['rec-sleep', 'rec-sleep-hygiene'],
        '睡眠 ' + log.sleep.hours + 'h（目标 7–9h）');
    } else if (sleepBad) {
      emit('SLE-01', 'sleep-low', 'amber', '睡眠 ' + log.sleep.hours + ' 小时，偏少',
        phase === 'peak' ? '微调期目标 7–9 小时，睡眠不足会放大水盐操作的心血管压力。'
          : '目标 7–9 小时。连续 3 天不足会累积成恢复赤字。',
        ['rec-sleep'],
        '睡眠 ' + log.sleep.hours + 'h，低于本阶段阈值 ' + sleepThreshold + 'h');
    }
  }

  if (active['REC-02'] && sorenessMax !== null) {
    if (sorenessMax >= 8) {
      emit('REC-02', 'sore-red', 'red', areaText(sorenessTop) + (sorenessTop === 'overall' ? '' : '部') + '酸痛 ' + sorenessMax + '/10',
        '这个程度做速度/爆发课收益极低、受伤风险高。今天改成技术、战术或低强度有氧，速度课往后挪。',
        ['rec-soreness'],
        '酸痛峰值 ' + sorenessMax + '/10（' + areaText(sorenessTop) + '）');
    } else if (sorenessMax >= 7) {
      emit('REC-02', 'sore-high', 'amber', areaText(sorenessTop) + (sorenessTop === 'overall' ? '' : '部') + '酸痛 ' + sorenessMax + '/10',
        '接近红线。力量课可以保留但降组数，速度课建议顺延。',
        ['rec-soreness'],
        '酸痛峰值 ' + sorenessMax + '/10（' + areaText(sorenessTop) + '）');
    }
  }

  var hrDelta = null;
  if (num(log.restingHr) && num(profile.restingHrBaseline) && active['REC-03']) {
    hrDelta = num(log.restingHr) - num(profile.restingHrBaseline);
    if (hrDelta >= 5) {
      emit('REC-03', 'hr-up', hrDelta >= 8 ? 'red' : 'amber', '晨脉高于基线 ' + hrDelta + ' 次/分',
        '连续两天偏高通常意味着恢复不足、脱水或感染前兆。今天减量 10–20%。',
        ['rec-hrv', 'rec-soreness'],
        '晨脉 ' + log.restingHr + '，基线 ' + profile.restingHrBaseline + '，+ ' + hrDelta + ' 次/分');
    }
  } else if (!active['REC-03']) {
    skip('REC-03', prof.label + '不看晨脉（称重后心率偏高属生理性）');
  }

  // 计划冲突：酸痛/睡眠 vs 次日计划类型
  var plan = log.nextPlan || {};
  var planType = plan.type || '';
  var FAST_TYPES = ['speed', 'power', 'max_strength'];
  var conflict = null;
  if (FAST_TYPES.indexOf(planType) >= 0 && ((sorenessMax !== null && sorenessMax >= 7) || sleepBad)) {
    conflict = {
      planType: planType,
      planTypeLabel: PLAN_LABEL[planType] || planType,
      reason: (sorenessMax !== null && sorenessMax >= 7 ? '酸痛 ' + sorenessMax + '/10' : '') +
        (sleepBad ? (sorenessMax !== null && sorenessMax >= 7 ? '、' : '') + '睡眠 ' + log.sleep.hours + 'h' : ''),
      suggestion: '改为技术课或恢复课，把速度课挪到恢复之后'
    };
    emit('REC-02', 'plan-conflict', 'red', '明日计划与恢复状态冲突',
      '计划是「' + conflict.planTypeLabel + '」，但当前 ' + conflict.reason + '。建议：' + conflict.suggestion + '。',
      ['rec-soreness', 'rec-sleep'],
      '次日计划 ' + conflict.planTypeLabel + '，' + conflict.reason);
  }

  // GI-01：胃肠症状
  var giMax = null;
  ['nausea', 'bloating', 'cramp', 'appetite'].forEach(function (k) {
    var v = num(log.giSymptoms[k]);
    if (v !== null) giMax = giMax === null ? v : Math.max(giMax, v);
  });
  recovery.giMax = giMax;
  if (active['GI-01'] && giMax !== null && giMax >= 2) {
    var giLevel = (giMax >= 3 || log.giSymptoms.vomiting) ? 'red' : 'amber';
    emit('GI-01', 'gi-symptom', giLevel, '胃肠症状 ' + giMax + '/4',
      '微调/恢复期优先保证耐受：降低纤维与脂肪、减少单次进食体积、快碳按 ≤60 g/h 递增。持续呕吐或腹泻要就医。',
      ['basic-fiber', 'carb-recovery'],
      '恶心 ' + (log.giSymptoms.nausea === null ? '-' : log.giSymptoms.nausea) + '，腹胀 ' + (log.giSymptoms.bloating === null ? '-' : log.giSymptoms.bloating) + '，痉挛 ' + (log.giSymptoms.cramp === null ? '-' : log.giSymptoms.cramp) + '，食欲 ' + (log.giSymptoms.appetite === null ? '-' : log.giSymptoms.appetite));
  }

  // 恢复期主观恢复感（并入 REC-01 的判断输入，单独出提示）
  if (phase === 'recover' && log.postWeighIn.subjective !== null && log.postWeighIn.subjective <= 2 && active['REC-01']) {
    emit('REC-01', 'rec-subjective', 'amber', '主观恢复感低（' + log.postWeighIn.subjective + '/5）',
      '补液补糖之外，先确认睡眠与胃肠耐受。恢复感低时不要安排额外训练。',
      ['wc-weighin-recovery'],
      '主观恢复感 ' + log.postWeighIn.subjective + '/5');
  }

  // REC-01：称重后碳水
  if (active['REC-01'] && log.postWeighIn.carbG !== null && bw) {
    var carbBand = log.postWeighIn.glycogenDepleted ? { min: 8, max: 12 } : { min: 4, max: 7 };
    var carbTargetG = Math.round(bw * carbBand.min);
    if (log.postWeighIn.carbG < carbTargetG * 0.5) {
      emit('REC-01', 'rec-carb', 'amber', '称重后碳水偏少（' + log.postWeighIn.carbG + 'g）',
        '糖原' + (log.postWeighIn.glycogenDepleted ? '明显耗尽' : '轻度限制') + '时目标 ' + carbBand.min + '–' + carbBand.max +
        ' g/kg（约 ' + Math.round(bw * carbBand.min) + '–' + Math.round(bw * carbBand.max) + 'g），快碳按 ≤60 g/h、先补液再补糖。',
        ['wc-weighin-recovery', 'carb-recovery'],
        '称重后碳水 ' + log.postWeighIn.carbG + 'g，目标 ≥' + carbTargetG + 'g');
    }
  }

  // REC-04：体重回升不足
  if (active['REC-04'] && bw) {
    var weighInKg = num(log.postWeighIn.weighInKg) || num(log.weights.official && log.weights.official.kg);
    var normalKg = num(profile.weightKg);
    if (weighInKg && normalKg && normalKg > weighInKg) {
      var lostKg = normalKg - weighInKg;
      var regainPct = Math.round(((bw - weighInKg) / lostKg) * 100);
      if (regainPct < 30) {
        emit('REC-04', 'rec-fluid', 'red', '体重只回升了 ' + regainPct + '%',
          '称重 ' + weighInKg + 'kg，正常体重 ' + normalKg + 'kg，现有 ' + bw + 'kg。补液量要覆盖失重的 125–150%，并同步补糖。',
          ['wc-weighin-recovery', 'hyd-replace'],
          '称重 ' + weighInKg + 'kg → 现在 ' + bw + 'kg，回升 ' + regainPct + '%（已失 ' + round1(lostKg) + 'kg）');
      } else if (regainPct < 50) {
        emit('REC-04', 'rec-fluid', 'amber', '体重回升不足（' + regainPct + '%）',
          '目标是在上场前把体重与体液基本拉回。继续按 1–1.5 L/h 含钠液体补，碳水跟上。',
          ['wc-weighin-recovery', 'hyd-replace'],
          '称重 ' + weighInKg + 'kg → 现在 ' + bw + 'kg，回升 ' + regainPct + '%');
      }
    }
  }

  // SUP-01：补剂执行（不升级人工）
  if (active['SUP-01'] && Array.isArray(log.supplementPlan.planned) && log.supplementPlan.planned.length) {
    var missed = log.supplementPlan.planned.filter(function (x) {
      return (log.supplementPlan.taken || []).indexOf(x) < 0;
    });
    if (missed.length) {
      emit('SUP-01', 'sup-plan', 'info', '补剂未按计划执行：' + missed.join('、'),
        '计划内未执行的补剂今天补上；咖啡因按赛前 3–6 mg/kg、60 分钟前。补剂不替代正餐。',
        ['sup-creatine', 'sup-caffeine', 'sup-warning'],
        '计划 ' + log.supplementPlan.planned.join('/') + '，已执行 ' + (log.supplementPlan.taken || []).join('/'));
    }
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

  // ---------- 6. 字段完整性（阶段必填） ----------
  var missing = [];
  (prof.fieldSchema.critical || []).forEach(function (key) {
    var ok = true;
    if (key === 'meals') ok = totals.structured >= 2;
    else if (key === 'hydration_plan') ok = !!(num(log.hydrationPlan.planMl) && num(log.hydrationPlan.actualMl) !== null);
    else if (key === 'gi_symptoms') ok = giMax !== null;
    else if (key === 'post_weighin_fluid') ok = num(log.postWeighIn.fluidMl) !== null;
    if (!ok) missing.push({ key: key, label: FIELD_LABELS[key] || key });
  });
  if (missing.length && !alerts.some(function (a) { return a.ruleId === 'LOG-01'; })) {
    var names = missing.map(function (m) { return m.label; }).join('、');
    emit('LOG-01', 'log-insufficient', 'amber', '本阶段必填项缺失：' + names,
      '阶段必填项缺失时，引擎只能说"不知道"，不能判达标。补齐后再看评分。',
      ['basic-logging'],
      '缺失：' + names);
  }

  // ---------- 7. 评分（按阶段权重加权） ----------
  function frac(v) { return clamp(v, 0, 1); }
  var hydFrac;
  if (phase === 'peak') {
    if (hydration.planRate === null) hydFrac = 0.35;
    else if (hydration.planRate >= 90) hydFrac = 1;
    else if (hydration.planRate >= 80) hydFrac = 0.8;
    else if (hydration.planRate >= 60) hydFrac = 0.55;
    else hydFrac = 0.2;
  } else if (phase === 'recover') {
    var pfv = num(log.postWeighIn.fluidMl);
    if (pfv === null) hydFrac = 0.3;
    else if (pfv >= 1000) hydFrac = 1;
    else if (pfv >= 500) hydFrac = 0.6;
    else hydFrac = 0.35;
  } else {
    if (hydration.pct === null) hydFrac = 0.48;
    else if (hydration.pct <= 1) hydFrac = 1;
    else if (hydration.pct <= 2) hydFrac = 0.72;
    else if (hydration.pct <= 3) hydFrac = 0.4;
    else hydFrac = 0.12;
  }

  var proFrac = protein.level === 'unknown' ? 0.48 : protein.level === 'ok' ? 1 : protein.level === 'amber' ? 0.64 : 0.2;
  var eneFrac = !energy.dataOk ? 0.5 : energy.level === 'ok' ? 1 : energy.level === 'amber' ? 0.65 : 0.3;
  var recFrac = 1;
  if (sorenessMax !== null && sorenessMax >= 7) recFrac -= 0.45;
  else if (sorenessMax !== null && sorenessMax >= 5) recFrac -= 0.2;
  if (sleepBad) recFrac -= 0.4;
  if (log.sleep.hours === null) recFrac -= 0.2;
  if (giMax !== null && giMax >= 2) recFrac -= 0.25;
  recFrac = clamp(recFrac, 0.1, 1);

  var logFrac;
  if (totals.count >= 3) logFrac = 1;
  else if (totals.count === 2) logFrac = 0.7;
  else if (totals.count === 1) logFrac = 0.2;
  else logFrac = 0;
  logFrac = clamp(logFrac - 0.1 * missing.length, 0, 1);

  var weights = prof.metricWeights;
  var numSum = 0, denSum = 0;
  [['hydration', hydFrac], ['protein', proFrac], ['energy', eneFrac], ['recovery', recFrac], ['logging', logFrac]]
    .forEach(function (pair) {
      var w = weights[pair[0]] || 0;
      if (w <= 0) return;
      numSum += w * frac(pair[1]);
      denSum += w;
    });
  var score = denSum ? clamp(Math.round((numSum / denSum) * 100), 0, 100) : 0;

  var level = score >= 85 ? '优' : score >= 70 ? '良' : score >= 55 ? '需调整' : '红灯';
  var levelTone = score >= 85 ? 'ok' : score >= 70 ? 'ok' : score >= 55 ? 'amber' : 'red';

  // 注意：red 的权重是 0，不能用 || 兜底（0 是 falsy，会被当成未知级别）
  const LEVEL_W = { red: 0, amber: 1, info: 2 };
  alerts.sort(function (a, b) {
    var wa = LEVEL_W[a.level] === undefined ? 3 : LEVEL_W[a.level];
    var wb = LEVEL_W[b.level] === undefined ? 3 : LEVEL_W[b.level];
    if (wa !== wb) return wa - wb;
    // 同级内，本阶段主告警类型优先
    var pa = prof.primaryAlertTypes.indexOf(a.ruleId) >= 0 ? 0 : 1;
    var pb = prof.primaryAlertTypes.indexOf(b.ruleId) >= 0 ? 0 : 1;
    return pa - pb;
  });

  // ---------- 8. 知识库提示（未触发告警的相关条目） ----------
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
  if (phase === 'peak') { pushTip('basic-fiber'); pushTip('hyd-sodium'); }
  if (phase === 'recover') { pushTip('wc-weighin-recovery'); pushTip('carb-recovery'); }
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
    version: 3,
    date: log.date,
    score: score,
    level: level,
    levelTone: levelTone,
    headline: headline,
    bw: bw,
    phase: phase,
    phaseLabel: prof.label,
    phaseProfile: {
      id: prof.id,
      label: prof.label,
      window: prof.window,
      goal: prof.goal,
      metricWeights: prof.metricWeights,
      primaryAlertTypes: prof.primaryAlertTypes,
      notes: prof.notes
    },
    activeRuleIds: prof.activeRuleIds.slice(),
    suppressedRuleIds: prof.suppressedRuleIds.slice(),
    suppressed: suppressedLog,
    missingRequired: missing,
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
    // 给教练端的一句话摘要（保留兼容，营养师端已改为跟进队列）
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
  getPhaseProfile: getPhaseProfile,
  fieldsFor: fieldsFor,
  resolvePhase: resolvePhase,
  phaseLabel: phaseLabel,
  suggestPhase: suggestPhase,
  daysBetween: daysBetween,
  proteinBand: proteinBand,
  getRuleById: function (ruleId) { return REG.getRule(ruleId); },
  listRules: function () { return REG.listRules(); },
  ruleSources: ruleSources,
  FIELD_LABELS: FIELD_LABELS,
  PHASE_PROFILES: PHASE_PROFILES,
  PHASE_ORDER: PHASE_ORDER,
  SOURCE_TYPES: REG.SOURCE_TYPES,
  REVIEW_STATUS: REG.REVIEW_STATUS,
  KB: KB,
  KB_MAP: KB_MAP,
  SESSION_LABEL: SESSION_LABEL,
  PLAN_LABEL: PLAN_LABEL
};
