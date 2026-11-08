const coachApi = require('../../utils/coachApi.js');
const fmt = require('../../utils/format.js');
const privacy = require('../../utils/privacy.js');

Page({
  data: {
    date: '', loading: true, offline: false,
    tab: 'todo',
    stats: { total: 0, escalated: 0, red: 0, athletes: 0, snoozed: 0 },
    groups: [], snoozedGroups: [], unsynced: 0,
    history: [], historyLoading: false,
    error: ''
  },

  onLoad(query) {
    privacy.lockShare();
    const date = (query && query.date) || fmt.todayStr();
    this.setData({ date: date });
  },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); wx.stopPullDownRefresh(); },

  async load() {
    this.setData({ loading: true, error: '' });
    const res = await coachApi.getQueueForNutritionist(this.data.date);
    this.setData({
      loading: false,
      offline: !!res.offline,
      stats: res.stats,
      groups: res.groups || [],
      snoozedGroups: res.snoozedGroups || [],
      unsynced: res.unsynced || 0
    });
  },

  async refreshQueue() {
    wx.showLoading({ title: '重新生成…' });
    const res = await coachApi.generateFollowUpQueue(this.data.date);
    wx.hideLoading();
    this.setData({
      stats: res.stats,
      groups: res.groups || [],
      snoozedGroups: res.snoozedGroups || [],
      unsynced: res.unsynced || 0,
      offline: !!res.offline
    });
    coachApi.cacheQueue(res);
    wx.showToast({ title: res.offline ? '离线：队列未更新' : '已刷新 ' + res.stats.total + ' 项', icon: 'none' });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab: tab });
    if (tab === 'history' && !this.data.history.length) this.loadHistory();
  },

  async loadHistory() {
    this.setData({ historyLoading: true });
    const res = await coachApi.getHistory();
    this.setData({ historyLoading: false, history: res.items || [] });
  },

  onRemind(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const key = 'groups[' + gi + '].items[' + ii + '].reminderText';
    const obj = {}; obj[key] = e.detail.value; this.setData(obj);
  },
  onNote(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const key = 'groups[' + gi + '].items[' + ii + '].note';
    const obj = {}; obj[key] = e.detail.value; this.setData(obj);
  },

  async confirm(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const item = this.data.groups[gi].items[ii];
    wx.showLoading({ title: '发送中…' });
    const res = await coachApi.confirmFollowUp(item.id, item.reminderText, item.note);
    wx.hideLoading();
    if (res && res.ok) {
      wx.showToast({ title: '已排入次日提醒', icon: 'none' });
      this.load();
    } else {
      wx.showToast({ title: (res && res.error) || '失败', icon: 'none' });
    }
  },

  dismiss(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const item = this.data.groups[gi].items[ii];
    const that = this;
    wx.showModal({
      title: '忽略这一项？',
      content: '忽略后不再累计连续天数，也不会给拳王发提醒。备注会记录在历史里。',
      confirmText: '忽略',
      success: async function (r) {
        if (!r.confirm) return;
        const res = await coachApi.dismissFollowUp(item.id, item.note || '营养师判断无需跟进');
        wx.showToast({ title: res.ok ? '已忽略' : '失败', icon: 'none' });
        that.load();
      }
    });
  },

  async snooze(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const item = this.data.groups[gi].items[ii];
    const res = await coachApi.snoozeFollowUp(item.id, 1);
    if (!res || !res.ok) {
      wx.showToast({ title: (res && res.error) || '稍后失败', icon: 'none' });
      return;
    }
    wx.showToast({
      title: res.pendingSync
        ? '已本机稍后至 ' + res.nextReminderDate + '，联网后同步'
        : '已稍后至 ' + res.nextReminderDate,
      icon: 'none'
    });
    this.load();
  },

  revokeSnooze(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const item = this.data.snoozedGroups[gi].items[ii];
    if (!item) return;
    const that = this;
    wx.showModal({
      title: '撤销稍后？',
      content: '该跟进项会回到今日待办，原稍后日期 ' + (item.nextReminderDate || '') + ' 作废。',
      confirmText: '撤销',
      success: async function (r) {
        if (!r.confirm) return;
        const res = await coachApi.unsnoozeFollowUp(item.id);
        if (!res || !res.ok) {
          wx.showToast({ title: (res && res.error) || '撤销失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: res.pendingSync ? '已回待办，待同步云端' : '已回到待办', icon: 'none' });
        that.load();
      }
    });
  },

  goRules() { wx.navigateTo({ url: '/pages/rules/rules' }); },
  goAdvice(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.id) {
      wx.showToast({ title: '缺少拳王信息', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/review/review?athleteId=' + ds.id + '&date=' + (ds.date || this.data.date || fmt.todayStr()) + '&name=' + encodeURIComponent(ds.name || '')
    });
  },
  goCoach() { wx.navigateBack(); }
});
