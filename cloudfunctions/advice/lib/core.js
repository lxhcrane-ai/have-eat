// 营养师审阅建议：接口契约 + 纯函数。
// 约束：无 wx.* / 无云 SDK 依赖，可直接用 node 单测；不参与规则引擎评分。
// 契约在 S1 冻结：集合字段、状态机、窗口归一、快照结构、留痕与通知结构均以本文件为准。

const STATUS = { DRAFT: 'draft', PUBLISHED: 'published', REVOKED: 'revoked' };
const SCOPE = { DAY: 'day', RANGE: 'range' };

// 状态机：draft → published → revoked；published 允许原地编辑（version+1 并留痕，不改变状态）
const TRANSITIONS = {
  draft: [STATUS.PUBLISHED],
  published: [STATUS.PUBLISHED, STATUS.REVOKED],
  revoked: []
};

// advice 云函数动作清单（S1 冻结；S5 启用 revoke / update）
const ACTIONS = ['getContext', 'get', 'list', 'saveDraft', 'publish', 'revoke', 'update'];
const ACTIONS_ENABLED = ['getContext', 'get', 'list', 'saveDraft', 'publish', 'revoke', 'update'];

const LIMITS = {
  BODY: 3000,
  REASON: 200,
  INBOX_PREVIEW: 60,
  RULE_IDS: 40,
  KB_IDS: 40,
  SNAPSHOT_ALERTS: 20,
  SNAPSHOT_SOURCES: 6,
  TIPS: 3,
  TIP_BODY: 160,
  LIST_LIMIT: 30
};

// ---------------------------------------------------------------------------
// 日期 / 窗口
// ---------------------------------------------------------------------------
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function todayStr(nowMs) {
  var d = new Date((nowMs || Date.now()) + 8 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function isDate(s) {
  var str = String(s === null || s === undefined ? '' : s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  var d = new Date(str + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === str;
}

function normalizeScope(scope) {
  return scope === SCOPE.RANGE ? SCOPE.RANGE : SCOPE.DAY;
}

// 单日：date；区间：dateFrom/dateTo。两种窗口都落 dateFrom/dateTo，查询统一用区间覆盖判断。
function resolveWindow(input) {
  input = input || {};
  var scope = normalizeScope(input.scope);
  if (scope === SCOPE.DAY) {
    var day = String(input.date || '').trim();
    if (!isDate(day)) return { ok: false, error: 'date 需为 YYYY-MM-DD' };
    return { ok: true, scope: scope, date: day, dateFrom: day, dateTo: day };
  }
  var from = String(input.dateFrom || '').trim();
  var to = String(input.dateTo || '').trim();
  if (!isDate(from) || !isDate(to)) return { ok: false, error: 'dateFrom/dateTo 需为 YYYY-MM-DD' };
  if (from > to) return { ok: false, error: 'dateFrom 不能晚于 dateTo' };
  return { ok: true, scope: scope, date: to, dateFrom: from, dateTo: to };
}

// ---------------------------------------------------------------------------
// 文本 / 入参归一
// ---------------------------------------------------------------------------
function cleanText(v, max) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function previewText(body, max) {
  var s = cleanText(body, 0).replace(/\s+/g, ' ').trim();
  var m = max || LIMITS.INBOX_PREVIEW;
  return s.length <= m ? s : s.slice(0, m) + '…';
}

function normalizeIds(list, max) {
  if (!Array.isArray(list)) return [];
  var seen = {};
  var out = [];
  list.forEach(function (x) {
    var s = cleanText(x, 40);
    if (!s || seen[s]) return;
    seen[s] = true;
    if (out.length < max) out.push(s);
  });
  return out;
}

// 草稿入参：athleteId + 窗口 + 正文（必填）+ 可选 phase/ruleIds/kbIds/logUpdatedAt
function normalizeDraftInput(event) {
  event = event || {};
  var w = resolveWindow(event);
  if (!w.ok) return w;
  var athleteId = cleanText(event.athleteId, 64);
  if (!athleteId) return { ok: false, error: '缺少 athleteId' };
  var body = cleanText(event.body, LIMITS.BODY);
  if (!body) return { ok: false, error: '建议内容不能为空' };
  return {
    ok: true,
    data: {
      athleteId: athleteId,
      scope: w.scope,
      date: w.date,
      dateFrom: w.dateFrom,
      dateTo: w.dateTo,
      phase: cleanText(event.phase, 16),
      body: body,
      ruleIds: normalizeIds(event.ruleIds, LIMITS.RULE_IDS),
      kbIds: normalizeIds(event.kbIds, LIMITS.KB_IDS),
      logUpdatedAt: cleanText(event.logUpdatedAt, 40)
    }
  };
}

function canTransition(from, to) {
  var arr = TRANSITIONS[from] || [];
  return arr.indexOf(to) >= 0;
}

function publishCheck(doc) {
  if (!doc) return { ok: false, error: '建议草稿不存在' };
  if (doc.status !== STATUS.DRAFT) return { ok: false, error: '当前状态不是草稿' };
  if (!cleanText(doc.body, LIMITS.BODY)) return { ok: false, error: '建议内容不能为空' };
  if (!canTransition(doc.status, STATUS.PUBLISHED)) return { ok: false, error: '状态不允许发布' };
  return { ok: true };
}

// 发布后编辑：仅 published 可改，正文必填；改完仍是 published（版本 +1 并留痕）
function updateCheck(doc, body) {
  if (!doc) return { ok: false, error: '建议不存在' };
  if (doc.status !== STATUS.PUBLISHED) {
    return { ok: false, error: '只有已发布建议可以修改', code: 'NOT_PUBLISHED' };
  }
  if (!cleanText(body, LIMITS.BODY)) return { ok: false, error: '建议内容不能为空' };
  if (!canTransition(doc.status, STATUS.PUBLISHED)) return { ok: false, error: '状态不允许修改' };
  return { ok: true };
}

// 撤回：published → revoked；已撤回视为幂等成功，草稿不可撤回
function revokeCheck(doc) {
  if (!doc) return { ok: false, error: '建议不存在' };
  if (doc.status === STATUS.REVOKED) return { ok: true, already: true };
  if (doc.status !== STATUS.PUBLISHED) {
    return { ok: false, error: '只有已发布建议可以撤回', code: 'NOT_PUBLISHED' };
  }
  if (!canTransition(doc.status, STATUS.REVOKED)) return { ok: false, error: '状态不允许撤回' };
  return { ok: true };
}

// 编辑入参：正文必填；引用与原因可选，原因由服务端兜底
function normalizeUpdateInput(event) {
  event = event || {};
  var body = cleanText(event.body, LIMITS.BODY);
  if (!body) return { ok: false, error: '建议内容不能为空' };
  return {
    ok: true,
    data: {
      body: body,
      ruleIds: normalizeIds(event.ruleIds, LIMITS.RULE_IDS),
      kbIds: normalizeIds(event.kbIds, LIMITS.KB_IDS),
      phase: cleanText(event.phase, 16),
      reason: cleanText(event.reason, LIMITS.REASON)
    }
  };
}

// ---------------------------------------------------------------------------
// 系统快照：与首页同口径（首页用 rules.evaluate 的返回结构），发布即冻结
// ---------------------------------------------------------------------------
function toneOf(level) {
  return level === 'red' ? 'red' : (level === 'amber' ? 'amber' : '');
}

// 指标顺序/单位与 pages/index/index.js 的 metrics 保持一致，S3 直接渲染，避免两处漂移
function metricsOf(f) {
  if (!f) return [];
  var hyd = f.hydration || {};
  var pro = f.protein || {};
  var tot = f.totals || {};
  var rec = f.recovery || {};
  var sleepHours = rec.sleepHours;
  var sleepLow = sleepHours !== null && sleepHours !== undefined && sleepHours < (f.phase === 'peak' ? 7 : 6.5);
  var hydValue = hyd.mode === 'plan' ? hyd.planRate : hyd.pct;
  return [
    { label: '晨重', value: f.bw || '--', unit: 'kg', tone: '' },
    { label: '训练脱水', value: hydValue === null || hydValue === undefined ? '--' : hydValue, unit: hyd.mode === 'plan' ? '% 计划' : '%', tone: toneOf(hyd.level) },
    { label: '蛋白', value: pro.actualG === null || pro.actualG === undefined ? 0 : pro.actualG, unit: '/ ' + (pro.targetG || '--') + 'g', tone: toneOf(pro.level) },
    { label: '摄入', value: tot.kcal || 0, unit: 'kcal', tone: '' },
    { label: '酸痛峰', value: rec.sorenessMax === null || rec.sorenessMax === undefined ? '--' : rec.sorenessMax, unit: '/10', tone: toneOf(rec.level) },
    { label: '睡眠', value: sleepHours === null || sleepHours === undefined ? '--' : sleepHours, unit: 'h', tone: sleepLow ? 'amber' : '' }
  ];
}

function goalSnapshot(f, meta) {
  meta = meta || {};
  return {
    matrixVersion: (f && f.goalMatrixVersion) || '',
    plan: (f && f.goalPlan) || null,
    adherence: (f && f.goalAdherence) || null,
    blockers: (f && f.goalBlockers) || [],
    requested: Array.isArray(meta.goals) ? meta.goals.slice() : [],
    effectiveDate: meta.goalEffectiveDate || '',
    source: meta.goalSource || ''
  };
}

function snapshotFromFeedback(f, rulesVersion, capturedAt, meta) {
  var stamp = capturedAt || new Date().toISOString();
  if (!f) {
    return {
      hasLog: false, capturedAt: stamp, rulesVersion: rulesVersion || '',
      score: null, level: '--', levelTone: 'info', headline: '当日没有训练记录',
      phase: '', phaseLabel: '', phaseGoal: '', metrics: [],
      alerts: [], tips: [], missingRequired: [], suppressedCount: 0, sRPE: null,
      goal: goalSnapshot(null, meta)
    };
  }
  var alerts = (f.alerts || []).slice(0, LIMITS.SNAPSHOT_ALERTS).map(function (a) {
    return {
      ruleId: a.ruleId || '',
      ruleName: a.ruleName || '',
      code: a.code || '',
      level: a.level || 'info',
      title: a.title || '',
      text: a.text || '',
      evidence: a.evidence || '',
      kb: (a.kb || []).slice(),
      reviewStatus: a.reviewStatus || 'active',
      requiresFollowUp: !!a.requiresFollowUp,
      sources: (a.sources || []).slice(0, LIMITS.SNAPSHOT_SOURCES).map(function (s) {
        return {
          sourceType: s.sourceType || '',
          year: s.year || null,
          anchor: s.anchor || '',
          doi: s.doi || '',
          citation: s.citation || ''
        };
      })
    };
  });
  var tips = (f.tips || []).slice(0, LIMITS.TIPS).map(function (t) {
    return { id: t.id || '', title: t.title || '', body: cleanText(t.body, LIMITS.TIP_BODY), cat: t.cat || '' };
  });
  return {
    hasLog: true, capturedAt: stamp, rulesVersion: rulesVersion || '',
    score: f.score,
    level: f.level,
    levelTone: f.levelTone,
    headline: f.headline || '',
    phase: f.phase || '',
    phaseLabel: f.phaseLabel || '',
    phaseGoal: (f.phaseProfile && f.phaseProfile.goal) || '',
    metrics: metricsOf(f),
    alerts: alerts,
    tips: tips,
    missingRequired: (f.missingRequired || []).slice(0, 8),
    suppressedCount: (f.suppressed || []).length,
    sRPE: f.sRPE === undefined ? null : f.sRPE,
    goal: goalSnapshot(f, meta)
  };
}

// FNV-1a 32 位：只用于判断"快照是否被改过"，不做安全用途
function snapshotHash(snapshot) {
  var s = JSON.stringify(snapshot || {});
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return 'fnv1a-' + (h >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// 留痕 / 通知 / 出参
// ---------------------------------------------------------------------------
function buildInboxDoc(opt) {
  opt = opt || {};
  var stamp = opt.createdAt || new Date().toISOString();
  return {
    owner: opt.athleteId,
    athleteId: opt.athleteId,
    type: opt.type || 'advice',
    level: 'info',
    title: opt.title || ((opt.coachName || '营养师') + ' ' + (opt.date || '') + ' 的营养建议'),
    body: previewText(opt.body),
    date: opt.date || '',
    adviceId: opt.adviceId || '',
    read: false,
    createdAt: stamp
  };
}

function buildRevisionDoc(opt) {
  opt = opt || {};
  return {
    adviceId: opt.adviceId || '',
    version: opt.version || 1,
    action: opt.action || 'update',
    body: cleanText(opt.body, LIMITS.BODY),
    ruleIds: normalizeIds(opt.ruleIds, LIMITS.RULE_IDS),
    kbIds: normalizeIds(opt.kbIds, LIMITS.KB_IDS),
    systemSnapshot: opt.systemSnapshot || null,
    snapshotHash: opt.snapshotHash || '',
    operatorOpenid: opt.operatorOpenid || '',
    operatorName: opt.operatorName || '营养师',
    reason: cleanText(opt.reason, LIMITS.REASON),
    createdAt: opt.createdAt || new Date().toISOString()
  };
}

// 拳王可见字段：不暴露 coachOpenid / logUpdatedAt / snapshotHash 等内部字段
function publicAdvice(doc) {
  if (!doc) return null;
  return {
    id: doc._id || doc.id || '',
    date: doc.date || '',
    dateFrom: doc.dateFrom || doc.date || '',
    dateTo: doc.dateTo || doc.date || '',
    scope: doc.scope || SCOPE.DAY,
    phase: doc.phase || '',
    status: doc.status || '',
    body: doc.body || '',
    ruleIds: (doc.ruleIds || []).slice(),
    kbIds: (doc.kbIds || []).slice(),
    coachName: doc.coachName || '营养师',
    systemSnapshot: doc.systemSnapshot || null,
    rulesVersion: doc.rulesVersion || '',
    publishedAt: doc.publishedAt || null,
    revokedAt: doc.revokedAt || null,
    editedAfterPublish: !!doc.editedAfterPublish,
    version: doc.version || 0,
    updatedAt: doc.updatedAt || ''
  };
}

// 营养师可见字段：比拳王多归属与留痕信息
function reviewerAdvice(doc) {
  if (!doc) return null;
  var out = publicAdvice(doc);
  out.athleteId = doc.athleteId || '';
  out.coachOpenid = doc.coachOpenid || '';
  out.logUpdatedAt = doc.logUpdatedAt || '';
  out.snapshotHash = doc.snapshotHash || '';
  return out;
}

module.exports = {
  STATUS: STATUS,
  SCOPE: SCOPE,
  TRANSITIONS: TRANSITIONS,
  ACTIONS: ACTIONS,
  ACTIONS_ENABLED: ACTIONS_ENABLED,
  LIMITS: LIMITS,
  todayStr: todayStr,
  isDate: isDate,
  pad2: pad2,
  normalizeScope: normalizeScope,
  resolveWindow: resolveWindow,
  cleanText: cleanText,
  previewText: previewText,
  normalizeIds: normalizeIds,
  normalizeDraftInput: normalizeDraftInput,
  canTransition: canTransition,
  publishCheck: publishCheck,
  updateCheck: updateCheck,
  revokeCheck: revokeCheck,
  normalizeUpdateInput: normalizeUpdateInput,
  metricsOf: metricsOf,
  snapshotFromFeedback: snapshotFromFeedback,
  snapshotHash: snapshotHash,
  buildInboxDoc: buildInboxDoc,
  buildRevisionDoc: buildRevisionDoc,
  publicAdvice: publicAdvice,
  reviewerAdvice: reviewerAdvice
};
