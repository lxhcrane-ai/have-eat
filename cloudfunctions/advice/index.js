// 营养师审阅建议：唯一入口（getContext / get / list / saveDraft / publish）。
// 权限全部在服务端判定；状态机、字段、快照结构、留痕与通知结构见 lib/core.js（S1 冻结）。
// revoke / update 在 S5 开放，S1 只保留动作名，调用时明确返回未启用。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const core = require('./lib/core.js');
const rules = require('./lib/rules.js');
const weekly = require('./lib/weekly.js');
const submsg = require('./lib/submsg.js');

const RULES_VERSION = rules.RULES_VERSION || 'v3.0';
const COLL = {
  ADVICE: 'advice',
  REVISIONS: 'advice_revisions',
  USERS: 'users',
  LOGS: 'logs',
  INBOX: 'inbox',
  REVIEWS: 'rule_reviews'
};

function nowIso() { return new Date().toISOString(); }

async function userOf(openid) {
  try {
    const u = await db.collection(COLL.USERS).where({ _openid: openid }).limit(1).get();
    return u.data[0] || null;
  } catch (e) { return null; }
}

async function reviewOverrides() {
  try {
    const r = await db.collection(COLL.REVIEWS).limit(100).get();
    const map = {};
    r.data.forEach(function (x) { map[x.ruleId] = x.status; });
    return map;
  } catch (e) { return {}; }
}

// 归属校验：只有绑定了该拳王的营养师才能读/写其审阅上下文与建议
async function canReview(coachOpenid, athleteId) {
  if (!coachOpenid || !athleteId) return false;
  try {
    const r = await db.collection(COLL.USERS)
      .where({ _openid: athleteId, coachOpenid: coachOpenid, role: 'athlete' })
      .limit(1).get();
    return r.data.length > 0;
  } catch (e) { return false; }
}

async function morningWeights(athleteId, date) {
  try {
    const r = await db.collection(COLL.LOGS).where({ athleteId: athleteId })
      .orderBy('date', 'desc').limit(21).field({ date: true, 'payload.weights': true }).get();
    return r.data.map(function (d) {
      return { date: d.date, kg: d.payload && d.payload.weights && d.payload.weights.morning && d.payload.weights.morning.kg };
    }).filter(function (p) {
      return p.kg !== null && p.kg !== undefined && (!date || p.date <= date);
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  } catch (e) { return []; }
}

// refeed 只读近 7 日窗口，用于给 evaluate 传 ctx.refeed；没有计划天数时 deriveRefeed 返回 null。
async function recentLogs(athleteId, date) {
  try {
    const r = await db.collection(COLL.LOGS).where({ athleteId: athleteId })
      .orderBy('date', 'desc').limit(14).get();
    return r.data.map(function (d) { return d.payload || {}; })
      .filter(function (l) { return l.date && (!date || l.date <= date); });
  } catch (e) { return []; }
}

async function logOf(athleteId, date) {
  try {
    const r = await db.collection(COLL.LOGS).where({ athleteId: athleteId, date: date }).limit(1).get();
    return r.data[0] || null;
  } catch (e) { return null; }
}

async function liveSnapshot(athleteId, date, refeedDays) {
  const athlete = await userOf(athleteId);
  const profile = (athlete && athlete.profile) || {};
  const goalMeta = {
    goals: profile.goals || [],
    goalEffectiveDate: profile.goalEffectiveDate || '',
    goalSource: profile.goalSource || ''
  };
  const log = await logOf(athleteId, date);
  if (!log) return { log: null, snapshot: core.snapshotFromFeedback(null, RULES_VERSION, nowIso(), goalMeta) };
  const pts = await morningWeights(athleteId, date);
  const refeed = weekly.deriveRefeed({
    logs: await recentLogs(athleteId, date),
    endDate: date,
    days: 7,
    profile: profile,
    // 优先级：event.refeedDays → profile.refeedDays → null（缺失时组件跳过重归一）
    plannedDays: refeedDays !== undefined ? refeedDays
      : (profile.refeedDays !== undefined ? profile.refeedDays : null)
  });
  const f = rules.evaluate(log.payload, {
    profile: profile,
    recentMorningWeights: pts,
    ruleReviews: await reviewOverrides(),
    refeed: refeed
  });
  return { log: log, snapshot: core.snapshotFromFeedback(f, RULES_VERSION, nowIso(), goalMeta) };
}

// 单条读取：兼容 doc().get() 在不同 SDK 版本返回对象或数组
function unwrapDoc(res) {
  if (!res || !res.data) return null;
  return Array.isArray(res.data) ? (res.data[0] || null) : res.data;
}

async function adviceById(id) {
  try {
    return unwrapDoc(await db.collection(COLL.ADVICE).doc(id).get());
  } catch (e) { return null; }
}

async function adviceByWindow(athleteId, date, scope) {
  try {
    const r = await db.collection(COLL.ADVICE)
      .where({ athleteId: athleteId, date: date, scope: scope || core.SCOPE.DAY })
      .limit(1).get();
    return r.data[0] || null;
  } catch (e) { return null; }
}

// 读单日窗口：用 dateFrom <= day <= dateTo 覆盖单日与区间两种建议
async function adviceCovering(athleteId, day, statuses) {
  try {
    const r = await db.collection(COLL.ADVICE)
      .where({
        athleteId: athleteId,
        status: _.in(statuses),
        dateFrom: _.lte(day),
        dateTo: _.gte(day)
      })
      .orderBy('dateTo', 'desc').limit(1).get();
    return r.data[0] || null;
  } catch (e) { return null; }
}

function athleteView(athlete) {
  return {
    openid: (athlete && athlete._openid) || '',
    name: ((athlete && athlete.profile) || {}).name || '拳王',
    profile: (athlete && athlete.profile) || {},
    phase: (athlete && athlete.profile && athlete.profile.phase) || 'maintain'
  };
}

// ---------------------------------------------------------------------------
// 动作实现
// ---------------------------------------------------------------------------
async function getContext(openid, event) {
  const coach = await userOf(openid);
  if (!coach || coach.role !== 'coach') return { ok: false, error: '仅营养师可打开审阅' };

  const athleteId = core.cleanText(event.athleteId, 64);
  if (!athleteId) return { ok: false, error: '缺少 athleteId' };
  if (!(await canReview(openid, athleteId))) return { ok: false, error: '该拳王未绑定到你' };

  const w = core.resolveWindow(event);
  if (!w.ok) return w;

  const athlete = await userOf(athleteId);
  const live = await liveSnapshot(athleteId, w.date, event.refeedDays);
  const advice = await adviceByWindow(athleteId, w.date, w.scope);

  return {
    ok: true,
    role: 'coach',
    rulesVersion: RULES_VERSION,
    window: w,
    athlete: athleteView(athlete),
    log: live.log ? { id: live.log._id, date: live.log.date, payload: live.log.payload, updatedAt: live.log.updatedAt || '' } : null,
    systemSnapshot: live.snapshot,
    systemSnapshotHash: core.snapshotHash(live.snapshot),
    // 已发布建议里带的是冻结快照；草稿带的是保存时的预览快照
    advice: core.reviewerAdvice(advice)
  };
}

async function get(openid, event) {
  const me = await userOf(openid);
  const isCoach = !!(me && me.role === 'coach');
  const id = core.cleanText(event.id, 64);

  if (id) {
    const doc = await adviceById(id);
    if (!doc) return { ok: false, error: '建议不存在' };
    const mine = doc.athleteId === openid;
    if (!mine && !(isCoach && await canReview(openid, doc.athleteId))) {
      return { ok: false, error: '无权查看该建议' };
    }
    if (doc.status === core.STATUS.DRAFT && !isCoach) return { ok: false, error: '建议尚未发布' };
    return { ok: true, advice: isCoach ? core.reviewerAdvice(doc) : core.publicAdvice(doc) };
  }

  const w = core.resolveWindow(event.date ? event : { date: event.date || core.todayStr() });
  if (!w.ok) return w;

  let athleteId = openid;
  if (isCoach) {
    athleteId = core.cleanText(event.athleteId, 64);
    if (!athleteId) return { ok: false, error: '缺少 athleteId' };
    if (!(await canReview(openid, athleteId))) return { ok: false, error: '该拳王未绑定到你' };
  }
  const statuses = isCoach ? [core.STATUS.DRAFT, core.STATUS.PUBLISHED, core.STATUS.REVOKED]
    : [core.STATUS.PUBLISHED, core.STATUS.REVOKED];
  const doc = await adviceCovering(athleteId, w.date, statuses);
  return {
    ok: true,
    rulesVersion: RULES_VERSION,
    advice: isCoach ? core.reviewerAdvice(doc) : core.publicAdvice(doc)
  };
}

async function list(openid, event) {
  const me = await userOf(openid);
  const isCoach = !!(me && me.role === 'coach');
  const limit = Math.min(Math.max(Number(event.limit) || 20, 1), core.LIMITS.LIST_LIMIT);

  let athleteId = core.cleanText(event.athleteId, 64);
  if (!isCoach) {
    if (athleteId && athleteId !== openid) return { ok: false, error: '无权查看他人建议' };
    athleteId = openid;
  } else if (athleteId) {
    if (!(await canReview(openid, athleteId))) return { ok: false, error: '该拳王未绑定到你' };
  }

  const statuses = isCoach
    ? (event.includeDraft ? [core.STATUS.DRAFT, core.STATUS.PUBLISHED, core.STATUS.REVOKED]
      : [core.STATUS.PUBLISHED, core.STATUS.REVOKED])
    : [core.STATUS.PUBLISHED, core.STATUS.REVOKED];

  const where = { status: _.in(statuses) };
  if (isCoach && !athleteId) where.coachOpenid = openid;
  else where.athleteId = athleteId;

  const before = core.cleanText(event.before, 32);
  if (core.isDate(before)) where.date = _.lt(before);

  let rows = [];
  try {
    const r = await db.collection(COLL.ADVICE).where(where)
      .orderBy('date', 'desc').limit(limit).get();
    rows = r.data || [];
  } catch (e) { rows = []; }

  const items = rows.map(function (d) { return isCoach ? core.reviewerAdvice(d) : core.publicAdvice(d); });
  return {
    ok: true,
    rulesVersion: RULES_VERSION,
    items: items,
    nextBefore: rows.length === limit ? rows[rows.length - 1].date : ''
  };
}

async function saveDraft(openid, event) {
  const coach = await userOf(openid);
  if (!coach || coach.role !== 'coach') return { ok: false, error: '仅营养师可保存建议' };

  const norm = core.normalizeDraftInput(event);
  if (!norm.ok) return norm;
  const data = norm.data;
  if (!(await canReview(openid, data.athleteId))) return { ok: false, error: '该拳王未绑定到你' };

  const existing = await adviceByWindow(data.athleteId, data.date, data.scope);
  if (existing && existing.status !== core.STATUS.DRAFT) {
    return { ok: false, error: '该日期已有已发布建议，请在已发布建议上更新', code: 'USE_UPDATE' };
  }

  const athlete = await userOf(data.athleteId);
  const profile = (athlete && athlete.profile) || {};
  const live = await liveSnapshot(data.athleteId, data.date);
  const stamp = nowIso();
  const coachName = (coach.profile && coach.profile.name) || '营养师';
  const phase = rules.resolvePhase(data.phase || profile.phase);

  const doc = {
    athleteId: data.athleteId,
    coachOpenid: openid,
    coachName: coachName,
    date: data.date,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    scope: data.scope,
    phase: phase,
    status: core.STATUS.DRAFT,
    systemSnapshot: live.snapshot,
    rulesVersion: RULES_VERSION,
    snapshotHash: core.snapshotHash(live.snapshot),
    body: data.body,
    ruleIds: data.ruleIds,
    kbIds: data.kbIds,
    logUpdatedAt: (live.log && live.log.updatedAt) || data.logUpdatedAt || '',
    publishedAt: null,
    revokedAt: null,
    editedAfterPublish: false,
    version: 0,
    createdAt: existing ? existing.createdAt : stamp,
    updatedAt: stamp
  };

  let saved = null;
  try {
    if (existing) {
      await db.collection(COLL.ADVICE).doc(existing._id).update({ data: doc });
      saved = Object.assign({}, existing, doc, { _id: existing._id });
    } else {
      const added = await db.collection(COLL.ADVICE).add({ data: doc });
      saved = Object.assign({}, doc, { _id: added._id });
    }
  } catch (e) {
    return { ok: false, error: '请先在云开发控制台创建 advice 集合（唯一索引 athleteId+date+scope）' };
  }
  return { ok: true, advice: core.reviewerAdvice(saved) };
}

async function publish(openid, event) {
  const coach = await userOf(openid);
  if (!coach || coach.role !== 'coach') return { ok: false, error: '仅营养师可发布建议' };

  let doc = null;
  if (event.adviceId) {
    doc = await adviceById(core.cleanText(event.adviceId, 64));
    if (!doc) return { ok: false, error: '建议不存在' };
    if (doc.coachOpenid !== openid) return { ok: false, error: '无权发布该建议' };
    if (!(await canReview(openid, doc.athleteId))) return { ok: false, error: '该拳王未绑定到你' };
  } else {
    const athleteId = core.cleanText(event.athleteId, 64);
    const w = core.resolveWindow(event);
    if (!w.ok) return w;
    if (!athleteId) return { ok: false, error: '缺少 athleteId' };
    if (!(await canReview(openid, athleteId))) return { ok: false, error: '该拳王未绑定到你' };
    doc = await adviceByWindow(athleteId, w.date, w.scope);
  }

  // 单日窗口命中他人建议时同样拒绝，避免借 athleteId+date 改他人文档
  if (doc && doc.coachOpenid !== openid) return { ok: false, error: '无权操作该建议' };

  // 已发布文档走与 update 相同的路径，避免 publish / update 两套写法
  if (doc && doc.status === core.STATUS.PUBLISHED) {
    const norm = core.normalizeUpdateInput({
      body: event.body || doc.body,
      reason: event.reason || '通过发布入口更新',
      ruleIds: event.ruleIds !== undefined ? event.ruleIds : doc.ruleIds,
      kbIds: event.kbIds !== undefined ? event.kbIds : doc.kbIds,
      phase: event.phase || doc.phase
    });
    if (!norm.ok) return norm;
    return await applyUpdate(openid, coach, doc, norm.data);
  }

  const check = core.publishCheck(doc);
  if (!check.ok) return check;

  // 发布时以当前日志重算快照并冻结，之后首页只读快照
  const live = await liveSnapshot(doc.athleteId, doc.date);
  const stamp = nowIso();
  const snapshot = live.snapshot;
  const hash = core.snapshotHash(snapshot);
  const coachName = (coach.profile && coach.profile.name) || '营养师';
  const athlete = await userOf(doc.athleteId);
  const phase = rules.resolvePhase(doc.phase || ((athlete && athlete.profile && athlete.profile.phase) || 'maintain'));
  const version = (Number(doc.version) || 0) + 1;

  // 先留痕：advice_revisions 写失败则中止发布，避免出现无痕迹的已发布建议
  try {
    await db.collection(COLL.REVISIONS).add({
      data: core.buildRevisionDoc({
        adviceId: doc._id,
        version: version,
        body: doc.body,
        ruleIds: doc.ruleIds,
        kbIds: doc.kbIds,
        systemSnapshot: snapshot,
        snapshotHash: hash,
        operatorOpenid: openid,
        operatorName: coachName,
        reason: '首次发布',
        action: 'publish',
        createdAt: stamp
      })
    });
  } catch (e) {
    return { ok: false, error: '请先在云开发控制台创建 advice_revisions 集合' };
  }

  try {
    await db.collection(COLL.ADVICE).doc(doc._id).update({
      data: {
        status: core.STATUS.PUBLISHED,
        systemSnapshot: snapshot,
        rulesVersion: RULES_VERSION,
        snapshotHash: hash,
        phase: phase,
        coachName: coachName,
        logUpdatedAt: (live.log && live.log.updatedAt) || '',
        version: version,
        publishedAt: stamp,
        revokedAt: null,
        editedAfterPublish: false,
        updatedAt: stamp
      }
    });
  } catch (e) {
    return { ok: false, error: '发布失败，请检查 advice 集合' };
  }

  let notified = false;
  try {
    await db.collection(COLL.INBOX).add({
      data: core.buildInboxDoc({
        athleteId: doc.athleteId,
        coachName: coachName,
        date: doc.date,
        adviceId: doc._id,
        body: doc.body,
        createdAt: stamp
      })
    });
    notified = true;
  } catch (e) { notified = false; }

  // 发布建议 -> 拳王订阅消息；失败不影响发布结果与站内收件箱
  await submsg.notify(doc.athleteId, 'advicePublish', {
    page: 'pages/index/index',
    name: coachName,
    summary: doc.date + ' 营养建议已发布',
    time: stamp
  });

  const saved = Object.assign({}, doc, {
    status: core.STATUS.PUBLISHED,
    systemSnapshot: snapshot,
    rulesVersion: RULES_VERSION,
    snapshotHash: hash,
    phase: phase,
    coachName: coachName,
    version: version,
    publishedAt: stamp,
    revokedAt: null,
    editedAfterPublish: false,
    updatedAt: stamp
  });
  return { ok: true, notified: notified, advice: core.reviewerAdvice(saved) };
}

// 按 adviceId 或 athleteId+窗口定位，并做归属校验（update / revoke 共用）
async function locateForCoach(openid, event) {
  const id = core.cleanText(event && event.adviceId, 64);
  if (id) {
    const doc = await adviceById(id);
    if (!doc) return { ok: false, error: '建议不存在' };
    if (doc.coachOpenid !== openid) return { ok: false, error: '无权操作该建议' };
    if (!(await canReview(openid, doc.athleteId))) return { ok: false, error: '该拳王未绑定到你' };
    return { ok: true, doc: doc };
  }
  const athleteId = core.cleanText(event && event.athleteId, 64);
  const w = core.resolveWindow(event || {});
  if (!w.ok) return w;
  if (!athleteId) return { ok: false, error: '缺少 athleteId' };
  if (!(await canReview(openid, athleteId))) return { ok: false, error: '该拳王未绑定到你' };
  const doc = await adviceByWindow(athleteId, w.date, w.scope);
  if (!doc) return { ok: false, error: '建议不存在' };
  if (doc.coachOpenid !== openid) return { ok: false, error: '无权操作该建议' };
  return { ok: true, doc: doc };
}

// 已发布建议更新：版本 +1，revisions 记录“修改前”正文与引用 + 原因，快照服务端重算
async function applyUpdate(openid, coach, doc, data) {
  const live = await liveSnapshot(doc.athleteId, doc.date);
  const stamp = nowIso();
  const snapshot = live.snapshot;
  const hash = core.snapshotHash(snapshot);
  const coachName = (coach.profile && coach.profile.name) || doc.coachName || '营养师';
  const athlete = await userOf(doc.athleteId);
  const phase = rules.resolvePhase(data.phase || doc.phase || ((athlete && athlete.profile && athlete.profile.phase) || 'maintain'));
  const version = (Number(doc.version) || 0) + 1;
  const reason = data.reason || '营养师修改';

  // 先留痕：修改前的正文与引用随 revision 落库，revision 失败则中止更新
  try {
    await db.collection(COLL.REVISIONS).add({
      data: core.buildRevisionDoc({
        adviceId: doc._id,
        version: version,
        action: 'update',
        body: doc.body,
        ruleIds: doc.ruleIds,
        kbIds: doc.kbIds,
        systemSnapshot: doc.systemSnapshot,
        snapshotHash: doc.snapshotHash || core.snapshotHash(doc.systemSnapshot),
        operatorOpenid: openid,
        operatorName: coachName,
        reason: reason,
        createdAt: stamp
      })
    });
  } catch (e) {
    return { ok: false, error: '请先在云开发控制台创建 advice_revisions 集合' };
  }

  try {
    await db.collection(COLL.ADVICE).doc(doc._id).update({
      data: {
        body: data.body,
        ruleIds: data.ruleIds,
        kbIds: data.kbIds,
        phase: phase,
        systemSnapshot: snapshot,
        rulesVersion: RULES_VERSION,
        snapshotHash: hash,
        coachName: coachName,
        logUpdatedAt: (live.log && live.log.updatedAt) || '',
        version: version,
        editedAfterPublish: true,
        publishedAt: doc.publishedAt || stamp,
        revokedAt: null,
        updatedAt: stamp
      }
    });
  } catch (e) {
    return { ok: false, error: '更新失败，请检查 advice 集合' };
  }

  let notified = false;
  try {
    await db.collection(COLL.INBOX).add({
      data: core.buildInboxDoc({
        athleteId: doc.athleteId,
        coachName: coachName,
        date: doc.date,
        adviceId: doc._id,
        body: data.body,
        type: 'advice_update',
        title: coachName + ' 更新了 ' + doc.date + ' 的营养建议',
        createdAt: stamp
      })
    });
    notified = true;
  } catch (e) { notified = false; }

  // 建议更新 -> 拳王订阅消息（与发布共用“变更”模板）
  await submsg.notify(doc.athleteId, 'adviceChange', {
    page: 'pages/index/index',
    name: coachName,
    summary: doc.date + ' 营养建议已更新',
    time: stamp
  });

  const saved = Object.assign({}, doc, {
    body: data.body,
    ruleIds: data.ruleIds,
    kbIds: data.kbIds,
    phase: phase,
    systemSnapshot: snapshot,
    rulesVersion: RULES_VERSION,
    snapshotHash: hash,
    coachName: coachName,
    version: version,
    editedAfterPublish: true,
    publishedAt: doc.publishedAt || stamp,
    revokedAt: null,
    updatedAt: stamp
  });
  return { ok: true, notified: notified, advice: core.reviewerAdvice(saved) };
}

async function update(openid, event) {
  const coach = await userOf(openid);
  if (!coach || coach.role !== 'coach') return { ok: false, error: '仅营养师可修改建议' };

  const found = await locateForCoach(openid, event);
  if (!found.ok) return found;
  const doc = found.doc;

  const norm = core.normalizeUpdateInput({
    body: (event && event.body) !== undefined ? event.body : doc.body,
    reason: event && event.reason,
    ruleIds: event && event.ruleIds !== undefined ? event.ruleIds : doc.ruleIds,
    kbIds: event && event.kbIds !== undefined ? event.kbIds : doc.kbIds,
    phase: (event && event.phase) || doc.phase
  });
  if (!norm.ok) return norm;

  const check = core.updateCheck(doc, norm.data.body);
  if (!check.ok) return check;
  return await applyUpdate(openid, coach, doc, norm.data);
}

async function revoke(openid, event) {
  const coach = await userOf(openid);
  if (!coach || coach.role !== 'coach') return { ok: false, error: '仅营养师可撤回建议' };

  const found = await locateForCoach(openid, event);
  if (!found.ok) return found;
  const doc = found.doc;

  const check = core.revokeCheck(doc);
  if (!check.ok) return check;
  // 重复撤回幂等：不再写 revision / inbox，直接返回当前状态
  if (check.already) {
    return { ok: true, already: true, notified: false, advice: core.reviewerAdvice(doc) };
  }

  const stamp = nowIso();
  const coachName = (coach.profile && coach.profile.name) || doc.coachName || '营养师';
  const reason = core.cleanText(event && event.reason, core.LIMITS.REASON) || '营养师撤回';

  try {
    await db.collection(COLL.REVISIONS).add({
      data: core.buildRevisionDoc({
        adviceId: doc._id,
        version: doc.version || 1,
        action: 'revoke',
        body: doc.body,
        ruleIds: doc.ruleIds,
        kbIds: doc.kbIds,
        systemSnapshot: doc.systemSnapshot,
        snapshotHash: doc.snapshotHash || core.snapshotHash(doc.systemSnapshot),
        operatorOpenid: openid,
        operatorName: coachName,
        reason: reason,
        createdAt: stamp
      })
    });
  } catch (e) {
    return { ok: false, error: '请先在云开发控制台创建 advice_revisions 集合' };
  }

  try {
    await db.collection(COLL.ADVICE).doc(doc._id).update({
      data: {
        status: core.STATUS.REVOKED,
        revokedAt: stamp,
        updatedAt: stamp
      }
    });
  } catch (e) {
    return { ok: false, error: '撤回失败，请检查 advice 集合' };
  }

  let notified = false;
  try {
    await db.collection(COLL.INBOX).add({
      data: core.buildInboxDoc({
        athleteId: doc.athleteId,
        coachName: coachName,
        date: doc.date,
        adviceId: doc._id,
        body: doc.body,
        type: 'advice_revoke',
        title: coachName + ' 撤回了 ' + doc.date + ' 的营养建议',
        createdAt: stamp
      })
    });
    notified = true;
  } catch (e) { notified = false; }

  // 建议撤回 -> 拳王订阅消息（与更新共用“变更”模板）
  await submsg.notify(doc.athleteId, 'adviceChange', {
    page: 'pages/index/index',
    name: coachName,
    summary: doc.date + ' 营养建议已撤回',
    time: stamp
  });

  const saved = Object.assign({}, doc, {
    status: core.STATUS.REVOKED,
    revokedAt: stamp,
    updatedAt: stamp
  });
  return { ok: true, notified: notified, advice: core.reviewerAdvice(saved) };
}

// ---------------------------------------------------------------------------
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = (event && event.action) || 'get';

  try {
    if (core.ACTIONS.indexOf(action) < 0) {
      return { ok: false, error: '未知动作', actions: core.ACTIONS };
    }
    if (core.ACTIONS_ENABLED.indexOf(action) < 0) {
      return { ok: false, error: '该操作将在后续版本开放', code: 'NOT_ENABLED', action: action };
    }
    if (action === 'getContext') return await getContext(OPENID, event);
    if (action === 'get') return await get(OPENID, event);
    if (action === 'list') return await list(OPENID, event);
    if (action === 'saveDraft') return await saveDraft(OPENID, event);
    if (action === 'update') return await update(OPENID, event);
    if (action === 'revoke') return await revoke(OPENID, event);
    return await publish(OPENID, event);
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'advice 服务异常' };
  }
};
