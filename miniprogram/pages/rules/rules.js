const coachApi = require('../../utils/coachApi.js');
const rules = require('../../utils/rules.js');

Page({
  data: {
    loading: true, offline: false,
    filter: 'all',
    filters: [
      { id: 'all', name: '全部' },
      { id: 'maintain', name: '维持期' },
      { id: 'cut', name: '减脂期' },
      { id: 'peak', name: '微调期' },
      { id: 'recover', name: '恢复期' }
    ],
    all: [], shown: [], expanded: '',
    needsReview: 0
  },

  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true });
    const res = await coachApi.listRules();
    const all = (res.rules || []).map(function (r) {
      return Object.assign({}, r, {
        open: false,
        phaseText: (r.phaseLabels || []).join(' / '),
        statusText: r.reviewStatusName || '有效',
        tone: r.reviewTone || 'ok'
      });
    });
    this.setData({
      loading: false,
      offline: !!res.offline,
      all: all,
      shown: this.filterList(all, this.data.filter),
      needsReview: all.filter(function (r) { return r.reviewStatus === 'needs_review'; }).length
    });
  },

  filterList(list, filter) {
    if (filter === 'all') return list;
    return list.filter(function (r) { return (r.applicablePhases || []).indexOf(filter) >= 0; });
  },

  pickFilter(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ filter: f, shown: this.filterList(this.data.all, f) });
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expanded: this.data.expanded === id ? '' : id });
  },

  async markReview(e) {
    const ds = e.currentTarget.dataset;
    const next = ds.status === 'needs_review' ? 'active' : 'needs_review';
    const res = await coachApi.markRuleReview(ds.id, next, '');
    wx.showToast({
      title: next === 'needs_review' ? '已标记待复核（不改代码）' : '已恢复有效',
      icon: 'none'
    });
    if (!res.ok) wx.showToast({ title: '保存失败', icon: 'none' });
    this.load();
  }
});
