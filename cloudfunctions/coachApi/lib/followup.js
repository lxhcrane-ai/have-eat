// 跟进队列：把"规则引擎的全部告警"收敛成"营养师今天必须处理的 N 件事"。
// 纯函数实现（无 wx.* / 无数据库依赖），云函数、离线模式、测试共用同一份。
//
// 数据流：
//   当日 logs -> rules.evaluate -> feedback.alerts（带 ruleId / requiresFollowUp）
//   -> candidatesFromFeedback() 只留 requiresHumanFollowUp 的规则
//   -> mergeHistory() 合并同一拳手同一规则的连续未解决天数
//   -> escalate() 连续 2 天 / 晨脉连续偏高 / 周降幅 >1% 自动升级置顶
//   -> groupByAthlete() 给营养师后台分组
//   营养师 confirm(item, editedText) -> 次日 reminders（拳王端只看到这条）

const rules = require('./rules.js');
const REG = require('./ruleRegistry.js');

const ACTIVE_STREAK_STATUS = ['pending', 'snoozed'];
const ESCALATE_IMMEDIATE = ['PHASE-01'];        // 体重周降幅 > 1%：单次即需人工介入
const ESCALATE_AFTER_DAYS = 2;                  // 连续 2 天未解决即升级

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function dayStr(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dayStr(d);
}

function nextDateOf(date) { return shiftDate(date, 1); }

// 规则级别的跟进动作建议（比原始告警文案更像"给人做的事"）
const ACTIONS = {
  'HYD-01': '让拳王今晚按失重 ×1.25–1.5 补含钠液体，明早复称并记录尿色',
  'HYD-04': '确认称重后 2h 内已补 ≥1000ml 口服补液盐，未达标则电话跟进',
  'HYD-05': '核对今日计划补液量与实际量，偏差 >20% 时调整剩余时段分配',
  'PRO-01': '给出一次具体补法（如 150g 鸡胸 / 30g 乳清），并要求当天回传餐照',
  'ENE-01': '核对是否漏记高热量食物；确认缺口在 300–600 kcal 区间',
  'PHASE-01': '暂停加深缺口，先看 7 日均值；必要时安排 refeed',
  'PHASE-02': '确认增重来自肌肉还是脂肪，决定是否提前切到减脂期',
  'SLE-01': '问清入睡时间与夜醒次数，给出今晚作息要求',
  'REC-01': '把称重后碳水目标写成具体食物与时间点，要求回传',
  'REC-02': '与教练确认明日课程调整（改技术课/降量），并写入次日计划',
  'REC-03': '连续晨脉偏高：减量 10–20%，排查睡眠、脱水与感染',
  'REC-04': '继续按 1–1.5 L/h 补液并补糖，2h 后复称',
  'GI-01': '降低纤维与脂肪、缩小单次进食体积；持续呕吐/腹泻转就医',
  'LOG-01': '提醒补齐本阶段必填项（' + '缺哪项补哪项' + '），否则评分无效',
  'SUP-01': '确认补剂是否随身，给出今天的服用时间点'
};

function suggestedActionFor(ruleId, alert) {
  return ACTIONS[ruleId] || (alert && alert.text) || '按规则建议跟进';
}

function ruleMeta(ruleId) {
  const r = REG.getRule(ruleId);
  return {
    ruleId: ruleId,
    ruleName: r ? r.name : ruleId,
    requiresFollowUp: !!(r && r.requiresHumanFollowUp),
    reviewStatus: r ? r.reviewStatus : 'active',
    sources: r ? r.sources : []
  };
}

function itemId(athleteId, date, ruleId) {
  return athleteId + ':' + date + ':' + ruleId;
}

// 从一份评估结果抽出候选（只留 requiresHumanFollowUp 的规则，info 级别不进队列）
function candidatesFromFeedback(athlete, feedback, date) {
  const out = [];
  (feedback.alerts || []).forEach(function (a) {
    if (!a.requiresFollowUp === false) { /* 占位，保持可读 */ }
    if (!a.requiresFollowUp) return;              // 规则登记表标了 false 的规则不推给人
    if (a.level !== 'red' && a.level !== 'amber') return;
    const id = itemId(athlete.athleteId, date, a.ruleId);
    out.push({
      id: id,
      athleteId: athlete.athleteId,
      athleteName: athlete.name || '拳王',
      athletePhase: feedback.phase,
      date: date,
      ruleId: a.ruleId,
      ruleName: a.ruleName || ruleMeta(a.ruleId).ruleName,
      level: a.level,
      title: a.title,
      evidence: a.evidence || '',
      suggestedAction: suggestedActionFor(a.ruleId, a),
      status: 'pending',
      nutritionistNote: '',
      nextReminderDate: '',
      consecutiveDays: 1,
      escalated: false,
      escalationReason: '',
      requiresFollowUp: true,
      code: a.code,
      createdAt: '',
      updatedAt: ''
    });
  });
  return mergeCandidates(out);
}

// 同一规则同一天可能出多条（如 REC-02 同时报"酸痛 8/10"和"计划冲突"）。
// 跟进项 id 按 athlete+date+ruleId 生成，必须合并成一条，否则会互相覆盖。
function mergeCandidates(cands) {
  const out = [];
  const at = {};
  cands.forEach(function (c) {
    const k = c.ruleId;
    if (at[k] === undefined) { at[k] = out.length; out.push(c); return; }
    const cur = out[at[k]];
    const curIsActionable = cur.code === 'plan-conflict';
    const newIsActionable = c.code === 'plan-conflict';
    if (newIsActionable && !curIsActionable) {
      c.evidence = [cur.evidence, c.evidence].filter(Boolean).join('；');
      if (cur.level === 'red') c.level = 'red';
      out[at[k]] = c;
    } else {
      cur.evidence = [cur.evidence, c.evidence].filter(Boolean).join('；');
      if (c.level === 'red') cur.level = 'red';
    }
  });
  return out;
}

// 在历史里回溯连续天数（只看 pending / snoozed，已确认或已忽略视为断裂）
function streakDays(athleteId, ruleId, date, history) {
  let n = 0;
  const byKey = {};
  (history || []).forEach(function (h) {
    if (h.athleteId !== athleteId || h.ruleId !== ruleId) return;
    byKey[h.date] = h;
  });
  let cursor = shiftDate(date, -1);
  for (let i = 0; i < 30; i++) {
    const h = byKey[cursor];
    if (!h) break;
    if (ACTIVE_STREAK_STATUS.indexOf(h.status) < 0) break;
    n += 1;
    cursor = shiftDate(cursor, -1);
  }
  return n;
}

function escalationFor(item, consecutiveDays) {
  const reasons = [];
  if (ESCALATE_IMMEDIATE.indexOf(item.ruleId) >= 0) {
    reasons.push('规则设定：' + item.ruleId + ' 单次触发即需人工介入');
  }
  if (consecutiveDays >= ESCALATE_AFTER_DAYS) {
    reasons.push('连续 ' + consecutiveDays + ' 天未解决');
  }
  if (item.ruleId === 'REC-03' && /\+ ?(\d+)/.test(item.evidence || '')) {
    const m = (item.evidence || '').match(/\+ ?(\d+)/);
    if (m && Number(m[1]) >= 8) reasons.push('晨脉偏离 ≥8 次/分');
  }
  return reasons;
}

// 主入口
// input = { date, athletes:[{athleteId,name,phase,log,feedback|log}], history:[items], now }
function generateQueue(input) {
  const date = input.date;
  const history = input.history || [];
  const athletes = input.athletes || [];
  const now = input.now || new Date().toISOString();
  const items = [];
  const byAthlete = {};

  athletes.forEach(function (a) {
    let fb = a.feedback;
    if (!fb) {
      // 没给评估结果时现场算一次（云函数/脚本都走这条）
      fb = rules.evaluate(a.log, {
        profile: a.profile || { phase: a.phase },
        phase: a.phase,
        recentMorningWeights: a.recentMorningWeights || []
      });
    }
    const cands = candidatesFromFeedback({ athleteId: a.athleteId, name: a.name }, fb, date);
    const prevCount = byAthlete[a.athleteId] ? byAthlete[a.athleteId].count : 0;
    byAthlete[a.athleteId] = {
      athleteId: a.athleteId,
      name: a.name || '拳王',
      phase: fb.phase,
      phaseLabel: fb.phaseLabel,
      date: date,
      score: fb.score,
      count: prevCount + cands.length,
      maxLevel: 'amber',
      escalated: 0
    };
    cands.forEach(function (item) {
      const streak = streakDays(a.athleteId, item.ruleId, date, history);
      item.consecutiveDays = streak + 1;
      const reasons = escalationFor(item, item.consecutiveDays);
      if (reasons.length) {
        item.escalated = true;
        item.escalationReason = reasons.join('；');
        if (item.level === 'amber') item.level = 'red';   // 升级即以最高级别呈现
      }
      item.createdAt = now;
      item.updatedAt = now;
      items.push(item);
      if (item.escalated) byAthlete[a.athleteId].escalated += 1;
      if (item.level === 'red') byAthlete[a.athleteId].maxLevel = 'red';
    });
  });

  items.sort(function (x, y) {
    if (x.escalated !== y.escalated) return x.escalated ? -1 : 1;
    const lv = { red: 0, amber: 1, info: 2 };
    if (lv[x.level] !== lv[y.level]) return lv[x.level] - lv[y.level];
    if (x.consecutiveDays !== y.consecutiveDays) return y.consecutiveDays - x.consecutiveDays;
    return x.athleteName.localeCompare(y.athleteName, 'zh');
  });

  return {
    date: date,
    items: items,
    groups: Object.keys(byAthlete).map(function (k) { return byAthlete[k]; })
      .sort(function (a, b) {
        if (a.escalated !== b.escalated) return b.escalated - a.escalated;
        return b.count - a.count;
      }),
    stats: {
      total: items.length,
      escalated: items.filter(function (i) { return i.escalated; }).length,
      red: items.filter(function (i) { return i.level === 'red'; }).length,
      athletes: Object.keys(byAthlete).length
    }
  };
}

// 营养师确认：生成次日提醒（拳王端只看到这一条，文案可被营养师改写）
function buildReminder(item, editedText, nutritionistId, date) {
  const text = (editedText || '').trim() || defaultReminderText(item);
  return {
    id: 'rem_' + item.id + '_' + (date || nextDateOf(item.date)),
    fromItemId: item.id,
    athleteId: item.athleteId,
    athleteName: item.athleteName,
    ruleId: item.ruleId,
    date: date || nextDateOf(item.date),          // 拳王看到的日期 = 次日
    text: text,
    sourceTitle: item.title,
    nutritionistId: nutritionistId || '',
    read: false,
    createdAt: new Date().toISOString()
  };
}

function defaultReminderText(item) {
  return '昨天「' + item.title + '」。今天：' + item.suggestedAction;
}

// 营养师后台分组视图：只显示 pending / 升级项，历史另取
function groupForNutritionist(items) {
  const shown = (items || []).filter(function (i) {
    return i.status === 'pending' || i.status === 'snoozed';
  });
  const map = {};
  shown.forEach(function (i) {
    if (!map[i.athleteId]) {
      map[i.athleteId] = {
        athleteId: i.athleteId, name: i.athleteName, date: i.date,
        items: [], count: 0, escalated: 0, maxLevel: 'amber'
      };
    }
    const g = map[i.athleteId];
    g.items.push(i);
    g.count += 1;
    if (i.escalated) g.escalated += 1;
    if (i.level === 'red') g.maxLevel = 'red';
  });
  const groups = Object.keys(map).map(function (k) { return map[k]; });
  groups.forEach(function (g) {
    g.items.sort(function (a, b) {
      if (a.escalated !== b.escalated) return a.escalated ? -1 : 1;
      if (a.level !== b.level) return a.level === 'red' ? -1 : 1;
      return b.consecutiveDays - a.consecutiveDays;
    });
  });
  groups.sort(function (a, b) {
    if (a.escalated !== b.escalated) return b.escalated - a.escalated;
    return b.count - a.count;
  });
  return groups;
}

module.exports = {
  generateQueue: generateQueue,
  candidatesFromFeedback: candidatesFromFeedback,
  groupForNutritionist: groupForNutritionist,
  buildReminder: buildReminder,
  defaultReminderText: defaultReminderText,
  shiftDate: shiftDate,
  nextDateOf: nextDateOf,
  streakDays: streakDays,
  ruleMeta: ruleMeta,
  ACTIONS: ACTIONS,
  ESCALATE_IMMEDIATE: ESCALATE_IMMEDIATE
};
