const weekly = require('../../utils/weekly.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const api = require('../../utils/api.js');
const poster = require('../../utils/poster.js');
const privacy = require('../../utils/privacy.js');

// “本周”沿用页面的滚动 7 天口径：endDate 为今天；上一周为 endDate 前移 7 天
function weekLabelOf(endDate, today) {
  if (endDate === today) return '本周（近 7 天）';
  if (endDate === weekly.shift(today, -7)) return '上一周';
  return '所选周';
}

function askOpenSetting(resolve) {
  wx.showModal({
    title: '需要相册权限',
    content: '保存长图需要允许「保存到相册」。点“去设置”打开权限页，把「保存到相册」打开后再回来保存。',
    confirmText: '去设置',
    success: function (r) {
      if (!r.confirm) { resolve(false); return; }
      wx.openSetting({
        success: function () { resolve(false); },   // 让用户回到页面后重新点保存
        fail: function () { resolve(false); }
      });
    },
    fail: function () { resolve(false); }
  });
}

function ensureAlbumAuth() {
  return new Promise(function (resolve) {
    wx.getSetting({
      success: function (res) {
        const st = (res && res.authSetting) || {};
        const v = st['scope.writePhotosAlbum'];
        if (v === true) { resolve(true); return; }
        if (v === false) { askOpenSetting(resolve); return; }
        // 尚未询问过：首次保存主动请求授权
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: function () { resolve(true); },
          fail: function () { askOpenSetting(resolve); }
        });
      },
      fail: function () { resolve(true); }   // 读不到设置就直接尝试保存，由系统弹窗
    });
  });
}

function saveOne(path) {
  return new Promise(function (resolve, reject) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () { resolve(true); },
      fail: function (err) {
        const msg = (err && err.errMsg) || '';
        if (/auth|deny|permission/i.test(msg)) {
          askOpenSetting(function () { reject(new Error('未获得相册权限，长图没有保存')); });
        } else {
          reject(new Error('保存失败：' + msg));
        }
      }
    });
  });
}

Page({
  data: {
    endDate: '', fromDate: '', days: 7, weekLabel: '',
    loading: true, isCoachView: false, athleteName: '',
    source: '', sourceLabel: '', isDemo: false,
    w: null, cmp: null, error: '', errorOffline: false,
    emptyTitle: '', emptyHint: '',
    maxHit: 1,
    prevHasData: false, prevLoggedDays: 0,
    exporting: false, hasPoster: false, posterCount: 0, posterPaths: []
  },

  onLoad(query) {
    privacy.lockShare();
    const endDate = (query && query.endDate) || fmt.todayStr();
    let name = (query && query.name) || '';
    try { name = decodeURIComponent(name); } catch (e) { /* 已解码或不合法时按原值展示 */ }
    this.setData({
      endDate: endDate,
      athleteId: (query && query.athleteId) || '',
      athleteName: name,
      weekLabel: weekLabelOf(endDate, fmt.todayStr())
    });
  },

  onShow() { this.load(); },

  async load() {
    const endDate = this.data.endDate;
    const days = this.data.days || 7;
    const fromDate = weekly.shift(endDate, -(days - 1));
    const prevEnd = weekly.shift(endDate, -7);
    const fetchFrom = weekly.shift(fromDate, -7);   // 一次取两周（14 天），用于跨周对比
    const weekLabel = weekLabelOf(endDate, fmt.todayStr());
    let athleteId = this.data.athleteId || '';
    let isCoachView = !!athleteId;

    this.setData({
      loading: true, error: '', errorOffline: false,
      fromDate: fromDate, weekLabel: weekLabel, isCoachView: isCoachView,
      exporting: false, hasPoster: false, posterCount: 0, posterPaths: [], cmp: null,
      prevHasData: false, prevLoggedDays: 0
    });

    const profile0 = wx.getStorageSync('profile') || {};
    let logs = [];
    let profile = isCoachView ? {} : profile0;
    let athleteName = this.data.athleteName || '';
    let source = '';
    let error = '';
    let errorOffline = false;

    if (isCoachView) {
      // 教练视角：只读云端该拳王的记录。本机 store 是教练自己的日志，绝不能回退
      const res = await api.call('getFeed', {
        action: 'detail', athleteId: athleteId, from: fetchFrom, to: endDate
      });
      if (res && res.ok) {
        source = 'cloud';
        logs = (res.logs || []).map(function (x) { return x.payload; }).filter(Boolean);
        if (res.role !== 'coach') {
          // 前端 query 里的 athleteId 不能改变身份：非教练账号按本人视角展示
          isCoachView = false;
          athleteId = '';
          athleteName = '';
          profile = res.profile || profile0;
        } else {
          const a = (res.athletes || []).filter(function (x) { return x.openid === athleteId; })[0];
          privacy.setOwnedAthletes(res.athletes || []);
          if (a) {
            profile = a.profile || {};
            athleteName = a.name || athleteName;
          }
        }
      } else {
        error = (res && res.offline) ? '离线：无法读取该拳王的云端记录' : ((res && res.error) || '读取失败');
        errorOffline = !!(res && res.offline);
      }
    } else {
      // 本人视角：云端优先；云端不可用或该周无记录时允许本机缓存，并在页面上标注来源
      const res = await api.call('getFeed', { from: fetchFrom, to: endDate });
      if (res && res.ok) {
        source = 'cloud';
        logs = (res.logs || []).map(function (x) { return x.payload; }).filter(Boolean);
        profile = res.profile || profile0;
      }
      const local = store.recent(60);
      if (!logs.length && local.length) {
        logs = local;
        profile = profile0;
        source = 'local';
      }
    }

    const curW = logs.length
      ? weekly.buildWeekly({ logs: logs, profile: profile, endDate: endDate, days: days })
      : null;
    // 本周窗口内一条都没有时按"无记录"处理，不渲染一张全是 0 的卡
    const w = (curW && curW.loggedDays > 0) ? curW : null;

    // 上一周：只喂 <= prevEnd 的记录，避免本周（未来）数据影响上一周的规则判断
    const prevLogs = logs.filter(function (l) {
      return l && l.date && l.date <= prevEnd;
    });
    const prevW = prevLogs.length
      ? weekly.buildWeekly({ logs: prevLogs, profile: profile, endDate: prevEnd, days: days })
      : null;
    const prevHasData = !!(prevW && prevW.loggedDays > 0);
    const cmp = w ? weekly.compareWeekly(w, prevW) : null;

    const maxHit = w
      ? Math.max.apply(null, w.ruleHits.map(function (h) { return h.count; }).concat([1]))
      : 1;

    let emptyTitle = '';
    let emptyHint = '';
    if (!w) {
      if (isCoachView && error) {
        emptyTitle = error;
        emptyHint = errorOffline
          ? '联网后重试；也可以先切换到上一周/本周查看其他时间（同样需要联网）。'
          : '请确认该拳王仍绑定在你的账号下，或返回看板重试。';
      } else if (isCoachView) {
        emptyTitle = '该拳王这一周没有记录';
        emptyHint = '让他补填这段时间的日志，或切换到上一周/本周查看其他时间。';
      } else {
        emptyTitle = '这一周还没有记录';
        emptyHint = '先补记今天的记录；离线时会显示上次同步到本机的数据。';
      }
      if (prevHasData) {
        emptyHint += ' 上一周有 ' + prevW.loggedDays + ' 天记录，可点「改查上一周」。';
      }
    }

    // 只要这一周用到了演示记录，来源就标成演示，绝不显示成真实数据
    const isDemo = logs.some(function (l) { return store.isDemo(l); });
    let sourceLabel = '';
    if (w && source) {
      sourceLabel = isDemo
        ? '演示数据 · 非真实记录'
        : (source === 'cloud'
          ? (isCoachView ? '云端数据 · 该拳王记录' : '云端数据 · 本人记录')
          : '本机数据（离线/未同步）');
    }

    this.setData({
      loading: false,
      w: w,
      cmp: cmp,
      isDemo: isDemo,
      fromDate: fromDate,
      profile: profile,
      isCoachView: isCoachView,
      athleteName: athleteName,
      source: source,
      sourceLabel: sourceLabel,
      weekLabel: weekLabel,
      error: error,
      errorOffline: errorOffline,
      emptyTitle: emptyTitle,
      emptyHint: emptyHint,
      maxHit: maxHit,
      prevHasData: prevHasData,
      prevLoggedDays: prevHasData ? prevW.loggedDays : 0
    });
  },

  prevWeek() {
    this.setData({ endDate: weekly.shift(this.data.endDate, -7) });
    this.load();
  },
  nextWeek() {
    const next = weekly.shift(this.data.endDate, 7);
    if (next > fmt.todayStr()) { wx.showToast({ title: '还没到下周', icon: 'none' }); return; }
    this.setData({ endDate: next });
    this.load();
  },
  thisWeek() {
    this.setData({ endDate: fmt.todayStr() });
    this.load();
  },

  copyText() {
    const text = this.data.w && this.data.w.text;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success() { wx.showToast({ title: '周报已复制，可粘贴给教练', icon: 'none' }); }
    });
  },

  // ---------- 长图 ----------

  getCanvasNode() {
    return new Promise(function (resolve, reject) {
      wx.createSelectorQuery()
        .select('#posterCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          const item = res && res[0];
          if (!item || !item.node) {
            reject(new Error('当前微信版本不支持长图导出（需要 2.9 及以上）'));
            return;
          }
          resolve(item.node);
        });
    });
  },

  canvasToFile(canvas, widthPx, heightPx) {
    return new Promise(function (resolve, reject) {
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: widthPx, height: heightPx,
        destWidth: widthPx, destHeight: heightPx,
        fileType: 'png',
        success: function (r) { resolve(r.tempFilePath); },
        fail: function (err) {
          reject(new Error('导出图片失败：' + ((err && err.errMsg) || '未知错误')));
        }
      });
    });
  },

  async buildPosterImages() {
    const node = await this.getCanvasNode();
    const scale = 2;   // 750 逻辑宽 → 1500 像素，兼顾清晰度与内存
    node.width = poster.PAGE_W * scale;
    node.height = poster.PAGE_H * scale;

    const ctx = node.getContext('2d');
    ctx.scale(scale, scale);
    const measure = function (text, font) {
      ctx.font = font;
      return ctx.measureText(String(text)).width;
    };

    const w = this.data.w;
    const input = {
      view: this.data.isCoachView ? 'coach' : 'self',
      athleteName: this.data.athleteName,
      weekLabel: this.data.weekLabel,
      phaseLabel: w ? w.phaseLabel : '',
      fromDate: this.data.fromDate,
      endDate: this.data.endDate,
      source: this.data.source,
      sourceLabel: this.data.sourceLabel,
      generatedAt: fmt.todayStr() + ' ' + fmt.timeStr(),
      w: w,
      cmp: this.data.cmp
    };

    const pages = poster.buildPages(input, measure);
    if (!pages.length) throw new Error('没有可绘制的内容');

    const paths = [];
    for (let i = 0; i < pages.length; i++) {
      poster.renderPage(ctx, pages[i], input, i, pages.length);
      const path = await this.canvasToFile(node, poster.PAGE_W * scale, poster.PAGE_H * scale);
      paths.push(path);
    }
    return paths;
  },

  async exportPoster() {
    if (this.data.exporting) return;
    if (!this.data.w) {
      wx.showToast({ title: '这一周没有可导出的记录', icon: 'none' });
      return;
    }
    this.setData({ exporting: true });
    try {
      const paths = await this.buildPosterImages();
      this.setData({
        exporting: false, hasPoster: true,
        posterPaths: paths, posterCount: paths.length
      });
      wx.previewImage({
        urls: paths,
        current: paths[0],
        fail: function () { wx.showToast({ title: '长图已生成，可点「保存长图到相册」', icon: 'none' }); }
      });
    } catch (e) {
      this.setData({ exporting: false });
      wx.showModal({
        title: '长图生成失败',
        content: (e && e.message) || '请稍后重试',
        showCancel: false
      });
    }
  },

  async savePoster() {
    const paths = this.data.posterPaths || [];
    if (!paths.length) return;
    const granted = await ensureAlbumAuth();
    if (!granted) return;
    try {
      for (let i = 0; i < paths.length; i++) await saveOne(paths[i]);
      wx.showToast({
        title: paths.length > 1 ? '已保存 ' + paths.length + ' 张到相册' : '已保存到相册',
        icon: 'success'
      });
    } catch (e) {
      wx.showModal({
        title: '保存失败',
        content: (e && e.message) || '请检查相册权限后重试',
        showCancel: false
      });
    }
  },

  goLog() { wx.switchTab({ url: '/pages/log/log' }); },
  goBackCoach() {
    wx.navigateBack({
      fail() { wx.navigateTo({ url: '/pages/coach/coach' }); }
    });
  }
});
