const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');
const coachApi = require('../../utils/coachApi.js');
const rules = require('../../utils/rules.js');
const goals = require('../../utils/goals.js');
const privacy = require('../../utils/privacy.js');

const PHASES = [
  { id: 'maintain', name: '维持期' }, { id: 'cut', name: '减脂期' },
  { id: 'peak', name: '微调期' }, { id: 'recover', name: '恢复期' }
];

Page({
  data: {
    isCoach: false, athletes: [], unreadTotal: 0, loading: true,
    detailOpen: '', detailLogs: [], error: '',
    phases: PHASES,
    queue: { pending: 0, escalated: 0 },
    reviewPending: 0
  },

  onLoad() { privacy.lockShare(); },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); wx.stopPullDownRefresh(); },

  async load() {
    const res = await api.call('getFeed', {});
    if (!res.ok) {
      this.setData({ loading: false, error: res.error || '加载失败' });
      return;
    }
    const isCoach = res.role === 'coach';
    const athletes = (res.athletes || []).map(function (a) {
      const f = a.lastFeedback || {};
      const phase = rules.resolvePhase((a.profile && a.profile.phase) || 'maintain');
      const sug = rules.suggestPhase(a.profile || {}, { today: fmt.todayStr() });
      const prof = a.profile || {};
      const gapPct = (typeof prof.weightKg === 'number' && typeof prof.targetWeightKg === 'number' && prof.targetWeightKg > 0)
        ? Math.round(((prof.weightKg - prof.targetWeightKg) / prof.targetWeightKg) * 1000) / 10
        : null;
      const goal = goals.goalChips(phase, prof.goals || [], {
        daysToWeigh: sug.daysToWeigh,
        gapPct: gapPct,
        weighInDate: prof.weighInDate,
        today: fmt.todayStr()
      });
      if (goal.hasGoals && f.goalAdherence) {
        goal.adherenceText = (f.goalAdherence.score === null || f.goalAdherence.score === undefined)
          ? '数据不足'
          : (f.goalAdherence.score + ' 分');
      }
      const reds = (f.alerts || []).filter(function (x) { return x.level === 'red'; });
      return {
        openid: a.openid,
        name: a.name,
        date: a.lastDate || '未记录',
        score: f.score === undefined ? '--' : f.score,
        level: f.level || '--',
        tone: f.score >= 85 ? 'ok' : (f.score >= 70 ? 'ok' : (f.score >= 55 ? 'amber' : (f.score === undefined ? 'info' : 'red'))),
        summary: f.summary || '',
        headline: f.headline || '',
        phase: phase,
        phaseLabel: rules.phaseLabel(phase),
        goal: goal.hasGoals ? goal : null,
        suggest: sug.changed ? { phase: sug.phase, label: sug.phaseLabel, reason: sug.reason } : null,
        daysToWeigh: sug.daysToWeigh,
        reds: reds.slice(0, 3),
        targets: (a.profile && a.profile.weighInDate) ? ('距称重 ' + fmt.daysBetween(fmt.todayStr(), a.profile.weighInDate) + ' 天') : '',
        reviewState: a.reviewState || 'none',
        reviewDate: a.lastDate || fmt.todayStr(),
        unread: Number(a.unreadTotal) || 0
      };
    });
    // 记录当前名下拳王，供离线缓存/草稿恢复做归属过滤；空列表表示暂时没有可读拳王
    privacy.setOwnedAthletes(isCoach ? athletes : []);
    let unreadTotal = 0;
    athletes.forEach(function (a) { unreadTotal += a.unread; });
    this.setData({
      isCoach: isCoach,
      athletes: athletes,
      queue: res.queue || { pending: 0, escalated: 0 },
      unreadTotal: unreadTotal,
      reviewPending: athletes.filter(function (a) { return a.reviewState === 'pending'; }).length,
      loading: false, error: ''
    });
  },

  // 阶段切换：营养师后台唯一入口（拳王端只读）
  async setPhase(e) {
    const ds = e.currentTarget.dataset;
    const res = await coachApi.setAthletePhase(ds.id, ds.phase);
    wx.showToast({
      title: res.ok ? '已切到' + rules.phaseLabel(ds.phase) : '失败',
      icon: 'none'
    });
    if (res.ok) this.load();
  },

  goQueue() { wx.navigateTo({ url: '/pages/queue/queue' }); },
  goInbox() { wx.navigateTo({ url: '/pages/inbox/inbox' }); },
  goInboxAthlete(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.id) return;
    wx.navigateTo({
      url: '/pages/inbox/inbox?athleteId=' + ds.id + '&name=' + encodeURIComponent(ds.name || '')
    });
  },
  goReview(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.id) return;
    wx.navigateTo({
      url: '/pages/review/review?athleteId=' + ds.id + '&date=' + (ds.date || fmt.todayStr()) + '&name=' + encodeURIComponent(ds.name || '')
    });
  },

  // 顶部横幅：优先进入今天有记录但还没审阅的拳王
  goReviewFirst() {
    const list = this.data.athletes || [];
    const target = list.filter(function (a) { return a.reviewState === 'pending'; })[0];
    if (!target) {
      wx.showToast({ title: '今天没有待审阅的拳王', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/review/review?athleteId=' + target.openid + '&date=' + (target.reviewDate || fmt.todayStr()) + '&name=' + encodeURIComponent(target.name || '')
    });
  },
  // 目标设置页：返回后 coach.onShow 会重新拉取并刷新目标 chips
  goGoals(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.id) return;
    wx.navigateTo({
      url: '/pages/goals/goals?athleteId=' + ds.id + '&name=' + encodeURIComponent(ds.name || '')
    });
  },

  goRules() { wx.navigateTo({ url: '/pages/rules/rules' }); },
  goReport(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/report/report?athleteId=' + id + '&name=' + encodeURIComponent(e.currentTarget.dataset.name || '') });
  },

  async openDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.detailOpen === id) { this.setData({ detailOpen: '', detailLogs: [] }); return; }
    const res = await api.call('getFeed', { action: 'detail', athleteId: id });
    if (!res.ok) { wx.showToast({ title: res.error || '加载失败', icon: 'none' }); return; }
    this.setData({
      detailOpen: id,
      detailLogs: (res.logs || []).map(function (l) {
        const p = l.payload || {};
        const f = l.feedback || {};
        return {
          date: l.date,
          score: f.score,
          kg: (p.weights && p.weights.morning && p.weights.morning.kg) || '--',
          protein: f.proteinG,
          target: f.proteinTargetG,
          dehydration: f.dehydrationPct,
          soreness: f.sorenessMax,
          srpe: f.sRPE,
          headline: f.headline || '',
          reds: (f.alerts || []).filter(function (x) { return x.level === 'red'; })
        };
      })
    });
  },

  goChat(e) {
    const ds = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/chat/chat?athleteId=' + ds.id + '&name=' + encodeURIComponent(ds.name || '拳王') });
  },

  goBind() { wx.navigateTo({ url: '/pages/bind/bind?asCoach=1' }); },
  goHome() { wx.switchTab({ url: '/pages/index/index' }); },

  // 生成一次性配对码（30 分钟有效，首次使用即失效）
  async newPairCode() {
    const res = await coachApi.createPairCode();
    if (!res.ok) {
      wx.showModal({ title: '生成失败', content: res.error || '请稍后再试', showCancel: false });
      return;
    }
    wx.setClipboardData({
      data: res.code,
      success() { wx.showToast({ title: '配对码已复制', icon: 'none' }); }
    });
    wx.showModal({
      title: '配对码 ' + res.code,
      content: '30 分钟内有效，仅可使用一次。已复制到剪贴板，发给拳王输入。',
      showCancel: false
    });
  },

  unbindAthlete(e) {
    const ds = e.currentTarget.dataset;
    const that = this;
    wx.showModal({
      title: '解除绑定',
      content: '确定与「' + (ds.name || '该拳王') + '」解除绑定？只解除关系，不删除日志与消息。',
      success: async function (r) {
        if (!r.confirm) return;
        const res = await api.call('bind', { action: 'unbind', athleteId: ds.id });
        wx.showToast({ title: res.ok ? '已解除绑定' : (res.error || '解绑失败'), icon: 'none' });
        if (res.ok) that.load();
      }
    });
  }
});
