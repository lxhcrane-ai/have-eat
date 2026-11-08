const rules = require('../../utils/rules.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const api = require('../../utils/api.js');
const demoSeed = require('../../utils/demoSeed.js');
const privacy = require('../../utils/privacy.js');

const PHASES = [
  { id: 'maintain', name: '维持期' }, { id: 'cut', name: '减脂期' },
  { id: 'peak', name: '微调期' }, { id: 'recover', name: '恢复期' }
];

Page({
  data: {
    profile: { name: '', sex: 'male', heightCm: '', age: '', weightKg: '', targetWeightKg: '', weighInDate: '', phase: 'maintain', restingHrBaseline: '' },
    phases: PHASES, openid: '', role: 'athlete', coachOpenid: '', pending: 0, logCount: 0, demoCount: 0,
    genderIndex: 0, saving: false, suggest: null
  },

  onLoad() { privacy.lockShare(); },

  onShow() {
    const p = wx.getStorageSync('profile') || {};
    const profile = Object.assign({}, this.data.profile, p);
    const sug = rules.suggestPhase(profile, { today: fmt.todayStr() });
    this.setData({
      profile: profile,
      genderIndex: profile.sex === 'female' ? 1 : 0,
      openid: wx.getStorageSync('openid') || '',
      role: wx.getStorageSync('role') || 'athlete',
      coachOpenid: wx.getStorageSync('coachOpenid') || '',
      pending: store.pending().length,
      logCount: store.all().length,
      demoCount: store.demoCount(),
      suggest: sug
    });
    this.refresh();
  },

  async refresh() {
    const res = await api.call('getFeed', {});
    if (res.ok) {
      if (res.profile) {
        wx.setStorageSync('profile', res.profile);
        this.setData({ profile: Object.assign({}, this.data.profile, res.profile) });
      }
      if (res.coachOpenid !== undefined) wx.setStorageSync('coachOpenid', res.coachOpenid);
      this.setData({ coachOpenid: res.coachOpenid || '', role: res.role || this.data.role });
    }
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    const o = {}; o['profile.' + k] = e.detail.value;
    this.setData(o);
  },
  onGender(e) {
    const i = Number(e.detail.value);
    this.setData({ genderIndex: i, 'profile.sex': i === 0 ? 'male' : 'female' });
  },
  onDate(e) { this.setData({ 'profile.weighInDate': e.detail.value }); },
  pickPhase(e) { this.setData({ 'profile.phase': e.currentTarget.dataset.id }); },

  async save() {
    const p = Object.assign({}, this.data.profile);
    ['heightCm', 'age', 'weightKg', 'targetWeightKg', 'restingHrBaseline'].forEach(function (k) {
      if (p[k] !== '' && p[k] !== undefined) p[k] = Number(p[k]);
    });
    wx.setStorageSync('profile', p);
    this.setData({ saving: true });
    const res = await api.call('saveProfile', { profile: p });
    this.setData({ saving: false });
    wx.showToast({ title: res.ok ? '已保存并同步' : '已存本机（云端未同步）', icon: 'none' });
  },

  goBind() { wx.navigateTo({ url: '/pages/bind/bind' }); },
  goCoachMode() { wx.navigateTo({ url: '/pages/bind/bind?asCoach=1' }); },
  goCoachHome() { wx.navigateTo({ url: '/pages/coach/coach' }); },
  goChat() { wx.navigateTo({ url: '/pages/chat/chat' }); },
  goAdvice() { wx.navigateTo({ url: '/pages/advice/advice' }); },

  // 解除与教练的绑定：只清关系字段，不删除日志与消息
  unbindCoach() {
    const that = this;
    wx.showModal({
      title: '解除与教练的绑定',
      content: '只解除绑定关系，不删除任何记录。确定？',
      success: async function (r) {
        if (!r.confirm) return;
        const res = await api.call('bind', { action: 'unbind' });
        if (!res.ok) {
          wx.showToast({ title: res.error || '解绑失败', icon: 'none' });
          return;
        }
        wx.removeStorageSync('coachOpenid');
        wx.setStorageSync('role', 'athlete');
        that.setData({ coachOpenid: '', role: 'athlete' });
        wx.showToast({ title: '已解除绑定', icon: 'none' });
      }
    });
  },

  exportData() {
    // 只导出本机这份账号自己的记录；教练端不落地他人数据，所以不会把名下拳王带出去
    const data = {
      schemaVersion: 2,
      exportedAt: fmt.nowIso(),
      localOnly: true,
      identity: { openid: this.data.openid, role: this.data.role, admission: privacy.admissionState() },
      profile: this.data.profile,
      logs: store.all()
    };
    wx.setClipboardData({
      data: JSON.stringify(data, null, 2),
      success() { wx.showToast({ title: '全部数据已复制到剪贴板', icon: 'none' }); }
    });
  },

  async syncPending() {
    const dates = store.pending();
    if (!dates.length) { wx.showToast({ title: '没有待同步记录', icon: 'none' }); return; }
    let ok = 0;
    for (const d of dates) {
      const log = store.get(d);
      if (!log) { store.clearPending(d); continue; }
      // 演示记录永不上云
      if (store.isDemo(log)) { store.clearPending(d); continue; }
      const res = await api.call('saveLog', { log: log });
      if (res.ok) { store.clearPending(d); ok++; }
    }
    this.setData({ pending: store.pending().length });
    wx.showToast({ title: '同步 ' + ok + '/' + dates.length, icon: 'none' });
  },

  copyOpenid() {
    wx.setClipboardData({ data: this.data.openid || '未获取', success() { wx.showToast({ title: '已复制', icon: 'none' }); } });
  },

  clearLocal() {
    const that = this;
    wx.showModal({
      title: '清空本机记录',
      content: '删除手机缓存（含演示数据与待同步），不影响云端。清空后演示数据不会自动重新导入。确定？',
      success(r) {
        if (!r.confirm) return;
        wx.setStorageSync('logs_v2', []);
        wx.removeStorageSync('pending_sync');
        // 清空后下次启动重新做一次云端全量下沉，否则 fullDone 会让本机一直为空
        wx.removeStorageSync('history_sync_v1');
        wx.removeStorageSync(demoSeed.META_KEY);
        wx.removeStorageSync(privacy.OWNED_KEY);
        wx.setStorageSync(demoSeed.OPTOUT_KEY, true);
        that.setData({ logCount: 0, pending: 0, demoCount: 0 });
        wx.showToast({ title: '已清空，演示不再自动导入', icon: 'none' });
      }
    });
  },

  // 只在没有任何记录时给一个恢复演示的入口，避免"清空后永远看不到演示"
  restoreDemo() {
    wx.removeStorageSync(demoSeed.OPTOUT_KEY);
    wx.removeStorageSync(demoSeed.META_KEY);
    const app = getApp();
    if (app && typeof app.importSeed === 'function') app.importSeed();
    this.setData({ logCount: store.all().length, demoCount: store.demoCount() });
    wx.showToast({ title: '已恢复演示数据', icon: 'none' });
  }
});
