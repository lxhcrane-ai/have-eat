// 营养师后台 API：阶段设置 + 跟进队列 + 规则复核。
// 统一封装云函数 coachApi；云环境未部署时退化为本机存储，保证离线也能走完流程（演示/自测用）。
const api = require('./api.js');
const rules = require('./rules.js');
const fu = require('./followup.js');

const KEY_QUEUE = 'coach_queue_v1';      // { date, groups, stats, items }
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
  return {
    date: queue.date,
    stats: queue.stats || { total: 0, escalated: 0, red: 0, athletes: 0 },
    groups: (queue.groups || []).map(function (g) {
      return Object.assign({}, g, {
        items: (g.items || []).map(function (i) {
          const rule = rules.getRuleById(i.ruleId) || {};
          return Object.assign({}, i, {
            reviewStatus: reviews[i.ruleId] || rule.reviewStatus || 'active',
            reviewStatusName: rules.REVIEW_STATUS.filter(function (x) {
              return x.id === (reviews[i.ruleId] || rule.reviewStatus);
            }).map(function (x) { return x.name; })[0] || '有效',
            reminderText: fu.defaultReminderText(i),
            note: ''
          });
        })
      });
    }),
    offline: !!queue.offline
  };
}

async function getQueueForNutritionist(date) {
  const res = await api.call('coachApi', { action: 'list', date: date });
  if (res && res.ok) return decorate(res);
  const cache = read(KEY_QUEUE, null);
  if (cache && cache.date === date) return decorate(Object.assign({ offline: true }, cache));
  return { date: date, stats: { total: 0, escalated: 0, red: 0, athletes: 0 }, groups: [], offline: true };
}

async function generateFollowUpQueue(date) {
  const res = await api.call('coachApi', { action: 'generate', date: date });
  if (res && res.ok) return decorate(res);
  const cache = read(KEY_QUEUE, null);
  if (cache) return decorate(Object.assign({ offline: true }, cache));
  return { date: date, stats: { total: 0, escalated: 0, red: 0, athletes: 0 }, groups: [], offline: true };
}

function cacheQueue(queue) {
  write(KEY_QUEUE, { date: queue.date, groups: queue.groups, stats: queue.stats, items: queue.items || [] });
}

async function confirmFollowUp(itemId, editedText, note) {
  const res = await api.call('coachApi', { action: 'confirm', itemId: itemId, editedText: editedText, note: note });
  if (res && res.ok) return res;
  // 离线：本机生成提醒并标注状态
  const cache = read(KEY_QUEUE, null);
  let reminder = null;
  if (cache) {
    cache.groups.forEach(function (g) {
      g.items = g.items.map(function (i) {
        if (i.id !== itemId) return i;
        i.status = 'confirmed';
        reminder = fu.buildReminder(i, editedText, 'local-coach');
        return i;
      });
    });
    write(KEY_QUEUE, cache);
  }
  if (reminder) {
    const list = read(KEY_REMIND, []);
    list.push(reminder);
    write(KEY_REMIND, list);
  }
  return { ok: true, offline: true, reminder: reminder };
}

async function dismissFollowUp(itemId, reason) {
  const res = await api.call('coachApi', { action: 'dismiss', itemId: itemId, reason: reason || '' });
  if (res && res.ok) return res;
  const cache = read(KEY_QUEUE, null);
  if (cache) {
    cache.groups.forEach(function (g) {
      g.items.forEach(function (i) { if (i.id === itemId) { i.status = 'dismissed'; i.nutritionistNote = reason || ''; } });
    });
    write(KEY_QUEUE, cache);
  }
  return { ok: true, offline: true };
}

async function snoozeFollowUp(itemId, days) {
  const res = await api.call('coachApi', { action: 'snooze', itemId: itemId, days: days || 1 });
  if (res && res.ok) return res;
  return { ok: true, offline: true };
}

async function getHistory() {
  const res = await api.call('coachApi', { action: 'history' });
  if (res && res.ok) return res;
  return { ok: true, items: [], offline: true };
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
  getHistory: getHistory,
  localReminders: localReminders,
  cacheQueue: cacheQueue,
  reviewMap: reviewMap
};
