// 营养师后台 API：阶段设置 + 跟进队列 + 规则复核。
// 统一封装云函数 coachApi；云环境未部署时退化为本机存储，保证离线也能走完流程（演示/自测用）。
const api = require('./api.js');
const rules = require('./rules.js');
const fu = require('./followup.js');
const fmt = require('./format.js');
const privacy = require('./privacy.js');

const KEY_QUEUE = 'coach_queue_v1';      // { date, groups, snoozedGroups, stats, items }
const KEY_PENDING = 'coach_followup_pending_v1'; // 离线稍后/撤销动作，联网后回写
const KEY_REMIND = 'local_reminders_v1';  // [{...reminder}]
const KEY_REVIEW = 'rule_reviews_v1';     // { ruleId: status }
const KEY_PHASE = 'phase_overrides_v1';   // { athleteId: {phase, effectiveDate} }

function read(key, dflt) {
  try { return wx.getStorageSync(key) || dflt; } catch (e) { return dflt; }
}
function write(key, v) {
  try { wx.setStorageSync(key, v); } catch (e) {}
}

// ---------- 阶段 ----------
function getPhaseProfile(phase) { return rules.getPhaseProfile(phase); }

async function setAthletePhase(athleteId, phase, effectiveDate) {
  const res = await api.call('coachApi', { action: 'setPhase', athleteId: athleteId, phase: phase, effectiveDate: effectiveDate });
  if (res && res.ok) return res;
  // 离线：只记本机（教练端设置，拳王下次同步时由云端覆盖）
  const map = read(KEY_PHASE, {});
  map[athleteId] = { phase: phase, effectiveDate: effectiveDate || '' };
  write(KEY_PHASE, map);
  return { ok: true, offline: true, phase: phase, effectiveDate: effectiveDate };
}

function localPhaseOf(athleteId) {
  const map = read(KEY_PHASE, {});
  return map[athleteId] ? map[athleteId].phase : '';
}

// ---------- 规则复核 ----------
function reviewMap() { return read(KEY_REVIEW, {}); }

async function listRules() {
  const res = await api.call('coachApi', { action: 'listRules' });
  const local = reviewMap();
  const base = (res && res.ok && res.rules) ? res.rules : rules.listRules();
  const list = base.map(function (r) {
    const status = local[r.ruleId] || r.reviewStatus || 'active';
    const meta = rules.REVIEW_STATUS.filter(function (x) { return x.id === status; })[0] || { name: '有效', tone: 'ok' };
    return Object.assign({}, r, {
      reviewStatus: status,
      reviewStatusName: meta.name,
      reviewTone: meta.tone,
      phaseLabels: (r.applicablePhases || []).map(function (p) { return rules.phaseLabel(p); })
    });
  });
  return { ok: true, rules: list, offline: !(res && res.ok) };
}

async function markRuleReview(ruleId, status, note) {
  const res = await api.call('coachApi', { action: 'markRuleReview', ruleId: ruleId, status: status, note: note || '' });
  const map = read(KEY_REVIEW, {});
  map[ruleId] = status;
  write(KEY_REVIEW, map);   // 无论云端是否成功，本机立即生效（离线也能标）
  return { ok: true, ruleId: ruleId, status: status, offline: !(res && res.ok) };
}

// ---------- 跟进队列 ----------
function decorate(queue) {
  const reviews = reviewMap();
  function mapGroups(groups) {
    return (groups || []).map(function (g) {
      return Object.assign({}, g, {
        items: (g.items || []).map(function (i) {
          const rule = rules.getRuleById(i.ruleId) || {};
          const reviewStatus = reviews[i.ruleId] || rule.reviewStatus || 'active';
          return Object.assign({}, i, {
            reviewStatus: reviewStatus,
            reviewStatusName: rules.REVIEW_STATUS.filter(function (x) {
              return x.id === reviewStatus;
            }).map(function (x) { return x.name; })[0] || '有效',
            reminderText: i.reminderText || fu.defaultReminderText(i),
            note: i.note || ''
          });
        })
      });
    });
  }
  return {
    date: queue.date,
    stats: queue.stats || { total: 0, escalated: 0, red: 0, athletes: 0, snoozed: 0 },
    groups: mapGroups(queue.groups),
    snoozedGroups: mapGroups(queue.snoozedGroups),
    items: queue.items || [],
    offline: !!queue.offline,
    unsynced: Number(queue.unsynced) || 0
  };
}

// 旧缓存可能只有 groups、没有 items：拍平后作为本机状态的唯一来源
function flattenQueue(queue) {
  if (queue.items && queue.items.length) return queue.items;
  let out = [];
  (queue.groups || []).forEach(function (g) { out = out.concat(g.items || []); });
  (queue.snoozedGroups || []).forEach(function (g) { out = out.concat(g.items || []); });
  return out;
}

function pendingList() { return read(KEY_PENDING, []); }
function savePending(list) { write(KEY_PENDING, list); }
function addPending(action) {
  const list = pendingList();
  list.push(action);
  savePending(list);
}

// 本机落状态：改 items 后按同一套纯函数重新分组，避免“本机已稍后、分组还在待办”
function applyLocalItem(itemId, patch) {
  const cache = read(KEY_QUEUE, null);
  if (!cache) return null;
  const items = flattenQueue(cache).map(function (i) { return Object.assign({}, i); });
  let changed = null;
  items.forEach(function (i) {
    if (i.id !== itemId) return;
    Object.assign(i, patch);
    changed = i;
  });
  if (!changed) return null;
  const ref = cache.date || fmt.todayStr();
  const view = fu.groupForNutritionist(items, ref);
  cache.items = items;
  cache.groups = view.groups;
  cache.snoozedGroups = view.snoozedGroups;
  cache.stats = view.stats;
  write(KEY_QUEUE, cache);
  return changed;
}

// 离线动作联网后逐条回写；失败的保留在队列里，页面显示“未同步”
async function flushPending() {
  const list = pendingList();
  const remain = [];
  let synced = 0;
  for (let k = 0; k < list.length; k++) {
    const a = list[k];
    const res = await api.call('coachApi', a.action === 'snooze'
      ? { action: 'snooze', itemId: a.itemId, days: a.days, date: a.date }
      : { action: 'unsnooze', itemId: a.itemId });
    if (res && res.ok) synced += 1;
    else remain.push(a);
  }
  savePending(remain);
  return { pending: remain.length, synced: synced };
}

function offlineView(date) {
  const cache = read(KEY_QUEUE, null);
  if (!cache || cache.date !== date) {
    return {
      date: date, stats: { total: 0, escalated: 0, red: 0, athletes: 0, snoozed: 0 },
      groups: [], snoozedGroups: [], items: [], offline: true, unsynced: pendingList().length
    };
  }
  // 离线缓存里可能残留已解绑拳王的跟进项：按当前名下列表过滤，未确认归属时不展示。
  const items = privacy.filterOwnedItems(flattenQueue(cache));
  const view = fu.groupForNutritionist(items, date);
  return {
    date: date, groups: view.groups, snoozedGroups: view.snoozedGroups, stats: view.stats,
    items: items, offline: true, unsynced: pendingList().length
  };
}

async function getQueueForNutritionist(date) {
  const flush = await flushPending();
  const res = await api.call('coachApi', { action: 'list', date: date });
  if (res && res.ok) {
    cacheQueue(res);
    return decorate(Object.assign({}, res, { date: res.date || date, unsynced: flush.pending }));
  }
  return decorate(offlineView(date));
}

async function generateFollowUpQueue(date) {
  const flush = await flushPending();
  const res = await api.call('coachApi', { action: 'generate', date: date });
  if (res && res.ok) {
    cacheQueue(res);
    return decorate(Object.assign({}, res, { date: res.date || date, unsynced: flush.pending }));
  }
  return decorate(offlineView(date));
}

function cacheQueue(queue) {
  const items = queue.items || flattenQueue(queue);
  write(KEY_QUEUE, {
    date: queue.date,
    groups: queue.groups || [],
    snoozedGroups: queue.snoozedGroups || [],
    stats: queue.stats,
    items: items
  });
}

async function confirmFollowUp(itemId, editedText, note) {
  const res = await api.call('coachApi', { action: 'confirm', itemId: itemId, editedText: editedText, note: note });
  if (res && res.ok) return res;
  // 离线：本机生成提醒并标注状态（同时写 items，保证离线重进页面不会复活）
  const changed = applyLocalItem(itemId, { status: 'confirmed' });
  let reminder = null;
  if (changed) {
    reminder = fu.buildReminder(changed, editedText, 'local-coach');
    const list = read(KEY_REMIND, []);
    list.push(reminder);
    write(KEY_REMIND, list);
  }
  return { ok: true, offline: true, reminder: reminder };
}

async function dismissFollowUp(itemId, reason) {
  const res = await api.call('coachApi', { action: 'dismiss', itemId: itemId, reason: reason || '' });
  if (res && res.ok) return res;
  applyLocalItem(itemId, { status: 'dismissed', nutritionistNote: reason || '' });
  return { ok: true, offline: true };
}

async function snoozeFollowUp(itemId, days) {
  const d = Number(days) || 1;
  const base = fmt.todayStr();
  const res = await api.call('coachApi', { action: 'snooze', itemId: itemId, days: d, date: base });
  if (res && res.ok) {
    applyLocalItem(itemId, {
      status: 'snoozed',
      nextReminderDate: res.nextReminderDate || fu.shiftDate(base, d)
    });
    return Object.assign({}, res, { pendingSync: false });
  }
  // 云端明确拒绝（如已确认 / 不属于本人）时不做本机状态，避免假成功
  if (res && !res.ok && !res.offline) return res;

  const next = fu.shiftDate(base, d);
  applyLocalItem(itemId, { status: 'snoozed', nextReminderDate: next });
  addPending({ action: 'snooze', itemId: itemId, days: d, date: base, nextReminderDate: next, at: fmt.nowIso() });
  return { ok: true, offline: true, pendingSync: true, nextReminderDate: next };
}

// 撤销稍后：云端与本地都回到待办；离线时排队等联网回写
async function unsnoozeFollowUp(itemId) {
  const res = await api.call('coachApi', { action: 'unsnooze', itemId: itemId });
  if (res && res.ok) {
    applyLocalItem(itemId, { status: 'pending', nextReminderDate: '' });
    return Object.assign({}, res, { pendingSync: false });
  }
  if (res && !res.ok && !res.offline) return res;

  applyLocalItem(itemId, { status: 'pending', nextReminderDate: '' });
  addPending({ action: 'unsnooze', itemId: itemId, at: fmt.nowIso() });
  return { ok: true, offline: true, pendingSync: true };
}

async function getHistory() {
  const res = await api.call('coachApi', { action: 'history' });
  if (res && res.ok) return res;
  return { ok: true, items: [], offline: true };
}

// ---------- 复合目标写入（必须在线，离线不本地假写） ----------
async function setGoals(payload) {
  payload = payload || {};
  const body = {
    action: 'setGoals',
    athleteId: payload.athleteId,
    goals: payload.goals || [],
    goalEffectiveDate: payload.goalEffectiveDate || ''
  };
  // 三态：省略 = 保留原值；显式 null = 清除；数字 = 写入 3–50。
  if (payload.bodyFatPct !== undefined) body.bodyFatPct = payload.bodyFatPct;
  const res = await api.call('coachApi', body);
  if (res && res.ok) return res;
  // 离线一律不落本地：目标只能由云端 setGoals 写，避免拳王端看到假目标
  if (res && res.offline) {
    return {
      ok: false, offline: true, code: res.code || 'E_GOAL_OFFLINE',
      error: '无法连接云端，目标未保存；本机不会写入假数据，请联网后重试。'
    };
  }
  return res;
}

// 体脂单独更新：与 setGoals 解耦，避免只改体脂时把目标一起重写。
async function setBodyComp(payload) {
  payload = payload || {};
  if (payload.bodyFatPct === undefined) {
    return { ok: false, code: 'E_GOAL_BODYFAT', error: '未提供 bodyFatPct；如需清除体脂请显式传 null' };
  }
  const res = await api.call('coachApi', {
    action: 'setBodyComp',
    athleteId: payload.athleteId,
    bodyFatPct: payload.bodyFatPct
  });
  if (res && res.ok) return res;
  if (res && res.offline) {
    return {
      ok: false, offline: true, code: res.code || 'E_GOAL_OFFLINE',
      error: '无法连接云端，体脂未保存；本机不会写入假数据，请联网后重试。'
    };
  }
  return res;
}

// refeed 计划：营养师唯一写入方；留空（null）表示本周不安排。
async function setRefeedPlan(payload) {
  payload = payload || {};
  const res = await api.call('coachApi', {
    action: 'setRefeedPlan',
    athleteId: payload.athleteId,
    refeedDays: payload.refeedDays === undefined ? null : payload.refeedDays
  });
  if (res && res.ok) return res;
  if (res && res.offline) {
    return {
      ok: false, offline: true, code: res.code || 'E_GOAL_OFFLINE',
      error: '无法连接云端，refeed 计划未保存；本机不会写入假数据，请联网后重试。'
    };
  }
  return res;
}

// ---------- 一次性配对码（必须在线，离线不伪造成功） ----------
async function createPairCode() {
  const res = await api.call('coachApi', { action: 'createPairCode' });
  if (res && res.ok) return res;
  return { ok: false, error: (res && res.error) || '云环境未连接，无法生成配对码' };
}

// ---------- 拳王端：营养师确认过的提醒 ----------
function localReminders(date) {
  return read(KEY_REMIND, []).filter(function (r) { return r.date === date; });
}

module.exports = {
  getPhaseProfile: getPhaseProfile,
  setAthletePhase: setAthletePhase,
  localPhaseOf: localPhaseOf,
  listRules: listRules,
  markRuleReview: markRuleReview,
  getQueueForNutritionist: getQueueForNutritionist,
  generateFollowUpQueue: generateFollowUpQueue,
  confirmFollowUp: confirmFollowUp,
  dismissFollowUp: dismissFollowUp,
  snoozeFollowUp: snoozeFollowUp,
  unsnoozeFollowUp: unsnoozeFollowUp,
  flushPending: flushPending,
  getHistory: getHistory,
  setGoals: setGoals,
  setBodyComp: setBodyComp,
  setRefeedPlan: setRefeedPlan,
  createPairCode: createPairCode,
  localReminders: localReminders,
  cacheQueue: cacheQueue,
  reviewMap: reviewMap
};
