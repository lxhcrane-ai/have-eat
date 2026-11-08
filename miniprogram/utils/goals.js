// 复合目标纯函数解析层
// 只做数据解析与裁决：不读写存储、不调用网络、不依赖 wx。
// 唯一口径：docs/goal-matrix.md、docs/schema.md、data/goalMatrix.js

const GM = require('../data/goalMatrix.js');

const PHASES = GM.PHASES;
const ATOMS = GM.ATOMS;
const MATRIX = GM.MATRIX;
const COMPOSITES = GM.COMPOSITES;
const CONFLICT_EDGES = GM.CONFLICT_EDGES;
const PRIORITY_STACK = GM.PRIORITY_STACK;

const ATOM_MAP = {};
ATOMS.forEach(function (a) { ATOM_MAP[a.id] = a; });

const COMPOSITE_MAP = {};
COMPOSITES.forEach(function (c) { COMPOSITE_MAP[c.id] = c; });

const ERROR_CODES = {
  UNKNOWN: 'E_GOAL_UNKNOWN',
  DUPLICATE: 'E_GOAL_DUPLICATE',
  QUOTA: 'E_GOAL_QUOTA',
  PHASE_ILLEGAL: 'E_GOAL_PHASE_ILLEGAL',
  FORBIDDEN: 'E_GOAL_FORBIDDEN',
  CONFLICT: 'E_GOAL_CONFLICT',
  EMPTY_DATE: 'E_GOAL_EMPTY_DATE',
  REFEED: 'E_GOAL_REFEED'
};

// 错误码 → 中文含义；页面只展示这张表，不另写“操作失败”
const ERROR_LABELS = {
  E_GOAL_UNKNOWN: '目标不存在或目标 ID 无法识别',
  E_GOAL_DUPLICATE: '同一个目标重复选择了',
  E_GOAL_QUOTA: '主目标最多 3 个，免疫监测最多 1 个',
  E_GOAL_PHASE_ILLEGAL: '当前阶段不允许这个目标',
  E_GOAL_FORBIDDEN: '该目标不可选（如医疗/女性/青少年需人工处理）',
  E_GOAL_CONFLICT: '目标组合与当前阶段冲突，需先调整阶段或目标',
  E_GOAL_EMPTY_DATE: '请填写目标生效日期',
  E_GOAL_BODYFAT: '体脂率应在 3–50% 之间',
  E_GOAL_REFEED: 'refeed 天数应为 0–7 的整数',
  E_GOAL_WRITE: '云端写入失败，目标未修改',
  PENDING_ADMISSION: '账号待准入，请先输入配对码'
};

function goalErrorText(code, fallback) {
  if (code && ERROR_LABELS[code]) return ERROR_LABELS[code];
  if (code) return '云端返回错误（' + code + '），目标未保存';
  return fallback || '云端未返回原因，目标未保存';
}

// 入口归一化映射：EN 只允许出现在这里，不得进入 atoms / composites。
const EN_ALIAS = { EN: 'G-SLE' };

// 优先级栈换算成可比排序：level 越小越优先；同层按 order，再按传入顺序。
const RANK = {};
PRIORITY_STACK.forEach(function (layer, li) {
  const ids = (layer.order && layer.order.length) ? layer.order : layer.members;
  ids.forEach(function (id, i) {
    if (!RANK[id]) RANK[id] = { level: li, order: i };
  });
});

// refeed 计划天数：0–7 整数；省略或 null/空串 = 清除（本周不安排）。
// 单一校验口径，云函数与页面都走这里。
function normalizeRefeedDays(v) {
  if (v === undefined || v === null || v === '') return { ok: true, days: null };
  const n = Number(v);
  if (!isFinite(n) || Math.round(n) !== n || n < 0 || n > 7) {
    return { ok: false, days: null, code: ERROR_CODES.REFEED, message: ERROR_LABELS.E_GOAL_REFEED };
  }
  return { ok: true, days: n };
}

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

// ---------------------------------------------------------------------------
// 1. 入口归一：EN → G-SLE、去重、IMM 排最后、名额核算
// ---------------------------------------------------------------------------
// 说明：重复项在这里被去重并记录到 duplicates。G6 的 setGoals 若要按
// E_GOAL_DUPLICATE 拒绝，应读取 duplicates 后自行拒绝；resolveGoalPlan 不因重复拒绝。
function normalizeGoals(input) {
  const errors = [];
  const aliases = [];
  const duplicates = [];
  const raw = (Array.isArray(input) ? input : [])
    .map(function (id) { return id === null || id === undefined ? '' : String(id).trim(); })
    .filter(Boolean);

  const seen = [];
  raw.forEach(function (original) {
    const id = EN_ALIAS[original] || original;
    if (id !== original) aliases.push({ from: original, to: id });
    if (seen.indexOf(id) >= 0) { duplicates.push(id); return; }
    seen.push(id);
  });

  const unknown = seen.filter(function (id) { return !ATOM_MAP[id]; });
  unknown.forEach(function (id) {
    errors.push({ code: ERROR_CODES.UNKNOWN, message: '未知目标 ID：' + id, goalId: id });
  });

  const forbidden = seen.filter(function (id) {
    return ATOM_MAP[id] && ATOM_MAP[id].selectable === false;
  });
  forbidden.forEach(function (id) {
    errors.push({ code: ERROR_CODES.FORBIDDEN, message: id + ' 不是可选目标', goalId: id });
  });

  const valid = seen.filter(function (id) {
    return ATOM_MAP[id] && ATOM_MAP[id].selectable !== false;
  });
  const counted = valid.filter(function (id) { return ATOM_MAP[id].occupiesSlot; });
  const monitors = valid.filter(function (id) { return !ATOM_MAP[id].occupiesSlot; });

  if (counted.length > 3) {
    errors.push({ code: ERROR_CODES.QUOTA, message: '最多 3 个主目标 + 1 个 IMM 监测', goalId: null });
  }
  if (monitors.length > 1) {
    errors.push({ code: ERROR_CODES.QUOTA, message: '最多 3 个主目标 + 1 个 IMM 监测', goalId: null });
  }

  const ordered = counted.concat(monitors);
  return {
    ok: errors.length === 0,
    goals: ordered,
    atoms: ordered,
    counted: counted,
    monitors: monitors,
    errors: errors,
    aliases: aliases,
    duplicates: duplicates
  };
}

// ---------------------------------------------------------------------------
// 2. 阶段合法性校验（含矩阵附加条件）
// ---------------------------------------------------------------------------
function daysBetween(fromDate, toDate) {
  const a = Date.parse(fromDate + 'T00:00:00Z');
  const b = Date.parse(toDate + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.floor((a - b) / 86400000);
}

function conditionMet(cell, ctx) {
  if (!cell || !cell.conditionKey) return true;
  if (cell.conditionKey === 'weighInGt84') {
    if (isNum(ctx.daysToWeigh)) return ctx.daysToWeigh > 84;
    if (typeof ctx.weighInDate === 'string' && ctx.weighInDate) {
      const today = ctx.today || new Date().toISOString().slice(0, 10);
      const days = daysBetween(ctx.weighInDate, today);
      if (days === null || days <= 0) return true; // 无未来称重日
      return days > 84;
    }
    return true; // 数据不足不判非法
  }
  if (cell.conditionKey === 'gapPctLte15') {
    if (isNum(ctx.gapPct)) return ctx.gapPct <= 1.5;
    return true;
  }
  return true;
}

// 目标设置页用：单个原子在当前阶段的可用状态。
// 唯一口径仍是矩阵 legal/condition；这里只把“能不能选、为什么不能选”摊平成页面字段。
function atomLegality(phase, atomId, ctx) {
  ctx = ctx || {};
  const atom = ATOM_MAP[atomId];
  const cell = MATRIX[phase] && MATRIX[phase][atomId];
  const out = {
    id: atomId,
    name: atom ? atom.name : atomId,
    dimension: atom ? atom.dimension : '',
    dimensionLabel: atom ? atom.dimensionLabel : '',
    occupiesSlot: !!(atom && atom.occupiesSlot),
    monitorOnly: !!(atom && atom.monitorOnly),
    selectable: !!(atom && atom.selectable !== false),
    legal: !!(cell && cell.legal),
    legality: cell ? cell.legality : 'illegal',
    goal01Level: cell ? (cell.goal01Level || null) : null,
    // 证据等级只认矩阵格子的 evidenceStatus，不用原子级默认值兜底。
    evidenceStatus: cell ? cell.evidenceStatus : null,
    condition: cell ? (cell.condition || null) : null,
    conditionMet: true,
    allowed: false,
    reason: ''
  };
  if (!atom) { out.reason = '目标不存在'; return out; }
  if (atom.selectable === false) {
    out.reason = (cell && cell.illegalReason) || '该目标需人工处理（医疗/女性/青少年），不开放选择';
    return out;
  }
  if (!cell) { out.reason = '当前阶段没有该目标的定义'; return out; }
  if (!cell.legal) { out.reason = cell.illegalReason || '当前阶段不允许该目标'; return out; }
  if (cell.legality === 'conditional') {
    const met = conditionMet(cell, ctx);
    out.conditionMet = met;
    if (!met) { out.reason = '需满足：' + (cell.condition || '附加条件'); return out; }
  }
  out.allowed = true;
  return out;
}

function validateGoals(phase, goals, ctx) {
  ctx = ctx || {};
  const errors = [];
  const row = MATRIX[phase];
  goals.forEach(function (id) {
    const cell = row && row[id];
    if (!cell) {
      errors.push({ code: ERROR_CODES.PHASE_ILLEGAL, message: id + ' 在 ' + phase + ' 不合法', goalId: id, level: 'red' });
      return;
    }
    if (!cell.legal) {
      errors.push({
        code: ERROR_CODES.PHASE_ILLEGAL,
        message: id + ' 在 ' + phase + ' 不合法：' + (cell.illegalReason || '阶段定义禁止'),
        goalId: id,
        level: cell.goal01Level || 'red'
      });
      return;
    }
    if (cell.legality === 'conditional' && !conditionMet(cell, ctx)) {
      errors.push({
        code: ERROR_CODES.PHASE_ILLEGAL,
        message: id + ' 在 ' + phase + ' 未满足附加条件：' + (cell.condition || ''),
        goalId: id,
        level: cell.goal01Level || 'amber'
      });
    }
  });
  return { ok: errors.length === 0, errors: errors };
}

// ---------------------------------------------------------------------------
// 3. 冲突裁决
// ---------------------------------------------------------------------------
function compareRank(a, b, order) {
  const ra = RANK[a] || { level: 99, order: 99 };
  const rb = RANK[b] || { level: 99, order: 99 };
  if (ra.level !== rb.level) return ra.level - rb.level;
  if (ra.order !== rb.order) return ra.order - rb.order;
  return order.indexOf(a) - order.indexOf(b);
}

function computeLead(atoms, ctx) {
  const red = (ctx.guardrailRed || []).filter(function (id) {
    return atoms.indexOf(id) >= 0 && ATOM_MAP[id] && ATOM_MAP[id].guardrail;
  });
  if (red.length) {
    red.sort(function (a, b) { return compareRank(a, b, atoms); });
    return red[0];
  }
  const main = atoms.filter(function (id) {
    const a = ATOM_MAP[id];
    return a && !a.guardrail && a.occupiesSlot;
  });
  if (main.length) {
    main.sort(function (a, b) { return compareRank(a, b, atoms); });
    return main[0];
  }
  // 没有表现/身体类主目标时，退到可占名额的护栏目标；只有 G-IMM 这类
  // 名额外监测原子时不产生 lead（它固定 role=monitor）。
  const countedGuard = atoms.filter(function (id) {
    const a = ATOM_MAP[id];
    return a && a.occupiesSlot;
  });
  if (!countedGuard.length) return null;
  countedGuard.sort(function (a, b) { return compareRank(a, b, atoms); });
  return countedGuard[0];
}

function effectiveLead(recipe, phase, atoms, ctx, computed) {
  if (!recipe) return computed;
  if (recipe.leadByPhase && recipe.leadByPhase[phase] && atoms.indexOf(recipe.leadByPhase[phase]) >= 0) {
    return recipe.leadByPhase[phase];
  }
  if (recipe.lead && atoms.indexOf(recipe.lead) >= 0) {
    const a = ATOM_MAP[recipe.lead];
    if (!a || !a.occupiesSlot) return computed; // G-IMM / G-MED 不做计划主导
    if (a.guardrail && /红灯/.test(recipe.leadNote || '')) {
      return (ctx.guardrailRed || []).indexOf(recipe.lead) >= 0 ? recipe.lead : computed;
    }
    return recipe.lead;
  }
  return computed;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const x = a.slice().sort();
  const y = b.slice().sort();
  return x.every(function (v, i) { return v === y[i]; });
}

function matchComposite(phase, atoms) {
  for (let i = 0; i < COMPOSITES.length; i++) {
    const c = COMPOSITES[i];
    if (c.phases.indexOf(phase) >= 0 && sameSet(c.atoms, atoms)) return c;
  }
  return null;
}

// veto 只允许出现在 guardrailAction / legality / goalBlockers.action。
// 旧数据若把 veto 写进 concessions[].mode，不静默吞掉：先写迁移提示，再归为 cap。
function normalizeMode(mode, notes, goalId) {
  if (mode === 'veto') {
    if (Array.isArray(notes)) {
      notes.push('迁移：' + (goalId || '让步') + ' 的旧 mode=veto 已归为 cap，护栏否决请用 guardrailAction');
    }
    return 'cap';
  }
  return mode;
}

function buildConcessions(phase, atoms, lead, recipe, modeNotes) {
  const out = [];
  function add(goalId, mode, reason, ruleRefs, guardrailAction) {
    if (!goalId || goalId === lead) return;
    const atom = ATOM_MAP[goalId];
    if (!atom || !atom.occupiesSlot) return; // G-IMM 只监测，不产生让步
    const existing = out.filter(function (x) { return x.goalId === goalId; })[0];
    if (existing) {
      if (guardrailAction && !existing.guardrailAction) existing.guardrailAction = guardrailAction;
      return;
    }
    out.push({
      goalId: goalId,
      mode: normalizeMode(mode, modeNotes, goalId),
      reason: reason,
      ruleRefs: ruleRefs || [],
      phaseWindow: phase,
      guardrailAction: guardrailAction || null
    });
  }

  if (recipe) {
    atoms.forEach(function (id) {
      if (id === lead) return;
      const cell = MATRIX[phase] && MATRIX[phase][id];
      add(
        id,
        recipe.mode,
        '命中 ' + recipe.id + ' ' + recipe.name + '；' + recipe.keyStrategy,
        ((cell && cell.monitorRules) || []).slice(0, 4),
        recipe.guardrailAction || null
      );
    });
  }

  CONFLICT_EDGES.forEach(function (e) {
    if (!e.mode || e.mode === 'forbid' || e.mode === 'monitor') return;
    if (e.producesConcession === false) return;
    if (e.b === '*') return;
    if (e.a === 'G-IMM' || e.b === 'G-IMM') return;
    if (atoms.indexOf(e.a) < 0 || atoms.indexOf(e.b) < 0) return;
    const target = (e.a === lead) ? e.b : ((e.b === lead) ? e.a : e.b);
    const cell = MATRIX[phase] && MATRIX[phase][target];
    add(target, e.mode, '冲突边 ' + e.a + '↔' + e.b + '：' + e.note, ((cell && cell.monitorRules) || []).slice(0, 4), null);
  });

  return out;
}

function resolveConflicts(phase, atoms, ctx) {
  let working = atoms.slice();
  const blocked = [];

  // forbid 边：丢掉优先级较低的一方，保留主导方；返回被拦下的目标。
  CONFLICT_EDGES.forEach(function (e) {
    if (e.b === '*' || e.producesConcession === false || e.mode !== 'forbid') return;
    if (working.indexOf(e.a) < 0 || working.indexOf(e.b) < 0) return;
    const lead = computeLead(working, ctx);
    const drop = (e.a === lead) ? e.b : e.a;
    working = working.filter(function (id) { return id !== drop; });
    blocked.push({ goalId: drop, blockerType: 'goal_conflict', reason: e.note });
  });

  const recipe = matchComposite(phase, working);
  const computed = computeLead(working, ctx);
  const lead = effectiveLead(recipe, phase, working, ctx, computed);
  const modeNotes = [];
  const concessions = buildConcessions(phase, working, lead, recipe, modeNotes);

  return {
    atoms: working,
    recipe: recipe,
    lead: lead,
    concessions: concessions,
    modeNotes: modeNotes,
    blocked: blocked,
    legality: blocked.length ? 'partial' : 'legal'
  };
}

// ---------------------------------------------------------------------------
// 4. 目标计划
// ---------------------------------------------------------------------------
function targetEntry(range, sourceType, sourceId) {
  return {
    min: range.min,
    max: range.max,
    unit: range.unit,
    sourceType: sourceType,
    sourceId: sourceId,
    advisory: true
  };
}

function applyCaps(targets, caps) {
  Object.keys(caps).forEach(function (key) {
    if (!targets[key] || !caps[key] || Array.isArray(targets[key])) return;
    const cap = caps[key];
    if (isNum(cap.min) && (!isNum(targets[key].min) || cap.min > targets[key].min)) targets[key].min = cap.min;
    if (isNum(cap.max) && (!isNum(targets[key].max) || cap.max < targets[key].max)) targets[key].max = cap.max;
  });
}

function buildTargets(phase, atoms, lead, recipe, evidence) {
  if (evidence === 'weak') return null;
  const ordered = [];
  if (lead) ordered.push(lead);
  atoms.forEach(function (id) { if (id !== lead) ordered.push(id); });

  let cell = null;
  for (let i = 0; i < ordered.length; i++) {
    const id = ordered[i];
    const atom = ATOM_MAP[id];
    const c = MATRIX[phase] && MATRIX[phase][id];
    if (!atom || !atom.occupiesSlot || !c || c.evidenceStatus === 'weak') continue;
    if (c.targets || c.macros) { cell = c; break; }
  }
  if (!cell) return null;
  if (cell.targets) return deepCopy(cell.targets);

  const m = cell.macros;
  const targets = {};
  if (m.protein) targets.protein = targetEntry(m.protein, 'rule', 'PRO-01');
  if (m.carb) targets.carb = targetEntry(m.carb, 'kb', 'carb-training');
  if (m.fat) targets.fat = targetEntry(m.fat, 'source', 'acsm2016');
  if (m.energyBalance) {
    const energySource = cell.monitorRules.indexOf('ENE-01') >= 0 ? 'ENE-01' : 'PHASE-01';
    targets.energyBalance = targetEntry(m.energyBalance, 'rule', energySource);
  }
  if (recipe && recipe.targetCaps) applyCaps(targets, recipe.targetCaps);
  return Object.keys(targets).length ? targets : null;
}

function overallEvidence(recipe, atoms, phase) {
  if (recipe) return recipe.evidence;
  const evs = atoms.map(function (id) {
    const c = MATRIX[phase] && MATRIX[phase][id];
    return c ? c.evidenceStatus : null;
  }).filter(Boolean);
  if (!evs.length) return 'strong';
  const hasWeak = evs.indexOf('weak') >= 0;
  const hasOther = evs.indexOf('strong') >= 0 || evs.indexOf('moderate') >= 0;
  if (hasWeak && hasOther) return 'mixed';
  if (hasWeak) return 'weak';
  if (evs.indexOf('moderate') >= 0) return 'moderate';
  return 'strong';
}

function buildNotes(phase, recipe, lead, concessions, evidence, modeNotes) {
  const notes = [];
  (modeNotes || []).forEach(function (n) { notes.push(n); });
  if (recipe) {
    notes.push(recipe.id + ' ' + recipe.name + '：' + recipe.keyStrategy);
  } else if (lead) {
    const c = MATRIX[phase] && MATRIX[phase][lead];
    if (c && c.strategy) notes.push(c.strategy);
  }
  if (evidence === 'weak') notes.push('证据偏弱：只输出监测项，不给数值处方');
  concessions.forEach(function (c) {
    notes.push(c.goalId + '：' + c.mode + '（' + c.reason + '）');
  });
  return notes.slice(0, 5);
}

function emptyPlan(phase) {
  return {
    goals: [],
    atoms: [],
    composites: [],
    phase: phase,
    legality: 'legal',
    lead: null,
    concessions: [],
    targets: null,
    cells: [],
    evidenceStatus: 'strong',
    notes: []
  };
}

function rejection(error, norm) {
  return {
    ok: false,
    goalPlan: null,
    blocked: error.goalId ? [{ goalId: error.goalId, blockerType: 'goal_illegal', reason: error.message }] : [],
    error: {
      code: error.code,
      message: error.message,
      goalId: error.goalId || null,
      level: error.level || 'red'
    },
    aliases: (norm && norm.aliases) || [],
    duplicates: (norm && norm.duplicates) || []
  };
}

function resolveGoalPlan(phase, rawGoals, ctx) {
  ctx = ctx || {};
  if (PHASES.indexOf(phase) < 0) {
    return rejection({ code: ERROR_CODES.PHASE_ILLEGAL, message: '未知阶段：' + phase, goalId: null });
  }

  const norm = normalizeGoals(rawGoals);
  if (!norm.ok) return rejection(norm.errors[0], norm);

  if (!norm.atoms.length) {
    return { ok: true, goalPlan: emptyPlan(phase), blocked: [], error: null, aliases: norm.aliases, duplicates: norm.duplicates };
  }

  const valid = validateGoals(phase, norm.atoms, ctx);
  if (!valid.ok) return rejection(valid.errors[0], norm);

  const resolved = resolveConflicts(phase, norm.atoms, ctx);
  const atoms = resolved.atoms;
  const evidence = overallEvidence(resolved.recipe, atoms, phase);
  const targets = buildTargets(phase, atoms, resolved.lead, resolved.recipe, evidence);

  const goals = atoms.map(function (id) {
    const a = ATOM_MAP[id];
    const counts = a.occupiesSlot === true;
    return {
      id: id,
      name: a.name,
      dimension: a.dimension,
      role: counts ? (id === resolved.lead ? 'lead' : 'concede') : 'monitor',
      source: 'nutritionist',
      countsTowardQuota: counts
    };
  });

  const cells = atoms.map(function (id) {
    const c = MATRIX[phase][id];
    return {
      goalId: id,
      phase: phase,
      cellId: c.cellId,
      legal: c.legal,
      evidenceStatus: c.evidenceStatus,
      reviewStatus: c.reviewStatus
    };
  });

  const plan = {
    goals: goals,
    atoms: atoms,
    composites: resolved.recipe ? [resolved.recipe.id] : [],
    phase: phase,
    legality: resolved.legality,
    lead: resolved.lead,
    concessions: resolved.concessions,
    targets: targets,
    cells: cells,
    evidenceStatus: evidence,
    notes: buildNotes(phase, resolved.recipe, resolved.lead, resolved.concessions, evidence, resolved.modeNotes)
  };

  return {
    ok: true,
    goalPlan: plan,
    blocked: resolved.blocked,
    error: null,
    aliases: norm.aliases,
    duplicates: norm.duplicates
  };
}

// 文档中的函数名；本文件按本轮任务同时提供 resolveGoalPlan 命名。
function buildGoalPlan(phase, goals, ctx) {
  return resolveGoalPlan(phase, goals, ctx);
}

// ---------------------------------------------------------------------------
// 5. goalAdherence：独立评分，不进 score
// ---------------------------------------------------------------------------
function isHHMM(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function hhmmToMin(v) {
  const parts = v.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function carbsOf(meal) {
  if (!meal) return 0;
  if (isNum(meal.carbs)) return meal.carbs;
  if (Array.isArray(meal.items)) {
    return meal.items.reduce(function (s, it) { return s + (isNum(it.carbs) ? it.carbs : 0); }, 0);
  }
  return 0;
}

function fuelTimingValue(log) {
  const t = log && log.training;
  if (!t || !isHHMM(t.startTime)) return { ok: false, reason: 'no_startTime' };
  const meals = (log && Array.isArray(log.meals)) ? log.meals : [];
  const timed = meals.filter(function (m) { return m && isHHMM(m.time) && carbsOf(m) > 0; });
  if (!timed.length) return { ok: false, reason: 'no_meal_time' };
  const start = hhmmToMin(t.startTime);
  const hit = timed.some(function (m) {
    let diff = hhmmToMin(m.time) - start;
    if (diff < -720) diff += 1440;
    if (diff > 720) diff -= 1440;
    return diff >= -180 && diff <= 120;
  });
  return { ok: true, value: hit ? 100 : 0 };
}

function sessionQualityValue(log) {
  const q = log && log.training ? log.training.quality : null;
  if (!isNum(q)) return { ok: false, reason: 'no_quality' };
  if (q < 1 || q > 5) return { ok: false, reason: 'bad_quality' };
  return { ok: true, value: Math.round(q * 20) };
}

function refeedValue(ctx) {
  const r = ctx && ctx.refeed;
  if (!r) return { ok: false, reason: 'not_weekly' };
  if (isNum(r.rate)) return { ok: true, value: Math.round(clamp(r.rate, 0, 1) * 100) };
  if (isNum(r.okDays) && isNum(r.totalDays) && r.totalDays > 0) {
    return { ok: true, value: Math.round(clamp(r.okDays / r.totalDays, 0, 1) * 100) };
  }
  if (typeof r.ok === 'boolean') return { ok: true, value: r.ok ? 100 : 0 };
  return { ok: false, reason: 'not_weekly' };
}

function evidenceFor(atoms, phase) {
  const evs = atoms.map(function (id) {
    const c = MATRIX[phase] && MATRIX[phase][id];
    return c ? c.evidenceStatus : null;
  }).filter(Boolean);
  if (evs.indexOf('weak') >= 0) return 'mixed';
  if (evs.indexOf('moderate') >= 0) return 'moderate';
  return 'strong';
}

function assignWeights(components) {
  const n = components.length;
  if (n === 1) components[0].weight = 1;
  else if (n === 2) { components[0].weight = 0.5; components[1].weight = 0.5; }
  else { components[0].weight = 0.34; components[1].weight = 0.33; components[2].weight = 0.33; }
}

function adherenceLevel(score) {
  if (score >= 85) return 'ok';
  if (score >= 70) return 'amber';
  return 'red';
}

function goalAdherence(log, plan, ctx) {
  ctx = ctx || {};
  if (!plan || !Array.isArray(plan.atoms) || !plan.atoms.length) {
    return { score: null, level: 'unknown', components: [], unavailableReason: 'no_goals' };
  }
  const phase = plan.phase;
  const strongAtoms = plan.atoms.filter(function (id) {
    const c = MATRIX[phase] && MATRIX[phase][id];
    return c && c.evidenceStatus !== 'weak' && ATOM_MAP[id] && ATOM_MAP[id].occupiesSlot;
  });
  if (!strongAtoms.length) {
    return { score: null, level: 'unknown', components: [], unavailableReason: 'weak_evidence' };
  }

  const components = [];
  let firstReason = null;
  const evidence = evidenceFor(strongAtoms, phase);
  const sourceFieldsFor = {
    fuelTiming: ['training.startTime', 'meals'],
    sessionQuality: ['training.quality'],
    refeedCadence: ['weekly.refeed']
  };

  function push(id, label, result) {
    if (result.ok) {
      components.push({
        id: id,
        label: label,
        value: result.value,
        weight: 0,
        dataOk: true,
        sourceFields: sourceFieldsFor[id],
        evidenceStatus: evidence
      });
    } else if (!firstReason) {
      firstReason = result.reason;
    }
  }

  const has = function (ids) {
    return strongAtoms.some(function (id) { return ids.indexOf(id) >= 0; });
  };

  if (has(['P-POW', 'P-SPD', 'P-END', 'P-SKL', 'P-HYP'])) {
    push('fuelTiming', '训练前后补给时机', fuelTimingValue(log));
  }
  if (has(['P-POW', 'P-SPD', 'P-SKL'])) {
    push('sessionQuality', '训练质量', sessionQualityValue(log));
  }
  if (strongAtoms.indexOf('B-CUT') >= 0) {
    push('refeedCadence', 'refeed 节奏', refeedValue(ctx));
  }

  if (!components.length) {
    return { score: null, level: 'unknown', components: [], unavailableReason: firstReason || 'no_data' };
  }
  assignWeights(components);
  const score = Math.round(components.reduce(function (s, c) { return s + c.value * c.weight; }, 0));
  return { score: score, level: adherenceLevel(score), components: components };
}

// ---------------------------------------------------------------------------
// 6. goalBlockers：不是告警，不进入 alerts
// ---------------------------------------------------------------------------
function maxGi(gi) {
  if (!gi || typeof gi !== 'object') return 0;
  let max = 0;
  Object.keys(gi).forEach(function (k) {
    if (isNum(gi[k]) && gi[k] > max) max = gi[k];
  });
  return max;
}

function goalBlockers(plan, log, ctx) {
  ctx = ctx || {};
  if (!plan || !plan.phase || !Array.isArray(plan.atoms) || !plan.atoms.length) return [];
  const phase = plan.phase;
  const out = [];
  const seen = {};

  function add(goalId, blockerType, ruleId, level, action, message, suppressedByPhase) {
    const key = goalId + '|' + blockerType + '|' + (ruleId || '');
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      goalId: goalId,
      blockerType: blockerType,
      ruleId: ruleId || null,
      level: level,
      action: action,
      message: message,
      suppressedByPhase: suppressedByPhase === true
    });
  }

  // 阶段被改掉后，计划可能残留旧格 → goal_illegal
  plan.atoms.forEach(function (id) {
    const cell = MATRIX[phase] && MATRIX[phase][id];
    if (cell && !cell.legal) {
      add(id, 'goal_illegal', 'GOAL-01', 'red', 'veto', id + ' 在当前阶段不合法', false);
    }
  });

  // maintain / cut 期 GI 只记录
  if (plan.atoms.indexOf('G-GI') >= 0 && (phase === 'maintain' || phase === 'cut')) {
    add('G-GI', 'phase_suppressed', 'GI-01', 'info', 'monitor', 'maintain/cut 期 GI 只记录，不告警', true);
  }

  // 弱证据目标只输出监测项
  plan.atoms.forEach(function (id) {
    const cell = MATRIX[phase] && MATRIX[phase][id];
    if (cell && cell.evidenceStatus === 'weak') {
      add(id, 'evidence_weak', null, 'info', 'monitor', id + ' 证据偏弱，只监测，不给数值处方', false);
    }
  });

  // 能量可用性
  if (plan.atoms.indexOf('G-EA') >= 0) {
    if (ctx.bodyFatPct === null || ctx.bodyFatPct === undefined) {
      add('G-EA', 'data_missing', null, 'info', 'monitor', '缺少 bodyFatPct，EA 无法判断', false);
    } else if (!isNum(ctx.eaKcalKgFfm)) {
      add('G-EA', 'data_missing', null, 'info', 'monitor', '缺少训练消耗或摄入数据，EA 无法判断', false);
    } else if (isNum(ctx.eaKcalKgFfm) && ctx.eaKcalKgFfm < 30) {
      // G-EA 没有 owner 规则：不凭空引 GOAL-02，ruleId 留空，只写护栏动作。
      add('G-EA', 'guardrail', null, 'red', 'veto', 'EA<30 kcal/kg FFM，否决加深缺口或加练', false);
    }
  }

  // 睡眠限制
  const sleepHours = log && log.sleep && isNum(log.sleep.hours) ? log.sleep.hours : null;
  if (sleepHours !== null && sleepHours < 6.5 && plan.atoms.indexOf('G-SLE') >= 0) {
    const target = ['P-END', 'P-POW', 'P-SPD', 'P-HYP'].filter(function (id) {
      return plan.atoms.indexOf(id) >= 0;
    })[0] || 'G-SLE';
    const red = sleepHours < 6;
    add(
      target,
      'guardrail',
      'SLE-01',
      red ? 'red' : 'amber',
      red ? 'veto' : 'cap',
      '睡眠 ' + sleepHours + 'h，限制强度或容量',
      false
    );
  }

  // 胃肠限制（peak / recover）
  if (plan.atoms.indexOf('G-GI') >= 0 && (phase === 'peak' || phase === 'recover')) {
    if (maxGi(log && log.giSymptoms) >= 2) {
      const target = ['P-END', 'B-GAIN', 'P-HYP'].filter(function (id) {
        return plan.atoms.indexOf(id) >= 0;
      })[0] || 'G-GI';
      add(target, 'guardrail', 'GI-01', 'amber', 'cap', '胃肠症状≥2，限制纤维、体积或缺口', false);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 7. goalView：页面展示用的只读视图，文案与数值都从 plan/adherence 出参整理
// ---------------------------------------------------------------------------
const EVIDENCE_LABELS = { strong: '证据充分', moderate: '证据中等', mixed: '证据参差', weak: '证据偏弱' };
const ROLE_LABELS = { lead: '主导', concede: '让步', monitor: '监测' };
const MODE_LABELS = { forbid: '禁止', cap: '封顶', sequence: '序贯', block: '阻断', substitute: '替换', monitor: '监测' };
const ADHERENCE_LABELS = { ok: '依从良好', amber: '部分偏离', red: '明显偏离', unknown: '数据不足' };
const ADHERENCE_TONES = { ok: 'ok', amber: 'amber', red: 'red', unknown: 'info' };
const ADHERENCE_HINTS = {
  no_goals: '今天没有目标计划',
  weak_evidence: '证据偏弱，不做依从评分',
  no_data: '今天缺少可评分字段',
  no_startTime: '没填训练开始时间，补给时机不评分',
  no_meal_time: '缺少带时间的碳水餐，补给时机不评分',
  no_quality: '没填训练主观质量，训练质量不评分',
  bad_quality: '训练质量超出 1–5，按缺数据处理',
  not_weekly: '还没有本周 refeed 数据'
};
const TARGET_LABELS = { protein: '蛋白', carb: '碳水', fat: '脂肪', energyBalance: '能量平衡' };
const BLOCKER_LABELS = {
  goal_illegal: '阶段不合法',
  goal_conflict: '目标冲突',
  phase_suppressed: '阶段抑制',
  evidence_weak: '证据偏弱',
  data_missing: '数据缺失',
  guardrail: '护栏拦截'
};

const TARGET_UNITS = { protein: 'g/kg', carb: 'g/kg', fat: 'g/kg', energyBalance: 'kcal' };

// 区间两种编码：object {min,max} 与数组 [[4,7],[8,12]]（B-REFUEL 双协议）。
// 数组必须逐段渲染成“4–7 或 8–12 g/kg”，不得连续化成 4–12，也不得出现 undefined。
function rangeText(t, unit) {
  if (Array.isArray(t)) {
    const segs = t.map(function (seg) {
      if (!Array.isArray(seg) || seg.length < 2) return '';
      if (!isNum(Number(seg[0])) || !isNum(Number(seg[1]))) return '';
      return seg[0] + '–' + seg[1];
    }).filter(Boolean);
    if (!segs.length) return '按监测执行';
    return segs.join(' 或 ') + (unit ? ' ' + unit : '');
  }
  if (!t) return '按监测执行';
  const u = t.unit || unit || '';
  const hasMin = isNum(t.min);
  const hasMax = isNum(t.max);
  const suffix = u ? ' ' + u : '';
  if (!hasMin && !hasMax) return '按监测执行';
  if (!hasMin) return '≤ ' + t.max + suffix;
  if (!hasMax) return '≥ ' + t.min + suffix;
  var sep = (t.min < 0 || t.max < 0) ? ' ~ ' : '–';
  return t.min + sep + t.max + suffix;
}

function goalView(plan, adherence, blockers, opts) {
  opts = opts || {};
  if (!plan || !Array.isArray(plan.atoms) || !plan.atoms.length) {
    return { hasGoals: false };
  }
  const evidence = plan.evidenceStatus || 'strong';
  const weak = evidence === 'weak';
  const numericOk = !!plan.targets;
  const tw = Number(opts.targetWeightKg);
  const weight = (numericOk && isFinite(tw) && tw > 0) ? { kg: tw, text: '目标 ' + tw + ' kg' } : null;

  const targetLines = [];
  if (plan.targets) {
    Object.keys(plan.targets).forEach(function (key) {
      const t = plan.targets[key];
      if (!t) return;
      targetLines.push({ key: key, label: TARGET_LABELS[key] || key, text: rangeText(t, TARGET_UNITS[key]) });
    });
  }

  const concessionLines = (plan.concessions || []).map(function (c) {
    const atom = ATOM_MAP[c.goalId];
    return {
      goalId: c.goalId,
      goalName: atom ? atom.name : c.goalId,
      mode: c.mode,
      modeLabel: MODE_LABELS[c.mode] || c.mode,
      reason: c.reason || ''
    };
  });

  let adh = { show: false };
  if (adherence) {
    const unknown = adherence.level === 'unknown' || adherence.score === null;
    adh = {
      show: true,
      unknown: unknown,
      level: adherence.level || 'unknown',
      levelLabel: ADHERENCE_LABELS[adherence.level || 'unknown'],
      tone: ADHERENCE_TONES[adherence.level || 'unknown'],
      scoreText: unknown ? '' : adherence.score + ' 分',
      hint: unknown ? (ADHERENCE_HINTS[adherence.unavailableReason] || '数据不足') : '独立评分，不并入当日总分',
      components: (adherence.components || []).map(function (c) {
        return { id: c.id, label: c.label, valueText: c.value + ' 分', weightText: Math.round(c.weight * 100) + '%' };
      })
    };
  }

  return {
    hasGoals: true,
    phase: plan.phase,
    leadId: plan.lead,
    leadName: plan.lead ? (ATOM_MAP[plan.lead] ? ATOM_MAP[plan.lead].name : plan.lead) : '',
    goalNames: (plan.goals || []).map(function (g) {
      return { id: g.id, name: g.name, role: g.role, roleLabel: ROLE_LABELS[g.role] || g.role };
    }),
    evidenceStatus: evidence,
    evidenceLabel: EVIDENCE_LABELS[evidence] || evidence,
    weak: weak,
    evidenceNote: weak ? '证据偏弱：只给监测项，不给数值线' : (evidence === 'mixed' ? '证据参差：弱证据目标只给监测项' : ''),
    numericOk: numericOk,
    weight: weight,
    targetLines: targetLines,
    concessions: concessionLines,
    notes: plan.notes || [],
    strategyText: (plan.notes && plan.notes[0]) ? plan.notes[0] : '',
    compositeNames: (plan.composites || []).map(function (id) {
      const c = COMPOSITE_MAP[id];
      return { id: id, name: c ? c.name : id };
    }),
    adherence: adh,
    blockers: (blockers || []).map(function (b) {
      const atom = ATOM_MAP[b.goalId];
      return {
        goalId: b.goalId,
        goalName: atom ? atom.name : b.goalId,
        blockerType: b.blockerType || '',
        blockerTypeLabel: BLOCKER_LABELS[b.blockerType] || '',
        level: b.level,
        action: b.action,
        message: b.message,
        suppressedByPhase: b.suppressedByPhase === true
      };
    })
  };
}

// ---------------------------------------------------------------------------
// 8. goalChips：营养师端列表用的紧凑视图（无目标时 hasGoals=false）
// ---------------------------------------------------------------------------
function goalChips(phase, rawGoals, ctx) {
  const norm = normalizeGoals(rawGoals);
  if (!norm.atoms.length) {
    return { hasGoals: false, chips: [], conflict: false, legality: null, leadId: '', leadName: '', evidence: null };
  }
  const resolved = resolveGoalPlan(phase, rawGoals, ctx || {});
  if (resolved.ok) {
    const plan = resolved.goalPlan;
    const ev = plan.evidenceStatus || 'strong';
    return {
      hasGoals: true,
      conflict: plan.legality !== 'legal',
      legality: plan.legality,
      leadId: plan.lead || '',
      leadName: plan.lead ? (ATOM_MAP[plan.lead] ? ATOM_MAP[plan.lead].name : plan.lead) : '',
      chips: (plan.goals || []).map(function (g) {
        return { id: g.id, name: g.name, role: g.role, roleLabel: ROLE_LABELS[g.role] || g.role };
      }),
      evidence: { status: ev, label: EVIDENCE_LABELS[ev] || ev, weak: ev === 'weak' }
    };
  }
  const ev = overallEvidence(null, norm.atoms, phase);
  return {
    hasGoals: true,
    conflict: true,
    legality: 'illegal',
    leadId: '',
    leadName: '',
    chips: norm.atoms.map(function (id) {
      const atom = ATOM_MAP[id];
      const role = atom && atom.occupiesSlot ? 'concede' : 'monitor';
      return { id: id, name: atom ? atom.name : id, role: role, roleLabel: ROLE_LABELS[role] };
    }),
    evidence: { status: ev, label: EVIDENCE_LABELS[ev] || ev, weak: ev === 'weak' }
  };
}

// ---------------------------------------------------------------------------
// 9. validateGoalWrite：setGoals 的唯一校验入口（纯函数，不读写存储）
// 任何一条不通过都整次拒绝；返回写入补丁字段，不做部分写入。
// ---------------------------------------------------------------------------
function validDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function writeFail(code, message, extra) {
  extra = extra || {};
  return {
    ok: false,
    error: {
      code: code,
      message: message,
      goalId: extra.goalId || null,
      level: extra.level || null
    }
  };
}

function validateGoalWrite(input, profile, ctx) {
  input = input || {};
  profile = profile || {};
  ctx = ctx || {};

  if (input.goals !== undefined && !Array.isArray(input.goals)) {
    return writeFail('E_GOAL_UNKNOWN', 'goals 必须是目标 ID 数组');
  }

  const norm = normalizeGoals(input.goals);
  if (norm.duplicates.length) {
    return writeFail(ERROR_CODES.DUPLICATE, '目标重复：' + norm.duplicates.join('、'));
  }
  if (!norm.ok) {
    const e = norm.errors[0];
    return writeFail(e.code, e.message, e);
  }

  const date = typeof input.goalEffectiveDate === 'string' ? input.goalEffectiveDate.trim() : '';
  if (norm.atoms.length && !validDateStr(date)) {
    return writeFail(ERROR_CODES.EMPTY_DATE, '缺少或无效的目标生效日期（YYYY-MM-DD）');
  }

  let bodyFatPct;
  const hasBodyFat = Object.prototype.hasOwnProperty.call(input, 'bodyFatPct');
  if (hasBodyFat && input.bodyFatPct !== null) {
    const bf = Number(input.bodyFatPct);
    if (!isNum(bf) || bf < 3 || bf > 50) {
      return writeFail('E_GOAL_BODYFAT', 'bodyFatPct 应在 3–50 之间');
    }
    bodyFatPct = Math.round(bf * 10) / 10;
  } else if (hasBodyFat) {
    bodyFatPct = null;
  } else {
    bodyFatPct = isNum(profile.bodyFatPct) ? profile.bodyFatPct : null;
  }

  const phase = PHASES.indexOf(profile.phase) >= 0 ? profile.phase : 'maintain';
  const cond = { bodyFatPct: bodyFatPct, today: ctx.today || new Date().toISOString().slice(0, 10) };
  if (isNum(ctx.daysToWeigh)) {
    cond.daysToWeigh = ctx.daysToWeigh;
  } else if (typeof profile.weighInDate === 'string' && profile.weighInDate) {
    const d = daysBetween(profile.weighInDate, cond.today);
    if (d !== null) cond.daysToWeigh = d;
  }
  if (isNum(ctx.gapPct)) {
    cond.gapPct = ctx.gapPct;
  } else if (isNum(profile.weightKg) && isNum(profile.targetWeightKg) && profile.targetWeightKg > 0) {
    cond.gapPct = Math.round(((profile.weightKg - profile.targetWeightKg) / profile.targetWeightKg) * 1000) / 10;
  }

  const valid = validateGoals(phase, norm.atoms, cond);
  if (!valid.ok) {
    const e = valid.errors[0];
    return writeFail(e.code, e.message, e);
  }

  const resolved = resolveGoalPlan(phase, norm.atoms, cond);
  if (!resolved.ok) {
    const e = resolved.error;
    return writeFail(e.code, e.message, e);
  }
  if (resolved.goalPlan.legality === 'partial') {
    return writeFail(
      ERROR_CODES.CONFLICT,
      '目标与当前阶段存在裁剪冲突：' + (resolved.blocked || []).map(function (b) { return b.goalId; }).join('、'),
      { level: 'amber' }
    );
  }

  return {
    ok: true,
    goals: norm.atoms,
    goalEffectiveDate: norm.atoms.length ? date : '',
    goalSource: 'nutritionist',
    bodyFatPct: bodyFatPct,
    phase: phase,
    matrixVersion: GM.GOAL_MATRIX_VERSION,
    goalPlan: resolved.goalPlan
  };
}

module.exports = {
  GOAL_MATRIX_VERSION: GM.GOAL_MATRIX_VERSION,
  ERROR_CODES: ERROR_CODES,
  ERROR_LABELS: ERROR_LABELS,
  goalErrorText: goalErrorText,
  EN_ALIAS: EN_ALIAS,
  normalizeGoals: normalizeGoals,
  atomLegality: atomLegality,
  validateGoals: validateGoals,
  validateGoalWrite: validateGoalWrite,
  resolveConflicts: resolveConflicts,
  resolveGoalPlan: resolveGoalPlan,
  buildGoalPlan: buildGoalPlan,
  goalAdherence: goalAdherence,
  goalBlockers: goalBlockers,
  goalView: goalView,
  goalChips: goalChips,
  rangeText: rangeText,
  normalizeMode: normalizeMode,
  normalizeRefeedDays: normalizeRefeedDays
};
