const weekly = require('../../utils/weekly.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const api = require('../../utils/api.js');

Page({
  data: {
    endDate: '', fromDate: '', days: 7,
    loading: true, offline: false, isCoachView: false, athleteName: '',
    w: null, error: '',
    maxHit: 1
  },

  onLoad(query) {
    const endDate = (query && query.endDate) || fmt.todayStr();
    this.setData({ endDate: endDate, athleteId: (query && query.athleteId) || '' });
  },

  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    const endDate = this.data.endDate;
    const profile0 = wx.getStorageSync('profile') || {};
    let logs = [];
    let profile = profile0;
    let isCoachView = false;
    let athleteName = '';

    if (this.data.athleteId) {
      // 教练查看某个拳王的周报
      const res = await api.call('getFeed', { action: 'detail', athleteId: this.data.athleteId });
      if (res.ok) {
        isCoachView = true;
        logs = (res.logs || []).map(function (x) { return x.payload; }).filter(Boolean);
        const a = (res.athletes || []).filter(function (x) { return x.openid === this.data.athleteId; }.bind(this))[0];
        if (a) {
          profile = a.profile || {};
          athleteName = a.name || '拳王';
        }
      }
    }
    if (!logs.length) {
      logs = store.recent(30);
    }

    const w = weekly.buildWeekly({ logs: logs, profile: profile, endDate: endDate, days: this.data.days });
    const maxHit = Math.max.apply(null, w.ruleHits.map(function (h) { return h.count; }).concat([1]));

    this.setData({
      loading: false,
      w: w,
      fromDate: w.fromDate,
      profile: profile,
      isCoachView: isCoachView,
      athleteName: athleteName,
      offline: !this.data.athleteId && logs.length === 0,
      maxHit: maxHit
    });
  },

  prevWeek() {
    this.setData({ endDate: weekly.shift(this.data.endDate, -7) });
    this.load();
  },
  nextWeek() {
    const next = weekly.shift(this.data.endDate, 7);
    if (next > fmt.todayStr()) { wx.showToast({ title: '还没到下周', icon: 'none' }); return; }
    this.setData({ endDate: next });
    this.load();
  },
  thisWeek() {
    this.setData({ endDate: fmt.todayStr() });
    this.load();
  },

  copyText() {
    const text = this.data.w && this.data.w.text;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success() { wx.showToast({ title: '周报已复制，可粘贴给教练', icon: 'none' }); }
    });
  },

  goLog() { wx.switchTab({ url: '/pages/log/log' }); }
});
