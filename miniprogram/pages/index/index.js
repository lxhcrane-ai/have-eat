const rules = require('../../utils/rules.js');
const goals = require('../../utils/goals.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const api = require('../../utils/api.js');
const adviceCache = require('../../utils/adviceCache.js');
const privacy = require('../../utils/privacy.js');
const historySync = require('../../utils/historySync.js');

const PHASE_LABEL = { maintain: '维持期', cut: '减脂期', peak: '微调期', recover: '恢复期' };

function pubText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = fmt.todayStr(d);
  const label = day === fmt.todayStr() ? '今天' : (day.slice(5, 7) + '月' + day.slice(8, 10) + '日');
  return label + ' ' + fmt.timeStr(d);
}

Page({
  data: {
    date: '', wd: '', hasLog: false, isDemo: false, offline: false, loading: true,
    f: null, metrics: [], alerts: [], tips: [], headline: '',
    score: 0, level: '--', tone: 'info',
    phaseLabel: '', phaseGoal: '', daysToWeigh: null, unread: 0, coachName: '教练',
    reminders: [], missingRequired: [], suppressedCount: 0,
    advice: null, adviceHint: '', goalView: null
  },

  onLoad() { privacy.lockShare(); },
  onShow() { this.load(); },

  async load() {
    const date = fmt.todayStr();
    const wd = fmt.weekday(date);
    let profile = wx.getStorageSync('profile') || {};
    let log = store.get(date);
    let offline = false;
    let reminders = [];

    // 建议与首页数据并行拉取；建议失败不影响其余内容
    const results = await Promise.all([
      api.call('getFeed', { date: date }),
      api.call('advice', { action: 'get', date: date }).catch(function () {
        return { ok: false, offline: true };
      })
    ]);
    const cloud = results[0];
    const adviceRes = results[1];

    if (cloud.ok) {
      if (cloud.profile && Object.keys(cloud.profile).length) {
        profile = cloud.profile;
        wx.setStorageSync('profile', profile);
      }
      // 一次把云端近 14 条批量合并进本机：按 date 去重、云端优先，
      // 但本机 pending_sync 与演示数据由 historySync 按优先级处理。
      const cloudHistory = (cloud.logs || []).slice();
      if (cloud.today && cloud.today.payload) cloudHistory.push({ payload: cloud.today.payload });
      const synced = historySync.absorb(cloudHistory);
      this.showHistoryHint(synced);
      log = store.get(date) || (cloud.today && cloud.today.payload) || null;
      reminders = cloud.reminders || [];
    } else {
      offline = true;
    }

    // 离线时用本机残留的提醒（营养师端在同一台设备演示时能看到）
    if (!reminders.length) {
      try { reminders = require('../../utils/coachApi.js').localReminders(date); } catch (e) { reminders = []; }
    }

    // 服务端 feedback 可能是旧规则版本；展示前统一用本地 rules.evaluate 重算。
    let f = null;
    if (log) {
      f = rules.evaluate(log, { profile: profile, recentMorningWeights: store.morningWeights(14) });
    }

    this.render(f, log, profile, date, wd, offline, reminders);
    this.renderAdvice(adviceRes, date, !!(f && log));
    this.loadInbox();
  },

  // 历史下沉出问题时明确提示，不静默丢数据
  showHistoryHint(synced) {
    if (!synced) return;
    if (synced.storageFull) {
      wx.showToast({ title: '本机存储不足，云端历史未完整保存', icon: 'none' });
    } else if (synced.trimmed) {
      wx.showToast({ title: '本机保留最近记录，更早记录仍在云端', icon: 'none' });
    }
  },

  // 营养师建议卡：只认 advice get 返回的已发布结构，草稿本就不会下发
  renderAdvice(res, date, hasLog) {
    if (res && res.ok) {
      const a = res.advice;
      if (a && a.status === 'published') {
        adviceCache.writeCurrent(date, a);
        this.setData({ advice: this.adviceView(a, false), adviceHint: '' });
        return;
      }
      // 服务端明确返回无已发布建议：清掉当天旧缓存，离线时不再复活过期版本
      adviceCache.clearCurrent(date);
      this.setData({
        advice: null,
        adviceHint: hasLog ? '今天还没有营养师审阅建议，下面是系统自动建议，仅供参考。' : ''
      });
      return;
    }

    // 拉取失败：只读当天的本机缓存并标注；跨天缓存不再展示，避免过期版本
    const cached = adviceCache.readCurrent(date);
    if (cached && cached.advice && cached.advice.status === 'published') {
      this.setData({ advice: this.adviceView(cached.advice, true), adviceHint: '' });
      return;
    }
    this.setData({
      advice: null,
      adviceHint: hasLog ? '营养师建议暂时无法获取（离线），联网后可查看。下面是系统自动建议。' : ''
    });
  },

  adviceView(a, offline) {
    const ruleChips = (a.ruleIds || []).map(function (id) {
      const r = rules.getRuleById(id);
      return { id: id, name: (r && r.name) || id };
    });
    const kbChips = (a.kbIds || []).map(function (id) {
      const k = rules.KB_MAP[id];
      return { id: id, title: (k && k.title) || id };
    });
    return {
      id: a.id || '',
      body: a.body || '',
      coachName: a.coachName || '营养师',
      publishedText: pubText(a.publishedAt),
      ruleChips: ruleChips,
      kbChips: kbChips,
      updated: !!a.editedAfterPublish || (Number(a.version) || 0) > 1,
      offline: !!offline
    };
  },

  render(f, log, profile, date, wd, offline, reminders) {
    if (!f) {
      this.setData({
        date: date, wd: wd, hasLog: false, isDemo: false, offline: offline, loading: false,
        phaseLabel: PHASE_LABEL[profile.phase] || '未设阶段',
        daysToWeigh: this.daysToWeigh(profile),
        f: null, metrics: [], alerts: [], tips: [], score: 0, level: '--', tone: 'info',
        headline: '今天还没填。填完立刻出营养反馈。',
        reminders: reminders || [],
        missingRequired: [], suppressedCount: 0, goalView: null
      });
      return;
    }

    const kbMap = rules.KB_MAP;
    const alerts = (f.alerts || []).map(function (a) {
      const rule = a.ruleId ? rules.getRuleById(a.ruleId) : null;
      const srcs = (a.sources || (rule ? rule.sources : [])).map(function (s) {
        return {
          typeName: rules.SOURCE_TYPES.filter(function (t) { return t.id === s.sourceType; }).map(function (t) { return t.name; })[0] || s.sourceType,
          year: s.year,
          anchor: s.anchor,
          doi: s.doi || '',
          citation: s.citation
        };
      });
      return {
        ruleId: a.ruleId || '',
        ruleName: a.ruleName || (rule ? rule.name : ''),
        level: a.level,
        title: a.title,
        text: a.text,
        evidence: a.evidence || '',
        reviewStatus: a.reviewStatus || 'active',
        reviewStatusName: a.reviewStatusName || '',
        sources: srcs,
        kbTitles: (a.kb || []).map(function (id) {
          return kbMap[id] ? kbMap[id].title : '';
        }).filter(function (t) { return !!t; }),
        open: false
      };
    });

    // 漏记提醒：晚上 8 点后仍不足 2 餐
    const hour = new Date().getHours();
    if (hour >= 20 && f.totals.count < 2) {
      alerts.push({
        level: 'amber',
        title: '今天只记录了 ' + f.totals.count + ' 餐',
        text: '少于 2 餐的结构化记录无法评估能量和蛋白，今天的评分只代表已记录部分。补记一下，或者明天每餐随手拍一张。',
        kbTitles: [rules.KB_MAP['basic-logging'] ? rules.KB_MAP['basic-logging'].title : ''],
        open: false
      });
    }

    const metrics = [
      { label: '晨重', value: f.bw || '--', unit: 'kg', tone: '' },
      { label: '训练脱水', value: f.hydration.mode === 'plan' ? (f.hydration.planRate === null ? '--' : f.hydration.planRate) : (f.hydration.pct === null ? '--' : f.hydration.pct), unit: f.hydration.mode === 'plan' ? '% 计划' : '%', tone: f.hydration.level === 'red' ? 'red' : (f.hydration.level === 'amber' ? 'amber' : '') },
      { label: '蛋白', value: f.protein.actualG, unit: '/ ' + (f.protein.targetG || '--') + 'g', tone: f.protein.level === 'red' ? 'red' : (f.protein.level === 'amber' ? 'amber' : '') },
      { label: '摄入', value: f.totals.kcal, unit: 'kcal', tone: '' },
      { label: '酸痛峰', value: f.recovery.sorenessMax === null ? '--' : f.recovery.sorenessMax, unit: '/10', tone: f.recovery.level === 'red' ? 'red' : (f.recovery.level === 'amber' ? 'amber' : '') },
      { label: '睡眠', value: f.recovery.sleepHours === null ? '--' : f.recovery.sleepHours, unit: 'h', tone: (f.recovery.sleepHours !== null && f.recovery.sleepHours < (f.phase === 'peak' ? 7 : 6.5)) ? 'amber' : '' }
    ];

    const goalView = goals.goalView(f.goalPlan, f.goalAdherence, f.goalBlockers, { targetWeightKg: profile.targetWeightKg });

    this.setData({
      date: date, wd: wd, hasLog: true, isDemo: store.isDemo(log), offline: offline, loading: false,
      f: f,
      headline: f.headline,
      score: f.score,
      level: f.level,
      tone: f.levelTone,
      metrics: metrics,
      alerts: alerts,
      tips: f.tips || [],
      phaseLabel: PHASE_LABEL[f.phase] || '未设阶段',
      phaseGoal: (f.phaseProfile && f.phaseProfile.goal) || '',
      daysToWeigh: this.daysToWeigh(profile),
      reminders: reminders || [],
      missingRequired: f.missingRequired || [],
      suppressedCount: (f.suppressed || []).length,
      goalView: goalView
    });
  },

  daysToWeigh(profile) {
    if (!profile || !profile.weighInDate) return null;
    const d = fmt.daysBetween(fmt.todayStr(), profile.weighInDate);
    return d;
  },

  async loadInbox() {
    const res = await api.call('inbox', {});
    if (res.ok) this.setData({ unread: res.unread || 0 });
  },

  toggleKb(e) {
    const i = e.currentTarget.dataset.i;
    const key = 'alerts[' + i + '].open';
    const obj = {};
    obj[key] = !this.data.alerts[i].open;
    this.setData(obj);
  },

  goLog() { wx.switchTab({ url: '/pages/log/log' }); },
  goTrend() { wx.switchTab({ url: '/pages/trend/trend' }); },
  goCoach() { wx.navigateTo({ url: '/pages/coach/coach' }); },
  goChat() { wx.navigateTo({ url: '/pages/chat/chat' }); },
  goInbox() { wx.navigateTo({ url: '/pages/inbox/inbox' }); },

  // 依据 chip：规则进规则库并定位，知识库用 storage 传 id（tabBar 页收不到 query）
  goRuleChip(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/rules/rules?ruleId=' + id });
  },
  goKbChip(e) {
    const id = e.currentTarget.dataset.id;
    wx.setStorageSync('kb_focus', id);
    wx.switchTab({ url: '/pages/kb/kb' });
  },
  goAdviceHistory() { wx.navigateTo({ url: '/pages/advice/advice' }); }
});
