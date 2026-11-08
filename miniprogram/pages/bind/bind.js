const api = require('../../utils/api.js');
const privacy = require('../../utils/privacy.js');
const subscribe = require('../../utils/subscribe.js');

Page({
  data: { code: '', asCoach: false, loading: false, result: '', role: 'athlete' },

  onLoad(q) {
    privacy.lockShare();
    const asCoach = q && q.asCoach === '1';
    this.setData({ asCoach: asCoach, code: '' });
  },

  onInput(e) { this.setData({ code: e.detail.value }); },
  toggleRole(e) { this.setData({ asCoach: e.currentTarget.dataset.v === 'coach' }); },

  async submit() {
    const code = (this.data.code || '').trim();
    if (!code) { wx.showToast({ title: this.data.asCoach ? '输入教练激活码' : '输入配对码', icon: 'none' }); return; }
    this.setData({ loading: true, result: '' });
    // 只提交 code：athlete / coach 身份由服务端根据码的类型判定，
    // 页面上的“我是拳王/我是教练”只用于切换输入提示，不参与授权。
    const res = await api.call('bind', { code: code });
    this.setData({ loading: false });
    if (!res.ok) {
      this.setData({ result: res.error || '绑定失败' });
      return;
    }
    if (res.openid) wx.setStorageSync('openid', res.openid);
    if (res.role) wx.setStorageSync('role', res.role);
    if (res.coachOpenid !== undefined) wx.setStorageSync('coachOpenid', res.coachOpenid);
    privacy.setAdmission('active');
    const app = getApp();
    if (app && app.globalData) {
      if (res.openid) app.globalData.openid = res.openid;
      if (res.role) app.globalData.role = res.role;
      app.globalData.admission = 'active';
      if (typeof app.importSeedOnce === 'function') app.importSeedOnce();
    }

    // 绑定成功：按服务端判定的角色请求对应的订阅模板，结果由 bind(action=subscribe) 落库。
    // 等用户响应后再跳转，避免订阅弹窗被 900ms 的跳转截断；未配置模板时立即 resolve。
    try { await subscribe.ask(res.role || 'athlete'); } catch (e) { /* 订阅失败不影响绑定 */ }

    if (res.waitingCoach) {
      this.setData({ result: '已登记，等教练激活后自动接上' });
    } else if (res.role === 'coach') {
      this.setData({ result: '教练身份已激活' });
      setTimeout(function () { wx.redirectTo({ url: '/pages/coach/coach' }); }, 900);
    } else {
      this.setData({ result: '已绑定教练' + (res.coachName ? '：' + res.coachName : '') });
      setTimeout(function () { wx.switchTab({ url: '/pages/index/index' }); }, 900);
    }
  }
});
