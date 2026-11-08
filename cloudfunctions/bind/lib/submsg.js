// 订阅消息共享库（由 scripts/sync-shared.sh 复制到各云函数 lib/）。
// 模板 ID 只从云函数环境变量读取，前端只拿 whoami 下发的 ID 去 requestSubscribeMessage。
//
// 模板字段契约（四个模板都按这三个字段创建，字段名必须一致）：
//   thing1  主体（拳王/教练姓名，20 字以内）
//   thing2  摘要（标题或消息前 20 字）
//   time3   YYYY-MM-DD HH:mm（北京时间）
//
// 一次性订阅：用户每同意一次只能收一条；发送成功后把 users.subscribe.<场景> 置为 sent。
// 长期订阅仅对特定类目开放，普通小程序无法申请，因此这里按一次性订阅设计。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ENV_KEYS = {
  coachLog: 'TPL_COACH_LOG',          // 拳王保存记录 -> 教练
  athleteMsg: 'TPL_ATHLETE_MSG',      // 教练发消息 -> 拳王
  advicePublish: 'TPL_ADVICE_PUBLISH',// 营养师发布建议 -> 拳王
  adviceChange: 'TPL_ADVICE_CHANGE'   // 建议更新/撤回 -> 拳王
};
const SCENARIOS = ['coachLog', 'athleteMsg', 'advicePublish', 'adviceChange'];
const STATUSES = ['accept', 'reject', 'ban', 'filter', 'sent'];

function templateOf(scenario) {
  return String(process.env[ENV_KEYS[scenario]] || '').trim();
}

function templates() {
  const out = {};
  SCENARIOS.forEach(function (k) { out[k] = templateOf(k); });
  return out;
}

// thing 类字段 20 字上限；空白与换行压成单行
function thing(value) {
  let s = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  if (!s) s = '-';
  return s.length > 20 ? (s.slice(0, 19) + '…') : s;
}

// 云函数通常跑在 UTC；模板里的时间统一显示北京时间
function timeStr(input) {
  const raw = input ? new Date(input) : new Date();
  const d = isNaN(raw.getTime()) ? new Date() : raw;
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return cn.getUTCFullYear() + '-' + pad(cn.getUTCMonth() + 1) + '-' + pad(cn.getUTCDate()) +
    ' ' + pad(cn.getUTCHours()) + ':' + pad(cn.getUTCMinutes());
}

function cleanResults(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  SCENARIOS.forEach(function (k) {
    const v = input[k];
    const s = (typeof v === 'string') ? v : (v && v.status);
    if (STATUSES.indexOf(s) >= 0) out[k] = s;
  });
  return out;
}

async function userOf(openid) {
  try {
    const r = await db.collection('users').where({ _openid: openid }).limit(1).get();
    return r.data[0] || null;
  } catch (e) { return null; }
}

// 前端授权结果落库：只接受已知场景与合法状态，不覆盖其他场景
async function record(openid, results) {
  const clean = cleanResults(results);
  if (!openid || !Object.keys(clean).length) return null;
  const me = await userOf(openid);
  if (!me) return null;
  const subscribe = Object.assign({}, me.subscribe || {}, clean);
  try {
    await db.collection('users').doc(me._id).update({
      data: { subscribe: subscribe, subscribeUpdatedAt: new Date().toISOString() }
    });
    return subscribe;
  } catch (e) {
    console.warn('订阅授权结果写入失败', e.errMsg || e.message);
    return null;
  }
}

async function markSent(openid, scenario) {
  const me = await userOf(openid);
  if (!me) return;
  const subscribe = Object.assign({}, me.subscribe || {}, {});
  subscribe[scenario] = 'sent';
  try {
    await db.collection('users').doc(me._id).update({
      data: { subscribe: subscribe, subscribeUpdatedAt: new Date().toISOString() }
    });
  } catch (e) { /* 下次发送会失败并被吞掉，不影响主流程 */ }
}

// 统一通知入口：未配置模板、未授权、发送失败都静默跳过/吞异常。
async function notify(openid, scenario, msg) {
  try {
    const tpl = templateOf(scenario);
    if (!tpl || !openid) return { ok: false, skipped: 'not-configured' };
    const me = await userOf(openid);
    const status = me && me.subscribe && me.subscribe[scenario];
    if (status !== 'accept') return { ok: false, skipped: 'no-consent' };

    const m = msg || {};
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: tpl,
      page: m.page || 'pages/index/index',
      miniprogramState: process.env.MINI_STATE || 'formal',
      data: {
        thing1: { value: thing(m.name) },
        thing2: { value: thing(m.summary) },
        time3: { value: timeStr(m.time) }
      }
    });
    await markSent(openid, scenario);
    return { ok: true };
  } catch (e) {
    console.warn('订阅消息发送失败（未配置/未授权/配额/模板字段不匹配）', scenario, e.errCode || e.message);
    return { ok: false, error: (e && (e.errMsg || e.message)) || 'send failed' };
  }
}

module.exports = {
  ENV_KEYS: ENV_KEYS,
  SCENARIOS: SCENARIOS,
  templates: templates,
  record: record,
  notify: notify,
  thing: thing,
  timeStr: timeStr,
  cleanResults: cleanResults
};
