const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const rules = require('./lib/rules.js');
const weekly = require('./lib/weekly.js');

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

// detail 的时间范围：默认（不传 from/to/days）保持原来的“最近 14 条”行为
const MAX_DETAIL_DAYS = 90;
const MAX_DETAIL_LOGS = 100;

function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 准入判定：新用户初始待准入；升级前的老文档有绑定关系或教练身份视为已准入。
function admissionOf(user) {
  if (!user) return 'pending';
  if (user.admission === 'active' || user.admission === 'pending' || user.admission === 'blocked') return user.admission;
  if (user.role === 'coach') return 'active';
  if (user.coachOpenid || user.coachCode) return 'active';
  return 'pending';
}

function isDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) === s;
}

function detailRange(event) {
  const wantsRange = event.from || event.to || event.days !== undefined;
  if (!wantsRange) return { ok: true, range: false };
  const to = event.to || todayStr();
  if (!isDateStr(to)) return { ok: false, error: 'to 日期格式应为 YYYY-MM-DD' };
  let from;
  if (event.from) {
    if (!isDateStr(event.from)) return { ok: false, error: 'from 日期格式应为 YYYY-MM-DD' };
    from = event.from;
  } else {
    const days = Number(event.days);
    if (!isFinite(days) || days < 1 || Math.floor(days) !== days) {
      return { ok: false, error: 'days 必须是正整数' };
    }
    if (days > MAX_DETAIL_DAYS) {
      return { ok: false, error: '查询范围超过上限 ' + MAX_DETAIL_DAYS + ' 天，请缩小范围' };
    }
    from = shiftDate(to, -(days - 1));
  }
  if (from > to) return { ok: false, error: 'from 不能晚于 to' };
  const span = Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
  if (span > MAX_DETAIL_DAYS) {
    return { ok: false, error: '查询范围 ' + span + ' 天，超过上限 ' + MAX_DETAIL_DAYS + ' 天，请缩小范围' };
  }
  return { ok: true, range: true, from: from, to: to };
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

  if (admissionOf(user) !== 'active') {
    return { ok: false, code: 'PENDING_ADMISSION', error: '账号待准入：请输入教练提供的配对码' };
  }

  const isCoach = user.role === 'coach';

  // 教练看板：绑定的拳王 + 最近记录，外加今天的跟进队列概览
  if (isCoach) {
    const athletes = await db.collection('users').where({ coachOpenid: OPENID, role: 'athlete' }).limit(20).get();
    let queue = { pending: 0, escalated: 0, date: todayStr() };
    try {
      const q = await db.collection('followups')
        .where({ nutritionistId: OPENID, date: queue.date, status: _.in(['pending', 'snoozed']) })
        .limit(200).get();
      queue.pending = q.data.length;
      queue.escalated = q.data.filter(function (x) { return x.escalated; }).length;
    } catch (e) { /* 集合未建时按 0 处理 */ }
    // 今日审阅状态：一次查当日已发布建议，再在内存里按拳王比对，避免每人一次查询
    const reviewStates = {};
    try {
      const adv = await db.collection('advice')
        .where({
          coachOpenid: OPENID,
          status: 'published',
          dateFrom: _.lte(queue.date),
          dateTo: _.gte(queue.date)
        }).limit(200).get();
      adv.data.forEach(function (x) { if (x.athleteId) reviewStates[x.athleteId] = 'done'; });
    } catch (e) { /* advice 集合未建时全部按未审阅处理 */ }

    const list = [];
    for (const a of athletes.data) {
      const r = await db.collection('logs').where({ athleteId: a._openid }).orderBy('date', 'desc').limit(1).get();
      const last = r.data[0] || null;
      const unread = await db.collection('inbox')
        .where({ owner: OPENID, athleteId: a._openid, read: false })
        .count().catch(function () { return { total: 0 }; });
      list.push({
        openid: a._openid,
        name: (a.profile && a.profile.name) || '拳王',
        profile: a.profile || {},
        phase: (a.profile && a.profile.phase) || 'maintain',
        lastDate: last ? last.date : '',
        lastFeedback: last ? last.feedback : null,
        lastPayload: last ? last.payload : null,
        unreadTotal: unread.total,
        reviewState: reviewStates[a._openid] || ((last && last.date === queue.date) ? 'pending' : 'none')
      });
    }
    if (action === 'detail' && event.athleteId) {
      // 归属校验：只能读取绑定到自己的拳王，避免任意教练按 openid 越权读取
      const owned = await db.collection('users')
        .where({ _openid: event.athleteId, coachOpenid: OPENID, role: 'athlete' })
        .limit(1).get().catch(function () { return { data: [] }; });
      if (!owned.data.length) return { ok: false, error: '该拳王未绑定到你' };
      const rg = detailRange(event);
      if (!rg.ok) return rg;
      try {
        let one;
        if (rg.range) {
          one = await db.collection('logs')
            .where({ athleteId: event.athleteId, date: _.gte(rg.from).and(_.lte(rg.to)) })
            .orderBy('date', 'desc').limit(MAX_DETAIL_LOGS + 1).get();
          // 不静默截断：达到上限就明确报错，让调用方缩小范围
          if (one.data.length > MAX_DETAIL_LOGS) {
            return { ok: false, error: '该时间范围记录数超过上限 ' + MAX_DETAIL_LOGS + ' 条，请缩小范围' };
          }
        } else {
          one = await db.collection('logs')
            .where({ athleteId: event.athleteId })
            .orderBy('date', 'desc').limit(14).get();
        }
        return {
          ok: true, role: 'coach', athletes: list, logs: one.data, queue: queue,
          range: rg.range ? { from: rg.from, to: rg.to } : null
        };
      } catch (e) {
        return { ok: false, error: '读取记录失败' };
      }
    }
    return { ok: true, role: 'coach', athletes: list, queue: queue };
  }

  // 拳王：自己的记录。传 from/to/days 时按时间范围取，否则保持“近 N 条”默认行为
  const rg = detailRange(event);
  if (!rg.ok) return rg;
  let res;
  let rangeOut = null;
  if (rg.range) {
    try {
      res = await db.collection('logs')
        .where({ athleteId: OPENID, date: _.gte(rg.from).and(_.lte(rg.to)) })
        .orderBy('date', 'desc').limit(MAX_DETAIL_LOGS + 1).get();
    } catch (e) {
      return { ok: false, error: '读取记录失败（检查 logs 的 athleteId+date 索引）' };
    }
    if (res.data.length > MAX_DETAIL_LOGS) {
      return { ok: false, error: '该时间范围记录数超过上限 ' + MAX_DETAIL_LOGS + ' 条，请缩小范围' };
    }
    rangeOut = { from: rg.from, to: rg.to };
  } else {
    const limit = Math.min(Number(event.limit) || 14, 60);
    res = await db.collection('logs').where({ athleteId: OPENID }).orderBy('date', 'desc').limit(limit).get();
  }
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
      const profile = (user && user.profile) || {};
      const refeed = weekly.deriveRefeed({
        logs: res.data.map(function (d) { return d.payload || {}; }).filter(function (l) { return l.date; }),
        endDate: today.date || event.date,
        days: 7,
        profile: profile,
        // 优先级：event.refeedDays → profile.refeedDays → null（缺失时跳过重归一）
        plannedDays: event.refeedDays !== undefined ? event.refeedDays
          : (profile.refeedDays !== undefined ? profile.refeedDays : null)
      });
      today.feedbackLive = rules.evaluate(today.payload, {
        profile: profile,
        recentMorningWeights: pts,
        ruleReviews: reviews,
        refeed: refeed
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
    range: rangeOut,
    profile: (user && user.profile) || {},
    coachOpenid: (user && user.coachOpenid) || ''
  };
};
