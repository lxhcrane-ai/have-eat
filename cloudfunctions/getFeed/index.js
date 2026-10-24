const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const rules = require('./lib/rules.js');

async function reviewOverrides() {
  try {
    const r = await db.collection('rule_reviews').limit(100).get();
    const map = {};
    r.data.forEach(function (x) { map[x.ruleId] = x.status; });
    return map;
  } catch (e) { return {}; }
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// 拳王：取自己的记录；教练：取所绑定拳王的记录。权限全部在服务端判定。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'list';

  let user = null;
  try {
    const u = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
    user = u.data[0] || null;
  } catch (e) { return { ok: false, error: 'users 集合不存在' }; }

  const isCoach = user && user.role === 'coach';

  // 教练看板：绑定的拳王 + 最近记录，外加今天的跟进队列概览
  if (isCoach) {
    const athletes = await db.collection('users').where({ coachOpenid: OPENID, role: 'athlete' }).limit(20).get();
    const t = await db.collection('inbox').where({ owner: OPENID, read: false }).count().catch(function () { return { total: 0 }; });
    let queue = { pending: 0, escalated: 0, date: todayStr() };
    try {
      const q = await db.collection('followups')
        .where({ nutritionistId: OPENID, date: queue.date, status: _.in(['pending', 'snoozed']) })
        .limit(200).get();
      queue.pending = q.data.length;
      queue.escalated = q.data.filter(function (x) { return x.escalated; }).length;
    } catch (e) { /* 集合未建时按 0 处理 */ }
    const list = [];
    for (const a of athletes.data) {
      const r = await db.collection('logs').where({ athleteId: a._openid }).orderBy('date', 'desc').limit(1).get();
      const last = r.data[0] || null;
      list.push({
        openid: a._openid,
        name: (a.profile && a.profile.name) || '拳王',
        profile: a.profile || {},
        phase: (a.profile && a.profile.phase) || 'maintain',
        lastDate: last ? last.date : '',
        lastFeedback: last ? last.feedback : null,
        lastPayload: last ? last.payload : null,
        unreadTotal: t.total
      });
    }
    if (action === 'detail' && event.athleteId) {
      const one = await db.collection('logs').where({ athleteId: event.athleteId }).orderBy('date', 'desc').limit(14).get();
      return { ok: true, role: 'coach', athletes: list, logs: one.data, queue: queue };
    }
    return { ok: true, role: 'coach', athletes: list, queue: queue };
  }

  // 拳王：自己的近 N 条
  const limit = Math.min(Number(event.limit) || 14, 60);
  const res = await db.collection('logs').where({ athleteId: OPENID }).orderBy('date', 'desc').limit(limit).get();
  const reviews = await reviewOverrides();
  let today = null;
  if (event.date) {
    const t = await db.collection('logs').where({ athleteId: OPENID, date: event.date }).limit(1).get();
    today = t.data[0] || null;
    if (today) {
      // 重算一次，保证历史记录在规则/阶段更新后也能得到最新建议
      const pts = res.data.map(function (d) {
        return { date: d.date, kg: d.payload && d.payload.weights && d.payload.weights.morning && d.payload.weights.morning.kg };
      }).filter(function (p) { return p.kg; });
      today.feedbackLive = rules.evaluate(today.payload, {
        profile: (user && user.profile) || {},
        recentMorningWeights: pts,
        ruleReviews: reviews
      });
    }
  }

  // 营养师确认过的次日提醒：拳王端只看到这些，不看系统原始告警文案
  let reminders = [];
  try {
    const r = await db.collection('reminders')
      .where({ athleteId: OPENID, date: event.date || todayStr() })
      .limit(20).get();
    reminders = r.data || [];
  } catch (e) { reminders = []; }

  return {
    ok: true, role: 'athlete',
    logs: res.data,
    today: today,
    reminders: reminders,
    profile: (user && user.profile) || {},
    coachOpenid: (user && user.coachOpenid) || ''
  };
};
