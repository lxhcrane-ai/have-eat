const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');
const privacy = require('../../utils/privacy.js');
const subscribe = require('../../utils/subscribe.js');

Page({
  data: { messages: [], text: '', peer: '', peerName: '', sending: false, err: '', athleteId: '' },

  onLoad(q) {
    privacy.lockShare();
    this.setData({
      athleteId: (q && q.athleteId) || '',
      peerName: q && q.name ? decodeURIComponent(q.name) : '教练'
    });
    this.load(true);
  },

  onShow() { this.startPoll(); },
  onHide() { this.stopPoll(); },
  onUnload() { this.stopPoll(); },

  startPoll() {
    const that = this;
    this.stopPoll();
    this.timer = setInterval(function () { that.load(false); }, 4000);
  },
  stopPoll() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

  async load(scrollBottom) {
    const res = await api.call('chat', { action: 'list', athleteId: this.data.athleteId });
    if (!res.ok) { this.setData({ err: res.error || '加载失败' }); return; }
    const messages = (res.messages || []).map(function (m) {
      return { id: m.id, mine: m.mine, text: m.text, at: (m.at || '').slice(11, 16), refDate: m.refDate };
    });
    const patch = { messages: messages, peer: res.peer, err: '' };
    // 非教练账号的会话对象永远是自己的教练，query 里的 athleteId 不能改变标题
    if (res.role !== 'coach' && this.data.athleteId) {
      patch.athleteId = '';
      patch.peerName = '教练';
    }
    this.setData(patch);
    if (scrollBottom) this.scrollToBottom();
  },

  scrollToBottom() {
    wx.pageScrollTo({ scrollTop: 99999, duration: 150 });
  },

  onInput(e) { this.setData({ text: e.detail.value }); },
  quickSend(e) {
    const t = e.currentTarget.dataset.t;
    this.setData({ text: t });
    this.send();
  },

  async send() {
    const text = (this.data.text || '').trim();
    if (!text) return;
    this.setData({ sending: true });
    const res = await api.call('chat', { action: 'send', text: text, athleteId: this.data.athleteId, refDate: fmt.todayStr() });
    this.setData({ sending: false });
    if (res.ok) {
      this.setData({ text: '' });
      this.load(true);
      // 首次发送成功时请求订阅授权；模板未配置时 ask 静默返回，不标记已询问，下次还能重试
      const key = 'chat_subscribe_v1_' + (wx.getStorageSync('openid') || '');
      let asked = false;
      try { asked = !!wx.getStorageSync(key); } catch (e) { asked = false; }
      if (!asked) {
        subscribe.ask(res.role || wx.getStorageSync('role') || 'athlete').then(function (r) {
          if (r && Object.keys(r).length) {
            try { wx.setStorageSync(key, true); } catch (e) { /* 标记失败最多再提示一次 */ }
          }
        }).catch(function () {});
      }
    } else wx.showToast({ title: res.error || '发送失败', icon: 'none' });
  }
});
