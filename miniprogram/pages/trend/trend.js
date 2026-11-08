const rules = require('../../utils/rules.js');
const goals = require('../../utils/goals.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const privacy = require('../../utils/privacy.js');

Page({
  data: {
    points: [], segs: [], rate: null, rateText: '', avg7: null, avg7Text: '',
    proteinRate: '', loadBars: [], streak: 0, logs: [], goalText: '', hasData: false,
    hasDemo: false, weightRange: '', refLine: null, goalView: null
  },

  onLoad() { privacy.lockShare(); },
  onShow() { this.build(); },

  build() {
    const logs = store.recent(30);
    const profile = wx.getStorageSync('profile') || {};
    if (!logs.length) { this.setData({ hasData: false, hasDemo: false }); return; }
    const hasDemo = logs.some(function (l) { return store.isDemo(l); });

    // 目标视图：文案与区间全部来自 goals.js，页面不再重算
    const mw = store.morningWeights(21);
    const latestFb = rules.evaluate(logs[0], { profile: profile, recentMorningWeights: mw });
    const goalView = goals.goalView(latestFb.goalPlan, latestFb.goalAdherence, latestFb.goalBlockers, { targetWeightKg: profile.targetWeightKg });

    // ---- 体重折线（最近 14 天晨重）----
    const series = logs.slice(0, 14).filter(function (l) {
      return l.weights && l.weights.morning && l.weights.morning.kg;
    }).map(function (l) { return { date: l.date, kg: Number(l.weights.morning.kg) }; }).reverse();

    let points = [], segs = [], weightRange = '', refLine = null;
    if (series.length >= 2) {
      const vals = series.map(function (s) { return s.kg; });
      let min = Math.min.apply(null, vals) - 0.4;
      let max = Math.max.apply(null, vals) + 0.4;
      // 有数值型目标体重时，把目标线纳入纵轴范围；弱证据目标 goalView.weight 为 null
      const twkg = goalView.weight ? goalView.weight.kg : null;
      if (twkg !== null) {
        min = Math.min(min, twkg - 0.15);
        max = Math.max(max, twkg + 0.15);
      }
      const span = max - min || 1;
      const W = 600, H = 200, PAD = 28;
      const n = series.length;
      points = series.map(function (s, i) {
        const x = PAD + (n === 1 ? W / 2 : (i / (n - 1)) * W);
        const y = PAD + (1 - (s.kg - min) / span) * H;
        return { x: Math.round(x), y: Math.round(y), kg: s.kg, date: s.date.slice(5) };
      });
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        segs.push({ left: a.x, top: a.y, width: Math.round(len), angle: Math.round(ang * 10) / 10 });
      }
      if (twkg !== null) {
        const y = Math.round(PAD + (1 - (twkg - min) / span) * H);
        refLine = { top: y, text: goalView.weight.text };
      }
      weightRange = Math.min.apply(null, vals).toFixed(1) + ' – ' + Math.max.apply(null, vals).toFixed(1) + ' kg';
    }

    // ---- 周速率 ----
    const rate = rules.weeklyRate(mw);
    let rateText = '需要至少 4 天晨重';
    if (rate !== null) {
      const pct = mw.length ? (Math.abs(rate) / mw[mw.length - 1].kg * 100).toFixed(1) : '0';
      rateText = (rate > 0 ? '+' : '') + rate + ' kg/周 · ' + pct + '% 体重';
    }

    // ---- 7 日均值 ----
    let avg7 = null;
    if (series.length) {
      const last7 = series.slice(-7);
      avg7 = Number((last7.reduce(function (s, x) { return s + x.kg; }, 0) / last7.length).toFixed(2));
    }

    // ---- 蛋白达标率（近 7 天有记录的）----
    let hit = 0, total = 0;
    logs.slice(0, 7).forEach(function (l, i) {
      const fb = i === 0 ? latestFb : rules.evaluate(l, { profile: profile, recentMorningWeights: mw });
      if (fb.protein.level === 'unknown') return;
      total++;
      if (fb.protein.pct >= 100) hit++;
    });
    const proteinRate = total ? (Math.round(hit / total * 100) + '%（' + hit + '/' + total + ' 天）') : '数据不足';

    // ---- sRPE 周负荷 ----
    const loadBars = logs.slice(0, 7).reverse().map(function (l) {
      const srpe = (l.training && l.training.durationMin && l.training.rpe) ? l.training.durationMin * l.training.rpe : 0;
      return { date: l.date.slice(5), srpe: srpe };
    });
    const maxLoad = Math.max.apply(null, loadBars.map(function (b) { return b.srpe; }).concat([1]));

    // ---- 连续记录 ----
    let streak = 0;
    let d = new Date();
    for (let i = 0; i < 60; i++) {
      const ds = fmt.todayStr(d);
      if (store.get(ds)) { streak++; d.setDate(d.getDate() - 1); } else break;
    }

    // ---- 目标倒计时 ----
    let goalText = '';
    if (profile.targetWeightKg && profile.weighInDate) {
      const days = fmt.daysBetween(fmt.todayStr(), profile.weighInDate);
      const last = mw.length ? mw[mw.length - 1].kg : null;
      if (last) {
        const gap = Number((last - profile.targetWeightKg).toFixed(1));
        const needPerWeek = days > 0 ? (gap / (days / 7)).toFixed(2) : '—';
        goalText = '距称重 ' + days + ' 天，还需减 ' + gap + 'kg，即每周 ' + needPerWeek + 'kg';
        if (days > 0 && gap / (days / 7) > last * 0.01) goalText += '（超过 1%/周，建议提前启动或调目标）';
        else if (days > 0) goalText += '（在安全区间内）';
      }
    }

    this.setData({
      hasData: true,
      hasDemo: hasDemo,
      points: points, segs: segs,
      rateText: rateText,
      avg7: avg7,
      avg7Text: avg7 ? avg7 + ' kg' : '--',
      proteinRate: proteinRate,
      loadBars: loadBars.map(function (b) {
        return { date: b.date, srpe: b.srpe, h: Math.max(6, Math.round(b.srpe / maxLoad * 160)) };
      }),
      streak: streak,
      goalText: goalText,
      weightRange: weightRange,
      refLine: refLine,
      goalView: goalView,
      logs: logs.map(function (l) {
        return {
          date: l.date, wd: fmt.weekday(l.date),
          kg: (l.weights && l.weights.morning && l.weights.morning.kg) || '--',
          kcal: (l.meals || []).reduce(function (s, m) { return s + (m.kcal || 0); }, 0),
          p: (l.meals || []).reduce(function (s, m) { return s + (m.protein || 0); }, 0)
        };
      })
    });
  },

  openLog(e) {
    const date = e.currentTarget.dataset.date;
    // log 是 tabBar 页，switchTab 不能带参数，用 storage 传递要编辑的日期
    wx.setStorageSync('edit_date', date);
    wx.switchTab({ url: '/pages/log/log' });
  },

  goReport() { wx.navigateTo({ url: '/pages/report/report' }); }
});
