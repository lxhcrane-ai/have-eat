const api = require('../../utils/api.js');
const config = require('../../config.js');

Page({
  data: { code: '', asCoach: false, loading: false, result: '', role: 'athlete', defaultCode: config.coachCode },

  onLoad(q) {
    const asCoach = q && q.asCoach === '1';
    this.setData({ asCoach: asCoach, code: '' });
  },

  onInput(e) { this.setData({ code: e.detail.value }); },
  toggleRole(e) { this.setData({ asCoach: e.currentTarget.dataset.v === 'coach' }); },

  async submit() {
    const code = (this.data.code || '').trim();
    if (!code) { wx.showToast({ title: '输入邀请码', icon: 'none' }); return; }
    this.setData({ loading: true, result: '' });
    const res = await api.call('bind', { code: code, asCoach: this.data.asCoach });
    this.setData({ loading: false });
    if (!res.ok) {
      this.setData({ result: res.error || '绑定失败' });
      return;
    }
    if (res.role) wx.setStorageSync('role', res.role);
    if (res.coachOpenid) wx.setStorageSync('coachOpenid', res.coachOpenid);
    if (res.waitingCoach) {
      this.setData({ result: '已登记，等教练输入同一邀请码后自动接上' });
    } else if (res.role === 'coach') {
      this.setData({ result: '教练端已开启' + (res.boundAthletes ? '，接上 ' + res.boundAthletes + ' 名拳王' : '') });
      setTimeout(function () { wx.redirectTo({ url: '/pages/coach/coach' }); }, 900);
    } else {
      this.setData({ result: '已绑定教练' });
      setTimeout(function () { wx.switchTab({ url: '/pages/index/index' }); }, 900);
    }
  }
});
