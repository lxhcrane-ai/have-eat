const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');

Page({
  data: { messages: [], text: '', peer: '', peerName: '', sending: false, err: '', athleteId: '' },

  onLoad(q) {
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
    this.setData({ messages: messages, peer: res.peer, err: '' });
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
    if (res.ok) { this.setData({ text: '' }); this.load(true); }
    else wx.showToast({ title: res.error || '发送失败', icon: 'none' });
  }
});
