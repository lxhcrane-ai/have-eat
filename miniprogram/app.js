const config = require('./config.js');

App({
  globalData: {
    openid: '',
    role: 'athlete',     // athlete | coach
    config: config,
    ready: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库以使用云能力');
      return;
    }
    // env 未配置时不要传占位符（会静默失败），交给开发者工具默认环境 + 离线兜底
    const envOk = config.env && String(config.env).indexOf('YOUR-') !== 0;
    wx.cloud.init(envOk ? { env: config.env, traceUser: true } : { traceUser: true });

    // 先用缓存，保证离线可用
    const cachedOpenid = wx.getStorageSync('openid');
    const cachedRole = wx.getStorageSync('role');
    if (cachedOpenid) {
      this.globalData.openid = cachedOpenid;
      this.globalData.role = cachedRole || 'athlete';
    }
    this.importSeed();
    this.bootstrap();
  },

  // 首次启动导入种子数据（data/seed.js 非空时）
  importSeed() {
    try {
      const seed = require('./data/seed.js');
      const existing = wx.getStorageSync('logs_v2');
      if (!existing || !existing.length) {
        if (seed && seed.length) {
          wx.setStorageSync('logs_v2', seed);
          console.log('已导入种子记录 ' + seed.length + ' 条');
        }
      }
    } catch (e) { /* 没有 seed 文件也不影响 */ }
  },

  bootstrap() {
    const that = this;
    return wx.cloud.callFunction({ name: 'whoami' })
      .then(res => {
        const d = (res && res.result) || {};
        if (d.openid) {
          that.globalData.openid = d.openid;
          wx.setStorageSync('openid', d.openid);
        }
        if (d.role) {
          that.globalData.role = d.role;
          wx.setStorageSync('role', d.role);
        }
        that.globalData.ready = true;
        if (typeof that.onReady === 'function') that.onReady(d);
        return d;
      })
      .catch(err => {
        console.warn('whoami 失败（云环境未部署时正常）', err);
        that.globalData.ready = true;
        return { ok: false };
      });
  },

  // 页面用：拿到 openid（必要时等待）
  getOpenid() {
    const that = this;
    const cached = that.globalData.openid || wx.getStorageSync('openid');
    if (cached) return Promise.resolve(cached);
    return that.bootstrap().then(d => d.openid || '');
  }
});
