const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');
const privacy = require('../../utils/privacy.js');

const PAGE_SIZE = 20;
const TYPE_LABEL = {
  log: '记录',
  message: '消息',
  advice: '建议',
  advice_update: '建议更新',
  advice_revoke: '建议撤回',
  followup: '跟进'
};

const FILTERS = [
  { id: '', name: '全部' },
  { id: 'log', name: '记录' },
  { id: 'message', name: '消息' },
  { id: 'advice', name: '建议' },
  { id: 'advice_update', name: '建议更新' },
  { id: 'advice_revoke', name: '建议撤回' },
  { id: 'followup', name: '跟进' }
];

function timeText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = fmt.todayStr(d);
  if (day === fmt.todayStr()) return fmt.timeStr(d);
  return day.slice(5, 7) + '月' + day.slice(8, 10) + '日 ' + fmt.timeStr(d);
}

function mapItem(a) {
  const type = a.type || 'notice';
  const title = a.title || TYPE_LABEL[type] || '通知';
  const body = String(a.body || '').replace(/\s+/g, ' ').trim();
  return {
    id: a._id || a.id || '',
    type: type,
    typeLabel: TYPE_LABEL[type] || '通知',
    typeTone: (a.level === 'red') ? 'red' : 'info',
    title: title,
    summary: body.length > 70 ? (body.slice(0, 70) + '…') : body,
    timeText: timeText(a.createdAt),
    read: !!a.read,
    athleteId: a.athleteId || '',
    date: a.date || '',
    adviceId: a.adviceId || '',
    peerName: (type === 'message' && String(title).indexOf('：') >= 0) ? String(title).split('：')[0] : ''
  };
}

function typeName(id) {
  return TYPE_LABEL[id] || '通知';
}

Page({
  data: {
    role: '', athleteId: '', athleteName: '',
    items: [], unread: 0, loading: true, firstLoaded: false,
    error: '', loadingMore: false, hasMore: false, nextOffset: 0,
    type: '', filters: FILTERS, readAllBusy: false
  },

  onLoad(q) {
    privacy.lockShare();
    const qq = q || {};
    this.setData({
      athleteId: qq.athleteId || '',
      athleteName: qq.name ? decodeURIComponent(qq.name) : ''
    });
    this.load(true);
  },
  onShow() { if (this.data.firstLoaded) this.load(true); },
  onPullDownRefresh() { this.load(true); wx.stopPullDownRefresh(); },
  onReachBottom() { this.loadMore(); },

  queryParams(offset) {
    const p = { action: 'list', limit: PAGE_SIZE, offset: offset || 0 };
    if (this.data.type) p.type = this.data.type;
    if (this.data.athleteId) p.athleteId = this.data.athleteId;
    return p;
  },

  async load(first) {
    if (first) this.setData({ loading: !this.data.items.length, error: '' });
    const res = await api.call('inbox', this.queryParams(0));
    if (!res.ok) {
      this.setData({ loading: false, firstLoaded: true, loadingMore: false, error: res.error || '加载失败' });
      return;
    }
    const patch = {
      role: res.role || '',
      items: (res.items || []).map(mapItem),
      unread: res.unread || 0,
      hasMore: !!res.hasMore,
      nextOffset: res.nextOffset || 0,
      loading: false,
      firstLoaded: true,
      loadingMore: false,
      error: ''
    };
    // 服务端已按本人视角返回：非教练账号即使带了 athleteId 也不能显示成“只看某人”
    if (res.role !== 'coach' && this.data.athleteId) {
      patch.athleteId = '';
      patch.athleteName = '';
    }
    this.setData(patch);
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    const res = await api.call('inbox', this.queryParams(this.data.items.length));
    if (!res.ok) {
      this.setData({ loadingMore: false });
      wx.showToast({ title: res.error || '加载失败', icon: 'none' });
      return;
    }
    this.setData({
      items: this.data.items.concat((res.items || []).map(mapItem)),
      unread: res.unread || 0,
      hasMore: !!res.hasMore,
      nextOffset: res.nextOffset || 0,
      loadingMore: false
    });
  },

  chooseType(e) {
    const type = e.currentTarget.dataset.type || '';
    if (type === this.data.type) return;
    this.setData({ type: type, items: [], hasMore: false, nextOffset: 0 });
    this.load(true);
  },

  clearAthlete() {
    this.setData({ athleteId: '', athleteName: '' });
    this.load(true);
  },

  // 全部已读：按当前筛选明确范围，另提供“全部”选项；清空前二次确认
  openReadAll() {
    if (this.data.readAllBusy) return;
    if (!this.data.unread) {
      wx.showToast({ title: '当前没有未读', icon: 'none' });
      return;
    }
    const that = this;
    const keys = [];
    const labels = [];
    if (this.data.athleteId) {
      keys.push('athlete');
      labels.push('仅' + (this.data.athleteName || '该拳王') + '的未读');
    }
    if (this.data.type) {
      keys.push('type');
      labels.push('仅“' + typeName(this.data.type) + '”的未读');
    }
    keys.push('all');
    labels.push('全部未读');
    wx.showActionSheet({
      itemList: labels,
      success(res) { that.confirmReadAll(keys[res.tapIndex]); }
    });
  },

  confirmReadAll(scope) {
    const that = this;
    let scopeText = '全部收件箱';
    if (scope === 'type') scopeText = '“' + typeName(this.data.type) + '”类型';
    if (scope === 'athlete') scopeText = (this.data.athleteName || '该拳王') + '的收件箱';
    let extra = '';
    if (scope === 'all' && (this.data.athleteId || this.data.type)) {
      extra = '这会清空整个收件箱，不只是当前筛选范围。';
    }
    wx.showModal({
      title: '确认标记已读',
      content: '将把' + scopeText + '的未读标记为已读，不可撤销。' + extra,
      confirmText: '全部已读',
      success: async function (r) {
        if (!r.confirm) return;
        that.setData({ readAllBusy: true });
        const params = { action: 'readAll', scope: scope };
        if (scope === 'type') params.type = that.data.type;
        if (scope === 'athlete') params.athleteId = that.data.athleteId;
        const res = await api.call('inbox', params);
        that.setData({ readAllBusy: false });
        if (!res.ok) {
          wx.showToast({ title: res.error || '操作失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已标记 ' + (res.updated || 0) + ' 条', icon: 'none' });
        that.load(true);
      }
    });
  },

  // 跳转前先把该条标为已读；标记失败不跳转
  async openItem(e) {
    const i = e.currentTarget.dataset.i;
    const item = this.data.items[i];
    if (!item) return;
    if (!item.read) {
      const res = await api.call('inbox', { action: 'read', id: item.id });
      if (!res.ok) {
        wx.showToast({ title: res.error || '标记已读失败', icon: 'none' });
        return;
      }
      const obj = {};
      obj['items[' + i + '].read'] = true;
      obj.unread = Math.max(0, this.data.unread - 1);
      this.setData(obj);
    }
    this.goTarget(item);
  },

  goTarget(item) {
    const isCoach = this.data.role === 'coach';
    if (item.type === 'message') {
      const q = isCoach
        ? ('?athleteId=' + item.athleteId + '&name=' + encodeURIComponent(item.peerName || '拳王'))
        : '';
      wx.navigateTo({ url: '/pages/chat/chat' + q });
      return;
    }
    if (item.type === 'advice' || item.type === 'advice_update' || item.type === 'advice_revoke') {
      let url = '/pages/advice/advice?date=' + (item.date || fmt.todayStr())
        + '&id=' + encodeURIComponent(item.adviceId || item.id);
      if (isCoach && item.athleteId) url += '&athleteId=' + item.athleteId;
      wx.navigateTo({ url: url });
      return;
    }
    if (item.type === 'log') {
      if (item.athleteId) {
        wx.navigateTo({
          url: '/pages/review/review?athleteId=' + item.athleteId + '&date=' + (item.date || fmt.todayStr())
        });
      } else {
        wx.navigateTo({ url: '/pages/coach/coach' });
      }
      return;
    }
    if (item.type === 'followup') {
      wx.navigateTo({ url: '/pages/queue/queue' });
      return;
    }
    wx.navigateTo({ url: '/pages/coach/coach' });
  }
});
