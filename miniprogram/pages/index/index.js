const rules = require('../../utils/rules.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const api = require('../../utils/api.js');

const PHASE_LABEL = { maintain: '维持期', cut: '减脂期', weighin: '微调期', recover: '恢复期' };

Page({
  data: {
    date: '', wd: '', hasLog: false, offline: false, loading: true,
    f: null, metrics: [], alerts: [], tips: [], headline: '',
    score: 0, level: '--', tone: 'info',
    phaseLabel: '', daysToWeigh: null, unread: 0, coachName: '教练'
  },

  onShow() { this.load(); },

  async load() {
    const date = fmt.todayStr();
    const wd = fmt.weekday(date);
    let profile = wx.getStorageSync('profile') || {};
    let log = store.get(date);
    let cloudFb = null;
    let offline = false;

    const cloud = await api.call('getFeed', { date: date });
    if (cloud.ok) {
      if (cloud.profile && Object.keys(cloud.profile).length) {
        profile = cloud.profile;
        wx.setStorageSync('profile', profile);
      }
      if (cloud.today && cloud.today.payload) {
        log = cloud.today.payload;
        store.upsert(log);
      }
      cloudFb = cloud.today && cloud.today.feedbackLive;
    } else {
      offline = true;
    }

    let f = cloudFb;
    if (!f && log) {
      f = rules.evaluate(log, { profile: profile, recentMorningWeights: store.morningWeights(14) });
    }

    this.render(f, log, profile, date, wd, offline);
    this.loadInbox();
  },

  render(f, log, profile, date, wd, offline) {
    if (!f) {
      this.setData({
        date: date, wd: wd, hasLog: false, offline: offline, loading: false,
        phaseLabel: PHASE_LABEL[profile.phase] || '未设阶段',
        daysToWeigh: this.daysToWeigh(profile),
        f: null, metrics: [], alerts: [], tips: [], score: 0, level: '--', tone: 'info',
        headline: '今天还没填。填完立刻出营养反馈。'
      });
      return;
    }

    const kbMap = rules.KB_MAP;
    const alerts = (f.alerts || []).map(function (a) {
      return {
        level: a.level,
        title: a.title,
        text: a.text,
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
      { label: '训练脱水', value: f.hydration.pct === null ? '--' : f.hydration.pct, unit: '%', tone: f.hydration.level === 'red' ? 'red' : (f.hydration.level === 'amber' ? 'amber' : '') },
      { label: '蛋白', value: f.protein.actualG, unit: '/ ' + (f.protein.targetG || '--') + 'g', tone: f.protein.level === 'red' ? 'red' : (f.protein.level === 'amber' ? 'amber' : '') },
      { label: '摄入', value: f.totals.kcal, unit: 'kcal', tone: '' },
      { label: '酸痛峰', value: f.recovery.sorenessMax === null ? '--' : f.recovery.sorenessMax, unit: '/10', tone: f.recovery.level === 'red' ? 'red' : (f.recovery.level === 'amber' ? 'amber' : '') },
      { label: '睡眠', value: f.recovery.sleepHours === null ? '--' : f.recovery.sleepHours, unit: 'h', tone: (f.recovery.sleepHours !== null && f.recovery.sleepHours < 6.5) ? 'amber' : '' }
    ];

    this.setData({
      date: date, wd: wd, hasLog: true, offline: offline, loading: false,
      f: f,
      headline: f.headline,
      score: f.score,
      level: f.level,
      tone: f.levelTone,
      metrics: metrics,
      alerts: alerts,
      tips: f.tips || [],
      phaseLabel: PHASE_LABEL[f.phase] || '未设阶段',
      daysToWeigh: this.daysToWeigh(profile)
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
  goChat() { wx.navigateTo({ url: '/pages/chat/chat' }); }
});
