const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');

Page({
  data: {
    isCoach: false, athletes: [], unread: 0, loading: true,
    detailOpen: '', detailLogs: [], error: ''
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
        reds: reds.slice(0, 3),
        targets: (a.profile && a.profile.weighInDate) ? ('距称重 ' + fmt.daysBetween(fmt.todayStr(), a.profile.weighInDate) + ' 天') : ''
      };
    });
    this.setData({ isCoach: isCoach, athletes: athletes, unread: athletes.length ? athletes[0].unreadTotal || 0 : 0, loading: false, error: '' });
  },

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
