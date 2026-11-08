const api = require('../../utils/api.js');
const privacy = require('../../utils/privacy.js');

Page({
  data: {
    code: '',
    asCoach: false,
    loading: false,
    result: '',
    offlineHint: false
  },

  onLoad(query) {
    privacy.lockShare();
    this.setData({
      asCoach: !!(query && query.asCoach === '1'),
      offlineHint: privacy.admissionState() === 'offline'
    });
  },

  onInput(e) {
    this.setData({ code: e.detail.value || '', result: '' });
  },

  useAthlete() {
    this.setData({ asCoach: false, code: '', result: '' });
  },

  useCoach() {
    this.setData({ asCoach: true, code: '', result: '' });
  },

  async submit() {
    const code = String(this.data.code || '').trim();
    if (!code) {
      this.setData({ result: this.data.asCoach ? '请输入教练激活码' : '请输入配对码' });
      return;
    }
    this.setData({ loading: true, result: '' });
    // 只提交 code，不提交任何角色字段；athlete/coach 完全由服务端根据码判断。
    const res = await api.call('bind', { code: code });
    this.setData({ loading: false });
    if (!res || !res.ok) {
      this.setData({ result: (res && (res.error || res.message)) || '验证失败，请检查配对码' });
      return;
    }

    const app = getApp();
    if (res.openid) wx.setStorageSync('openid', res.openid);
    if (res.role) wx.setStorageSync('role', res.role);
    if (res.coachOpenid !== undefined) wx.setStorageSync('coachOpenid', res.coachOpenid);
    privacy.setAdmission('active');
    if (app && app.globalData) {
      if (res.openid) app.globalData.openid = res.openid;
      if (res.role) app.globalData.role = res.role;
      app.globalData.admission = 'active';
      if (typeof app.importSeedOnce === 'function') app.importSeedOnce();
    }

    wx.showToast({ title: res.role === 'coach' ? '教练身份已激活' : '已通过内部邀请', icon: 'none' });
    setTimeout(function () {
      if (res.role === 'coach') wx.redirectTo({ url: '/pages/coach/coach' });
      else wx.switchTab({ url: '/pages/index/index' });
    }, 700);
  },

  // 已绑定但本机状态被清除时，重新向服务端确认一次
  async recheck() {
    this.setData({ loading: true, result: '' });
    const app = getApp();
    const d = app && typeof app.bootstrap === 'function' ? await app.bootstrap() : { ok: false };
    this.setData({ loading: false });
    if (d && d.admission === 'active') {
      wx.showToast({ title: '已确认准入', icon: 'none' });
      if (d.role === 'coach') wx.redirectTo({ url: '/pages/coach/coach' });
      else wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    this.setData({ result: '当前账号还没有有效邀请，请联系营养师获取配对码。' });
  }
});
