const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const crypto = require('crypto');
const rules = require('./lib/rules.js');
const fu = require('./lib/followup.js');
const GOALS = require('./lib/goals.js');
const REG = require('./lib/ruleRegistry.js');

// 营养师后台唯一入口：阶段设置、跟进队列、规则复核。
// 权限全部在服务端判定：写操作只允许 role='coach'，且只能操作自己绑定的拳王。

async function userOf(openid) {
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    return u.data[0] || null;
  } catch (e) { return null; }
}

function admissionOf(user) {
  if (!user) return 'pending';
  if (user.admission === 'active' || user.admission === 'pending' || user.admission === 'blocked') return user.admission;
  if (user.role === 'coach') return 'active';
  if (user.coachOpenid || user.coachCode) return 'active';
  return 'pending';
}

async function reviewMap() {
  try {
    const r = await db.collection('rule_reviews').limit(100).get();
    const map = {};
    r.data.forEach(function (x) { map[x.ruleId] = x.status; });
    return map;
  } catch (e) {
    return {};   // 集合不存在时用登记表默认值
  }
}

async function assertCoach(openid) {
  const u = await userOf(openid);
  return !!(u && u.role === 'coach');
}

async function myAthletes(coachOpenid) {
  const r = await db.collection('users').where({ coachOpenid: coachOpenid, role: 'athlete' }).limit(50).get();
  return r.data || [];
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() {
  // 云函数时区是 UTC，按东八区折算日期，避免晚上 8 点后算成"昨天"
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// 一次性配对码：去掉易混淆字符（0/O/1/I），6 位、30 分钟有效
const PAIR_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomPairCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += PAIR_CHARS[bytes[i] % PAIR_CHARS.length];
  return out;
}

async function morningWeights(athleteId, date) {
  try {
    const r = await db.collection('logs').where({ athleteId: athleteId })
      .orderBy('date', 'desc').limit(21).field({ date: true, 'payload.weights': true }).get();
    return r.data.map(function (d) {
      return { date: d.date, kg: d.payload && d.payload.weights && d.payload.weights.morning && d.payload.weights.morning.kg };
    }).filter(function (p) { return p.kg !== null && p.kg !== undefined && p.date <= date; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  } catch (e) { return []; }
}

async function historyOf(coachOpenid, date) {
  const from = fu.shiftDate(date, -8);
  try {
    const r = await db.collection('followups')
      .where({ nutritionistId: coachOpenid, date: _.gte(from).and(_.lt(date)) })
      .limit(200).get();
    return r.data || [];
  } catch (e) { return []; }
}

// ---------- 生成队列 ----------
async function generate(coachOpenid, date) {
  const athletes = await myAthletes(coachOpenid);
  const reviews = await reviewMap();
  const history = await historyOf(coachOpenid, date);
  const inputs = [];

  for (const a of athletes) {
    let log = null;
    try {
      const r = await db.collection('logs').where({ athleteId: a._openid, date: date }).limit(1).get();
      log = r.data[0] ? r.data[0].payload : null;
    } catch (e) { log = null; }
    if (!log) continue;
    const pts = await morningWeights(a._openid, date);
    inputs.push({
      athleteId: a._openid,
      name: (a.profile && a.profile.name) || '拳王',
      phase: (a.profile && a.profile.phase) || 'maintain',
      profile: a.profile || {},
      log: log,
      recentMorningWeights: pts,
      feedback: rules.evaluate(log, { profile: a.profile || {}, recentMorningWeights: pts, ruleReviews: reviews })
    });
  }

  const queue = fu.generateQueue({ date: date, athletes: inputs, history: history });

  // 落库：同 id 只更新，已 confirmed / dismissed 的不回滚
  for (const item of queue.items) {
    const doc = Object.assign({}, item, {
      nutritionistId: coachOpenid,
      itemId: item.id
    });
    delete doc.id;
    delete doc.athletePhase;
    try {
      const ex = await db.collection('followups').where({ itemId: item.id }).limit(1).get();
      if (ex.data.length) {
        const cur = ex.data[0];
        // 已稍后 / 已确认 / 已忽略都不覆盖：否则重新生成会把“稍后”翻回待办
        if (cur.status !== 'pending') continue;
        await db.collection('followups').doc(cur._id).update({
          data: Object.assign({}, doc, { createdAt: cur.createdAt, status: 'pending', nutritionistNote: cur.nutritionistNote || '' })
        });
      } else {
        await db.collection('followups').add({ data: doc });
      }
    } catch (e) {
      // 单个写入失败不影响整体返回（离线/集合未建时会走到这里）
    }
  }
  return queue;
}

// 读取某天的队列：当天全部项 + 已到期（nextReminderDate <= date）的历史 snoozed
async function loadQueueItems(coachOpenid, date) {
  const byId = {};
  function absorb(list, onlyDue) {
    (list || []).forEach(function (x) {
      if (onlyDue && (!x.nextReminderDate || x.nextReminderDate > date)) return;
      const id = x.itemId || x._id;
      if (byId[id]) return;
      x.id = id;
      byId[id] = x;
    });
  }
  try {
    const r = await db.collection('followups').where({ nutritionistId: coachOpenid, date: date }).limit(200).get();
    absorb(r.data, false);
  } catch (e) { /* 集合未建时按空队列处理 */ }
  try {
    const r = await db.collection('followups')
      .where({ nutritionistId: coachOpenid, status: 'snoozed', nextReminderDate: _.lte(date) })
      .limit(200).get();
    absorb(r.data, true);
  } catch (e) { /* 同上 */ }
  return Object.keys(byId).map(function (k) { return byId[k]; });
}

// 队列目标 chips：只读 users.profile 的 goals，按当前阶段出紧凑视图。
// 查询失败时不补任何假数据，队列项保持无 chips。
async function attachGoalChips(coachOpenid, groups, date) {
  const ids = [];
  (groups || []).forEach(function (g) {
    if (g && g.athleteId && ids.indexOf(g.athleteId) < 0) ids.push(g.athleteId);
  });
  if (!ids.length) return;

  const profileMap = {};
  try {
    const r = await db.collection('users').where({ coachOpenid: coachOpenid }).limit(100).get();
    (r.data || []).forEach(function (u) {
      if (u && u._openid && ids.indexOf(u._openid) >= 0) profileMap[u._openid] = u.profile || {};
    });
  } catch (e) {
    return;
  }

  function daysToWeigh(profile) {
    if (!profile.weighInDate) return null;
    const a = Date.parse(profile.weighInDate + 'T00:00:00Z');
    const b = Date.parse(date + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.floor((a - b) / 86400000);
  }

  (groups || []).forEach(function (g) {
    const p = profileMap[g.athleteId];
    if (!p) return;
    const ctx = { daysToWeigh: daysToWeigh(p), weighInDate: p.weighInDate, today: date };
    if (typeof p.weightKg === 'number' && typeof p.targetWeightKg === 'number' && p.targetWeightKg > 0) {
      ctx.gapPct = Math.round(((p.weightKg - p.targetWeightKg) / p.targetWeightKg) * 1000) / 10;
    }
    g.goalChips = GOALS.goalChips(p.phase || 'maintain', p.goals || [], ctx);
  });
}

async function listQueue(coachOpenid, date, skipAuto) {
  let items = await loadQueueItems(coachOpenid, date);
  let generated = false;

  // 当天还没有队列就自动生成一次（营养师打开页面即看到结果）
  if (!items.length && !skipAuto) {
    const q = await generate(coachOpenid, date);
    generated = true;
    items = await loadQueueItems(coachOpenid, date);
    // 集合未建 / 写入失败时，仍把内存里的生成结果给到页面
    if (!items.length) items = (q.items || []).map(function (i) { return Object.assign({}, i); });
  }

  const view = fu.groupForNutritionist(items, date);
  await attachGoalChips(coachOpenid, (view.groups || []).concat(view.snoozedGroups || []), date);
  return {
    ok: true, date: date, generated: generated,
    groups: view.groups, snoozedGroups: view.snoozedGroups, stats: view.stats,
    items: items
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'list';
  const date = event.date || todayStr();

  const me = await userOf(OPENID);
  if (admissionOf(me) !== 'active') {
    return { ok: false, code: 'PENDING_ADMISSION', error: '账号待准入：请输入教练提供的配对码' };
  }

  // 拳王端：只取自己次日提醒（不经过营养师后台）
  if (action === 'reminders') {
    try {
      const r = await db.collection('reminders').where({ athleteId: OPENID, date: date }).limit(20).get();
      return { ok: true, reminders: r.data || [] };
    } catch (e) { return { ok: true, reminders: [] }; }
  }

  const coach = await assertCoach(OPENID);
  if (!coach) return { ok: false, error: '需要教练/营养师身份' };

  if (action === 'list' || action === 'generate') {
    if (action === 'generate') await generate(OPENID, date);
    // generate 之后直接读库，避免 listQueue 再自动生成一次
    return await listQueue(OPENID, date, action === 'generate');
  }

  if (action === 'history') {
    try {
      const r = await db.collection('followups')
        .where({ nutritionistId: OPENID, status: _.in(['confirmed', 'dismissed']) })
        .orderBy('date', 'desc').limit(100).get();
      return { ok: true, items: r.data };
    } catch (e) { return { ok: true, items: [] }; }
  }

  if (action === 'confirm') {
    const itemId = event.itemId;
    if (!itemId) return { ok: false, error: '缺少 itemId' };
    try {
      const r = await db.collection('followups').where({ itemId: itemId, nutritionistId: OPENID }).limit(1).get();
      const item = r.data[0];
      if (!item) return { ok: false, error: '跟进项不存在' };
      if (item.status === 'confirmed') return { ok: false, error: '已确认过' };
      const next = fu.nextDateOf(item.date);
      const rem = fu.buildReminder(Object.assign({}, item, { id: item.itemId }), event.editedText || '', OPENID, next);
      rem.id = rem.id.replace(/[^\w\-:.]/g, '');
      await db.collection('reminders').add({ data: rem });
      await db.collection('followups').doc(item._id).update({
        data: {
          status: 'confirmed',
          nutritionistNote: event.note || item.nutritionistNote || '',
          nextReminderDate: next,
          updatedAt: new Date().toISOString()
        }
      });
      return { ok: true, reminder: rem, nextReminderDate: next };
    } catch (e) {
      return { ok: false, error: '写入失败（检查 reminders / followups 集合是否已创建）' };
    }
  }

  if (action === 'dismiss' || action === 'snooze') {
    const itemId = event.itemId;
    if (!itemId) return { ok: false, error: '缺少 itemId' };
    try {
      const r = await db.collection('followups').where({ itemId: itemId, nutritionistId: OPENID }).limit(1).get();
      const item = r.data[0];
      if (!item) return { ok: false, error: '跟进项不存在' };
      if (item.status === 'confirmed' || item.status === 'dismissed') {
        return { ok: false, error: '该跟进项已处理' };
      }
      const status = action === 'dismiss' ? 'dismissed' : 'snoozed';
      // “稍后”以请求日期（默认今天）为基准加天，而不是原 item.date；
      // 跨天打开队列时按旧日期加天会算成过去日期，稍后条件永远不会到期。
      const base = event.date || todayStr();
      const next = action === 'dismiss' ? '' : fu.shiftDate(base, Number(event.days) || 1);
      await db.collection('followups').doc(item._id).update({
        data: {
          status: status,
          nutritionistNote: event.reason || item.nutritionistNote || '',
          nextReminderDate: next,
          updatedAt: new Date().toISOString()
        }
      });
      return { ok: true, status: status, nextReminderDate: next };
    } catch (e) {
      return { ok: false, error: '写入失败' };
    }
  }

  // 撤销稍后：回到待办，并清空稍后日期
  if (action === 'unsnooze') {
    const itemId = event.itemId;
    if (!itemId) return { ok: false, error: '缺少 itemId' };
    try {
      const r = await db.collection('followups').where({ itemId: itemId, nutritionistId: OPENID }).limit(1).get();
      const item = r.data[0];
      if (!item) return { ok: false, error: '跟进项不存在' };
      if (item.status !== 'snoozed') return { ok: false, error: '该跟进项不在已稍后状态' };
      await db.collection('followups').doc(item._id).update({
        data: { status: 'pending', nextReminderDate: '', updatedAt: new Date().toISOString() }
      });
      return { ok: true, status: 'pending', nextReminderDate: '' };
    } catch (e) {
      return { ok: false, error: '写入失败' };
    }
  }

  // ---------- 一次性配对码（教练生成，拳王输入后绑定） ----------
  if (action === 'createPairCode') {
    try {
      let code = '';
      for (let i = 0; i < 5; i++) {
        const c = randomPairCode();
        const ex = await db.collection('pair_codes').where({ code: c, status: 'active' }).count();
        if (!ex.total) { code = c; break; }
      }
      if (!code) return { ok: false, error: '生成失败，请重试' };
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const me = await userOf(OPENID);
      await db.collection('pair_codes').add({
        data: {
          code: code,
          coachOpenid: OPENID,
          coachName: (me && me.profile && me.profile.name) || '教练',
          status: 'active',
          athleteOpenid: '',
          usedAt: '',
          expiresAt: expiresAt,
          createdAt: new Date().toISOString()
        }
      });
      return { ok: true, code: code, expiresAt: expiresAt, ttlMinutes: 30 };
    } catch (e) {
      return { ok: false, error: '写入失败（请先在云控制台创建 pair_codes 集合）' };
    }
  }

  // ---------- 阶段设置（营养师后台唯一入口） ----------
  if (action === 'setPhase') {
    const { athleteId, phase, effectiveDate } = event;
    const valid = Object.keys(rules.PHASE_PROFILES);
    if (!athleteId || valid.indexOf(phase) < 0) return { ok: false, error: '参数不合法' };
    const target = await userOf(athleteId);
    if (!target) return { ok: false, error: '拳王不存在' };
    if (target.coachOpenid !== OPENID) return { ok: false, error: '该拳王未绑定到你' };
    const eff = effectiveDate || date;
    try {
      const profile = Object.assign({}, target.profile || {}, {
        phase: phase,
        phaseEffectiveDate: eff,
        phaseSetBy: OPENID,
        phaseSetAt: new Date().toISOString()
      });
      await db.collection('users').doc(target._id).update({ data: { profile: profile } });
      await db.collection('phase_history').add({
        data: {
          athleteId: athleteId,
          phase: phase,
          effectiveDate: eff,
          setBy: OPENID,
          createdAt: new Date().toISOString(),
          previousPhase: (target.profile && target.profile.phase) || ''
        }
      });
      return { ok: true, phase: phase, effectiveDate: eff, label: rules.phaseLabel(phase) };
    } catch (e) {
      return { ok: false, error: '写入失败' };
    }
  }

  // ---------- 目标设置（profile.goals 的唯一写入方） ----------
  if (action === 'setGoals') {
    const { athleteId } = event;
    if (!athleteId) return { ok: false, error: '缺少 athleteId' };
    const target = await userOf(athleteId);
    if (!target) return { ok: false, code: 'E_GOAL_UNKNOWN', error: '拳王不存在' };
    if (target.coachOpenid !== OPENID) return { ok: false, code: 'E_GOAL_FORBIDDEN', error: '该拳王未绑定到你' };
    if (!Array.isArray(event.goals)) return { ok: false, code: 'E_GOAL_UNKNOWN', error: 'goals 必须是目标 ID 数组' };

    const input = { goals: event.goals, goalEffectiveDate: event.goalEffectiveDate };
    if (Object.prototype.hasOwnProperty.call(event, 'bodyFatPct')) input.bodyFatPct = event.bodyFatPct;

    const check = GOALS.validateGoalWrite(input, target.profile || {}, { today: date });
    if (!check.ok) {
      return {
        ok: false,
        code: check.error.code,
        error: check.error.message,
        goalId: check.error.goalId,
        level: check.error.level
      };
    }

    const profile = Object.assign({}, target.profile || {}, {
      goals: check.goals,
      goalEffectiveDate: check.goalEffectiveDate,
      goalSource: check.goalSource,
      bodyFatPct: check.bodyFatPct
    });
    try {
      await db.collection('users').doc(target._id).update({ data: { profile: profile } });
      return {
        ok: true,
        goals: check.goals,
        goalEffectiveDate: check.goalEffectiveDate,
        goalSource: check.goalSource,
        bodyFatPct: check.bodyFatPct,
        phase: check.phase,
        goalMatrixVersion: check.matrixVersion
      };
    } catch (e) {
      return { ok: false, code: 'E_GOAL_WRITE', error: '目标写入失败，未修改任何字段' };
    }
  }

  // ---------- 体脂单独更新（不重写 goals，供 EA/FFM 使用） ----------
  if (action === 'setBodyComp') {
    const { athleteId } = event;
    if (!athleteId) return { ok: false, code: 'E_GOAL_UNKNOWN', error: '缺少 athleteId' };
    const target = await userOf(athleteId);
    if (!target) return { ok: false, code: 'E_GOAL_UNKNOWN', error: '拳王不存在' };
    if (target.coachOpenid !== OPENID) return { ok: false, code: 'E_GOAL_FORBIDDEN', error: '该拳王未绑定到你' };
    // 三态：省略 = 不调用（不清除）；显式 null = 清除；数字 = 写入 3–50。
    if (!Object.prototype.hasOwnProperty.call(event, 'bodyFatPct')) {
      return { ok: false, code: 'E_GOAL_BODYFAT', error: '未提供 bodyFatPct；如需清除体脂请显式传 null' };
    }
    let bf = null;
    if (event.bodyFatPct !== null && event.bodyFatPct !== '') {
      const n = parseFloat(String(event.bodyFatPct));
      if (!isFinite(n) || n < 3 || n > 50) {
        return { ok: false, code: 'E_GOAL_BODYFAT', error: '体脂率应在 3–50% 之间' };
      }
      bf = Math.round(n * 10) / 10;
    }
    const profile = Object.assign({}, target.profile || {}, {
      bodyFatPct: bf,
      bodyCompSource: 'coach',
      bodyCompUpdatedAt: new Date().toISOString(),
      bodyCompSetBy: OPENID
    });
    try {
      await db.collection('users').doc(target._id).update({ data: { profile: profile } });
      return { ok: true, bodyFatPct: bf };
    } catch (e) {
      return { ok: false, code: 'E_GOAL_WRITE', error: '体脂写入失败，未修改任何字段' };
    }
  }

  // ---------- refeed 计划（每周天数，供 advice/getFeed 的 ctx.refeed 读取） ----------
  if (action === 'setRefeedPlan') {
    const { athleteId } = event;
    if (!athleteId) return { ok: false, code: 'E_GOAL_UNKNOWN', error: '缺少 athleteId' };
    const target = await userOf(athleteId);
    if (!target) return { ok: false, code: 'E_GOAL_UNKNOWN', error: '拳王不存在' };
    if (target.coachOpenid !== OPENID) return { ok: false, code: 'E_GOAL_FORBIDDEN', error: '该拳王未绑定到你' };
    const rr = GOALS.normalizeRefeedDays(event.refeedDays);
    if (!rr.ok) return { ok: false, code: rr.code, error: rr.message };
    const days = rr.days;
    const profile = Object.assign({}, target.profile || {}, {
      refeedDays: days,
      refeedDaysSource: 'coach',
      refeedDaysUpdatedAt: new Date().toISOString(),
      refeedDaysSetBy: OPENID
    });
    try {
      await db.collection('users').doc(target._id).update({ data: { profile: profile } });
      return { ok: true, refeedDays: days };
    } catch (e) {
      return { ok: false, code: 'E_GOAL_WRITE', error: 'refeed 计划写入失败，未修改任何字段' };
    }
  }

  // ---------- 规则库 ----------
  if (action === 'listRules') {
    const reviews = await reviewMap();
    const list = REG.listRules().map(function (r) {
      const status = reviews[r.ruleId] || r.reviewStatus;
      return Object.assign({}, r, {
        reviewStatus: status,
        reviewStatusName: REG.reviewStatusMeta(status).name,
        reviewTone: REG.reviewStatusMeta(status).tone,
        sourceCount: r.sources.length
      });
    });
    return { ok: true, rules: list, reviewStatuses: REG.REVIEW_STATUS, sourceTypes: REG.SOURCE_TYPES };
  }

  if (action === 'markRuleReview') {
    const { ruleId, status, note } = event;
    if (!REG.getRule(ruleId)) return { ok: false, error: '规则不存在' };
    if (['active', 'needs_review', 'deprecated'].indexOf(status) < 0) return { ok: false, error: '状态不合法' };
    try {
      const ex = await db.collection('rule_reviews').where({ ruleId: ruleId }).limit(1).get();
      const data = {
        ruleId: ruleId, status: status, note: note || '',
        reviewedBy: OPENID, reviewedAt: new Date().toISOString()
      };
      if (ex.data.length) await db.collection('rule_reviews').doc(ex.data[0]._id).update({ data: data });
      else await db.collection('rule_reviews').add({ data: data });
      return { ok: true, ruleId: ruleId, status: status };
    } catch (e) {
      return { ok: false, error: '写入失败（检查 rule_reviews 集合）' };
    }
  }

  return { ok: false, error: '未知 action: ' + action };
};
