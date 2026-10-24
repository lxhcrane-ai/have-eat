const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');
const coachApi = require('../../utils/coachApi.js');
const rules = require('../../utils/rules.js');

const PHASES = [
  { id: 'maintain', name: '维持期' }, { id: 'cut', name: '减脂期' },
  { id: 'peak', name: '微调期' }, { id: 'recover', name: '恢复期' }
];

Page({
  data: {
    isCoach: false, athletes: [], unread: 0, loading: true,
    detailOpen: '', detailLogs: [], error: '',
    phases: PHASES,
    queue: { pending: 0, escalated: 0 }
  },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); wx.stopPullDownRefresh(); },

  async load() {
    const res = await api.call('getFeed', {});
    if (!res.ok) {
      this.setData({ loading: false, error: res.error || '加载失败' });
      return;
    }
    const isCoach = res.role === 'coach';
    const athletes = (res.athletes || []).map(function (a) {
      const f = a.lastFeedback || {};
      const phase = rules.resolvePhase((a.profile && a.profile.phase) || 'maintain');
      const reds = (f.alerts || []).filter(function (x) { return x.level === 'red'; });
      return {
        openid: a.openid,
        name: a.name,
        date: a.lastDate || '未记录',
        score: f.score === undefined ? '--' : f.score,
        level: f.level || '--',
        tone: f.score >= 85 ? 'ok' : (f.score >= 70 ? 'ok' : (f.score >= 55 ? 'amber' : (f.score === undefined ? 'info' : 'red'))),
        summary: f.summary || '',
        headline: f.headline || '',
        phase: phase,
        phaseLabel: rules.phaseLabel(phase),
        reds: reds.slice(0, 3),
        targets: (a.profile && a.profile.weighInDate) ? ('距称重 ' + fmt.daysBetween(fmt.todayStr(), a.profile.weighInDate) + ' 天') : ''
      };
    });
    this.setData({
      isCoach: isCoach,
      athletes: athletes,
      queue: res.queue || { pending: 0, escalated: 0 },
      unread: athletes.length ? athletes[0].unreadTotal || 0 : 0,
      loading: false, error: ''
    });
  },

  // 阶段切换：营养师后台唯一入口（拳王端只读）
  async setPhase(e) {
    const ds = e.currentTarget.dataset;
    const res = await coachApi.setAthletePhase(ds.id, ds.phase);
    wx.showToast({
      title: res.ok ? '已切到' + rules.phaseLabel(ds.phase) : '失败',
      icon: 'none'
    });
    if (res.ok) this.load();
  },

  goQueue() { wx.navigateTo({ url: '/pages/queue/queue' }); },
  goRules() { wx.navigateTo({ url: '/pages/rules/rules' }); },

  async openDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.detailOpen === id) { this.setData({ detailOpen: '', detailLogs: [] }); return; }
    const res = await api.call('getFeed', { action: 'detail', athleteId: id });
    if (!res.ok) { wx.showToast({ title: res.error || '加载失败', icon: 'none' }); return; }
    this.setData({
      detailOpen: id,
      detailLogs: (res.logs || []).map(function (l) {
        const p = l.payload || {};
        const f = l.feedback || {};
        return {
          date: l.date,
          score: f.score,
          kg: (p.weights && p.weights.morning && p.weights.morning.kg) || '--',
          protein: f.proteinG,
          target: f.proteinTargetG,
          dehydration: f.dehydrationPct,
          soreness: f.sorenessMax,
          srpe: f.sRPE,
          headline: f.headline || '',
          reds: (f.alerts || []).filter(function (x) { return x.level === 'red'; })
        };
      })
    });
  },

  goChat(e) {
    const ds = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/chat/chat?athleteId=' + ds.id + '&name=' + encodeURIComponent(ds.name || '拳王') });
  },

  goBind() { wx.navigateTo({ url: '/pages/bind/bind?asCoach=1' }); },
  goHome() { wx.switchTab({ url: '/pages/index/index' }); }
});
