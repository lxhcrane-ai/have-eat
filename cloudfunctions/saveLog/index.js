const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const rules = require('./lib/rules.js');
const submsg = require('./lib/submsg.js');

// 规则复核状态覆盖（rule_reviews 集合）。集合不存在时用登记表默认值。
async function reviewOverrides() {
  try {
    const r = await db.collection('rule_reviews').limit(100).get();
    const map = {};
    r.data.forEach(function (x) { map[x.ruleId] = x.status; });
    return map;
  } catch (e) { return {}; }
}

function admissionOf(user) {
  if (!user) return 'pending';
  if (user.admission === 'active' || user.admission === 'pending' || user.admission === 'blocked') return user.admission;
  if (user.role === 'coach') return 'active';
  if (user.coachOpenid || user.coachCode) return 'active';
  return 'pending';
}

// 拳王保存当日记录：upsert logs（按 date 幂等）-> 计算评估 -> 通知教练
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const payload = event && event.log;
  if (!payload || !payload.date) return { ok: false, error: '缺少 log.date' };

  const log = rules.normalizeLog(payload);
  log.schemaVersion = 2;
  log.id = log.id || (OPENID.slice(-6) + '-' + log.date);
  log.athleteId = OPENID;

  const users = db.collection('users');
  let user = null;
  try {
    const u = await users.where({ _openid: OPENID }).limit(1).get();
    user = u.data[0] || null;
  } catch (e) {
    return { ok: false, error: 'users 集合不存在' };
  }
  if (admissionOf(user) !== 'active') {
    return { ok: false, code: 'PENDING_ADMISSION', error: '账号待准入：请输入教练提供的配对码' };
  }
  if (user && user.role === 'coach' && event.force !== true) {
    return { ok: false, error: '当前账号是教练账号，不能提交训练记录' };
  }
  const profile = (user && user.profile) || {};

  // 取最近 10 天晨重算趋势
  let recent = [];
  try {
    const r = await db.collection('logs')
      .where({ athleteId: OPENID, date: _.neq(log.date) })
      .orderBy('date', 'desc').limit(10).field({ date: true, 'payload.weights': true }).get();
    recent = r.data.map(function (d) {
      return { date: d.date, kg: d.payload && d.payload.weights && d.payload.weights.morning && d.payload.weights.morning.kg };
    }).filter(function (p) { return p.kg !== null && p.kg !== undefined; });
  } catch (e) { /* 首次没有历史 */ }

  const feedback = rules.evaluate(log, { profile: profile, recentMorningWeights: recent, ruleReviews: await reviewOverrides() });

  const doc = {
    athleteId: OPENID,
    date: log.date,
    payload: log,
    feedback: {
      version: 3,
      score: feedback.score,
      level: feedback.level,
      headline: feedback.headline,
      summary: feedback.coachSummary,
      phase: feedback.phase,
      phaseLabel: feedback.phaseLabel,
      // 告警带 ruleId / evidence / 复核状态，前端据此展开"依据"
      alerts: feedback.alerts.map(function (a) {
        return {
          level: a.level, title: a.title, text: a.text, kb: a.kb,
          code: a.code, ruleId: a.ruleId, ruleName: a.ruleName,
          evidence: a.evidence, reviewStatus: a.reviewStatus,
          requiresFollowUp: a.requiresFollowUp
        };
      }),
      suppressed: feedback.suppressed,
      missingRequired: feedback.missingRequired,
      proteinG: feedback.protein.actualG,
      proteinTargetG: feedback.protein.targetG,
      proteinMinG: feedback.protein.minG,
      kcal: feedback.totals.kcal,
      dehydrationPct: feedback.hydration.pct,
      hydrationPlanRate: feedback.hydration.planRate,
      sorenessMax: feedback.recovery.sorenessMax,
      sRPE: feedback.sRPE
    },
    updatedAt: new Date().toISOString()
  };

  // 幂等 upsert：同一天重复提交只更新
  const exists = await db.collection('logs').where({ athleteId: OPENID, date: log.date }).limit(1).get();
  let logId;
  if (exists.data.length) {
    logId = exists.data[0]._id;
    await db.collection('logs').doc(logId).update({ data: doc });
  } else {
    doc.createdAt = new Date().toISOString();
    const added = await db.collection('logs').add({ data: doc });
    logId = added._id;
  }

  // 通知教练：红/黄灯 + 每天第一条记录才推送，避免刷屏
  let notified = false;
  const coachOpenid = (user && user.coachOpenid) || '';
  if (coachOpenid) {
    const reds = feedback.alerts.filter(function (a) { return a.level === 'red'; });
    const isFirstToday = !exists.data.length;
    if (reds.length || isFirstToday) {
      await db.collection('inbox').add({
        data: {
          owner: coachOpenid,
          athleteId: OPENID,
          type: 'log',
          level: reds.length ? 'red' : 'info',
          title: (profile.name || '拳王') + ' ' + log.date + ' ' + feedback.headline,
          body: feedback.coachSummary,
          date: log.date,
          logId: logId,
          read: false,
          createdAt: new Date().toISOString()
        }
      });
      notified = true;
      // 订阅消息：只有红灯才推送，避免每天首条也消耗一次授权导致刷屏。
      // 未配置模板 / 教练未授权 / 发送失败都在 submsg 内静默吞掉，不影响保存主流程。
      if (reds.length) {
        await submsg.notify(coachOpenid, 'coachLog', {
          page: 'pages/coach/coach',
          name: (profile.name || '拳王') + ' ' + log.date,
          summary: feedback.headline,
          time: new Date()
        });
      }
    }
  }

  return {
    ok: true,
    logId: logId,
    notified: notified,
    feedback: feedback
  };
};
