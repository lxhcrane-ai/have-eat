const api = require('../../utils/api.js');
const rules = require('../../utils/rules.js');
const fmt = require('../../utils/format.js');
const adviceCache = require('../../utils/adviceCache.js');
const privacy = require('../../utils/privacy.js');

const PAGE_SIZE = 20;

function pubText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = fmt.todayStr(d);
  const label = day === fmt.todayStr() ? '今天' : (day.slice(5, 7) + '月' + day.slice(8, 10) + '日');
  return label + ' ' + fmt.timeStr(d);
}

function mapItem(a) {
  const revoked = a.status === 'revoked';
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
    date: a.date || '',
    dateText: (a.dateFrom && a.dateTo && a.dateFrom !== a.dateTo) ? (a.dateFrom + ' ~ ' + a.dateTo) : a.date,
    body: revoked ? '' : (a.body || ''),
    revoked: revoked,
    coachName: a.coachName || '营养师',
    publishedText: pubText(a.publishedAt),
    updated: !!a.editedAfterPublish || (Number(a.version) || 0) > 1,
    ruleChips: ruleChips,
    kbChips: kbChips
  };
}

Page({
  data: {
    athleteId: '', name: '', items: [], loading: true, firstLoaded: false,
    error: '', offline: false, cachedRestore: false, cacheMissing: false,
    nextBefore: '', hasMore: false, loadingMore: false,
    focusId: '', focusDate: '', focusQueryId: ''
  },

  onLoad(query) {
    privacy.lockShare();
    const q = query || {};
    this.setData({
      athleteId: q.athleteId || '',
      name: q.name ? decodeURIComponent(q.name) : (q.athleteId ? '该拳王' : ''),
      focusDate: q.date || '',
      focusQueryId: q.id || ''
    });
    this.load();
  },

  onPullDownRefresh() { this.load(); wx.stopPullDownRefresh(); },
  onReachBottom() { this.loadMore(); },

  async load() {
    this.setData({ loading: true, error: '', offline: false, cachedRestore: false, cacheMissing: false });
    const params = { action: 'list', limit: PAGE_SIZE, includeDraft: false };
    // 只有带 athleteId 才按该拳王读；不带时服务端只返回自己可读的
    if (this.data.athleteId) params.athleteId = this.data.athleteId;
    const res = await api.call('advice', params);
    if (!res.ok) {
      if (!res.offline) {
        this.setData({
          loading: false, firstLoaded: true, error: res.error || '加载失败',
          items: [], offline: false, cachedRestore: false, cacheMissing: false,
          nextBefore: '', hasMore: false
        });
        return;
      }
      // 离线：只读本机缓存并明确标注；没有缓存就给出专门空态，不用系统反馈冒充。
      // 带 athleteId 的教练视角必须先确认该拳王仍在名下，避免解绑后仍从缓存读到旧建议。
      const owned = !this.data.athleteId || privacy.isOwnedAthlete(this.data.athleteId);
      if (!owned) {
        this.setData({
          loading: false, firstLoaded: true, offline: true,
          error: '离线：无法确认该拳王仍在你名下，暂不显示本机缓存',
          cachedRestore: false, cacheMissing: true,
          items: [], nextBefore: '', hasMore: false
        });
        return;
      }
      const cached = adviceCache.readHistory(this.data.athleteId);
      if (cached) {
        this.setData({
          loading: false, firstLoaded: true, error: '',
          offline: true, cachedRestore: true, cacheMissing: false,
          items: (cached.items || []).map(mapItem),
          nextBefore: '', hasMore: false
        });
        this.locateFocus();
        return;
      }
      this.setData({
        loading: false, firstLoaded: true, error: '',
        offline: true, cachedRestore: false, cacheMissing: true,
        items: [], nextBefore: '', hasMore: false
      });
      return;
    }
    const items = (res.items || []).map(mapItem);
    // 只缓存第一页，离线时可回看最近同步的内容（24h 失效）
    adviceCache.writeHistory(this.data.athleteId, { items: res.items || [], nextBefore: res.nextBefore || '' });
    this.setData({
      loading: false,
      firstLoaded: true,
      items: items,
      offline: false,
      cachedRestore: false,
      cacheMissing: false,
      nextBefore: res.nextBefore || '',
      hasMore: !!res.nextBefore
    });
    this.locateFocus();
  },

  // 收件箱跳转定位：优先在已加载列表里找，找不到再按日期取当天建议
  locateFocus() {
    const fid = this.data.focusQueryId;
    const fdate = this.data.focusDate;
    if (!fid && !fdate) return;
    const hit = this.data.items.filter(function (x) {
      return (fid && x.id === fid) || (!fid && fdate && x.date === fdate);
    })[0];
    if (hit) { this.markFocus(hit.id); return; }
    if (fdate && !this.data.offline) this.fetchFocus(fdate, fid);
  },

  async fetchFocus(date, id) {
    const params = id ? { action: 'get', id: id } : { action: 'get', date: date };
    if (!id && this.data.athleteId) params.athleteId = this.data.athleteId;
    let res = await api.call('advice', params);
    // 指定 id 取不到时（例如文档已删）再按日期兜底
    if (id && (!res.ok || !res.advice) && date) {
      const fallback = { action: 'get', date: date };
      if (this.data.athleteId) fallback.athleteId = this.data.athleteId;
      res = await api.call('advice', fallback);
    }
    if (!res.ok || !res.advice) return;
    const item = mapItem(res.advice);
    const exists = this.data.items.some(function (x) { return x.id === item.id; });
    if (!exists) this.setData({ items: [item].concat(this.data.items) });
    this.markFocus(item.id);
  },

  markFocus(id) {
    if (!id) return;
    this.setData({ focusId: id }, function () {
      wx.pageScrollTo({ selector: '#adv-' + id, offsetTop: -20, duration: 200 });
    });
  },

  async loadMore() {
    if (this.data.offline) return;
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return;
    this.setData({ loadingMore: true });
    const params = { action: 'list', limit: PAGE_SIZE, before: this.data.nextBefore, includeDraft: false };
    if (this.data.athleteId) params.athleteId = this.data.athleteId;
    const res = await api.call('advice', params);
    if (!res.ok) {
      this.setData({ loadingMore: false });
      wx.showToast({ title: res.error || '加载失败', icon: 'none' });
      return;
    }
    const next = (res.items || []).map(mapItem);
    const merged = this.data.items.concat(next);
    // 防止服务端对同一天重复返回导致死循环
    const before = res.nextBefore || '';
    this.setData({
      loadingMore: false,
      items: merged,
      nextBefore: before,
      hasMore: !!before && before !== this.data.nextBefore
    });
  },

  // 复用 S3 的定位机制：规则库用 query，知识库用 storage（tabBar 页收不到 query）
  goRuleChip(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/rules/rules?ruleId=' + id });
  },
  goKbChip(e) {
    const id = e.currentTarget.dataset.id;
    wx.setStorageSync('kb_focus', id);
    wx.switchTab({ url: '/pages/kb/kb' });
  }
});
