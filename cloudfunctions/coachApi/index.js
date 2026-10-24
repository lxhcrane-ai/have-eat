const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const rules = require('./lib/rules.js');
const fu = require('./lib/followup.js');
const REG = require('./lib/ruleRegistry.js');

// 营养师后台唯一入口：阶段设置、跟进队列、规则复核。
// 权限全部在服务端判定：写操作只允许 role='coach'，且只能操作自己绑定的拳王。

async function userOf(openid) {
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    return u.data[0] || null;
  } catch (e) { return null; }
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
        if (cur.status === 'pending' || cur.status === 'snoozed') {
          await db.collection('followups').doc(cur._id).update({
            data: Object.assign({}, doc, { createdAt: cur.createdAt, status: cur.status, nutritionistNote: cur.nutritionistNote || '' })
          });
        }
      } else {
        await db.collection('followups').add({ data: doc });
      }
    } catch (e) {
      // 单个写入失败不影响整体返回（离线/集合未建时会走到这里）
    }
  }
  return queue;
}

async function listQueue(coachOpenid, date) {
  let items = [];
  try {
    const r = await db.collection('followups').where({ nutritionistId: coachOpenid, date: date }).limit(200).get();
    items = r.data.map(function (x) {
      x.id = x.itemId;
      return x;
    });
  } catch (e) { items = []; }

  // 当天还没有队列就自动生成一次（营养师打开页面即看到结果）
  if (!items.length) {
    const q = await generate(coachOpenid, date);
    return { ok: true, date: date, generated: true, groups: fu.groupForNutritionist(q.items), stats: q.stats, items: q.items };
  }
  const pending = items.filter(function (i) { return i.status === 'pending' || i.status === 'snoozed'; });
  return {
    ok: true, date: date, generated: false,
    groups: fu.groupForNutritionist(items),
    stats: {
      total: pending.length,
      escalated: pending.filter(function (i) { return i.escalated; }).length,
      red: pending.filter(function (i) { return i.level === 'red'; }).length,
      athletes: fu.groupForNutritionist(items).length
    },
    items: items
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'list';
  const date = event.date || todayStr();

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
    const res = action === 'generate'
      ? await generate(OPENID, date).then(function (q) {
        return { ok: true, date: date, generated: true, groups: fu.groupForNutritionist(q.items), stats: q.stats, items: q.items };
      })
      : await listQueue(OPENID, date);
    return res;
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
      const status = action === 'dismiss' ? 'dismissed' : 'snoozed';
      const next = action === 'dismiss' ? '' : fu.shiftDate(item.date, Number(event.days) || 1);
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
