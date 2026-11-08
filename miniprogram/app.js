const config = require('./config.js');
const fmt = require('./utils/format.js');
const store = require('./utils/store.js');
const demoSeed = require('./utils/demoSeed.js');
const privacy = require('./utils/privacy.js');
const historySync = require('./utils/historySync.js');
const subscribe = require('./utils/subscribe.js');

App({
  globalData: {
    openid: '',
    role: 'athlete',     // athlete | coach
    admission: '',       // active | pending | blocked
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
    this.globalData.admission = privacy.admissionState();
    // 执行顺序很关键：先做准入判定，只有已准入用户才导入演示数据。
    // 否则外部新用户打开小程序也会在本机写入一套演示记录。
    // readyPromise 供 api.js 在身份未确认前等待，避免把“还没查到”误判为“待准入”。
    this.readyPromise = this.bootstrap();
  },

  // 演示数据导入：
  // 判断口径不是"logs_v2 是否为空"，而是按 demo 标记区分真实/演示记录。
  // - 有真实记录：只保留真实记录，演示记录自动剔除，永不被 seed 覆盖
  // - 无真实记录：首次/版本变化整批按今天重锚导入；同版本跨天只平移日期；用户清空过则不再导入
  importSeed() {
    try {
      const seed = require('./data/seed.js');
      if (!seed || !seed.length) return;
      const plan = demoSeed.planImport({
        seed: seed,
        logs: store.all(),
        meta: wx.getStorageSync(demoSeed.META_KEY) || null,
        optout: !!wx.getStorageSync(demoSeed.OPTOUT_KEY),
        today: fmt.todayStr()
      });

      if (plan.action === 'keep-real') {
        if (plan.demoCount) store.saveAll(plan.records);
        wx.removeStorageSync(demoSeed.META_KEY);
        console.log('检测到真实记录 ' + plan.realCount + ' 条，已移除演示记录 ' + plan.demoCount + ' 条，未导入 seed');
        return;
      }
      if (plan.action === 'purge-optout' || plan.action === 'skip-optout') {
        if (plan.demoCount) store.saveAll(plan.records);
        wx.removeStorageSync(demoSeed.META_KEY);
        console.log('用户已选择停用演示数据，跳过导入');
        return;
      }
      if (plan.action === 'keep') return;

      store.saveAll(plan.records);
      wx.setStorageSync(demoSeed.META_KEY, plan.meta);
      console.log('演示数据已' + (plan.action === 'shift' ? '平移到今天' : '按今天重锚导入') +
        '：' + plan.meta.count + ' 条，截至 ' + plan.meta.installedEnd);
    } catch (e) { /* 没有 seed 文件也不影响启动 */ }
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
        // 模板 ID 由云函数环境变量下发，前端只缓存；未配置时为空，订阅流程静默跳过
        subscribe.cacheTemplates(d.subscribeTemplates);
        // 身份与准入状态只认服务端返回值，前端缓存的 role 仅作展示兜底。
        // whoami 明确不可用时（ok:false）才走老设备兼容，避免把已准入用户误锁在外面。
        const admission = d.admission || (d.ok === false ? that.fallbackAdmission() : 'pending');
        that.globalData.admission = admission;
        privacy.setAdmission(admission);
        that.globalData.ready = true;
        if (admission === 'active') {
          that.importSeedOnce();
          that.startHistorySync();
        } else that.gotoAdmission();
        if (typeof that.onReady === 'function') that.onReady(d);
        return d;
      })
      .catch(err => {
        console.warn('whoami 失败（云环境未部署时正常）', err);
        that.globalData.ready = true;
        // 离线兼容：有明确准入缓存就沿用；没有缓存的老设备只有 openid 才放行；
        // 新设备无法验证邀请，只能进准入页。
        const admission = that.fallbackAdmission();
        that.globalData.admission = admission;
        privacy.setAdmission(admission);
        if (admission === 'active') {
          that.importSeedOnce();
          that.startHistorySync();
        } else that.gotoAdmission();
        return { ok: false, admission: admission };
      });
  },

  // 无法向服务端确认时的兼容判定：
  // - 已写入过的 admission 一律沿用（pending 不会被网络故障“洗白”）
  // - 升级前的老设备没有 admission 字段，有 openid 说明已在使用，放行
  // - 新设备没有 openid，按待准入处理
  fallbackAdmission() {
    const saved = wx.getStorageSync('admission');
    if (saved) return saved;
    return (wx.getStorageSync('openid') || '') ? 'active' : 'pending';
  },

  // 演示数据只在确认准入后导入一次，避免每次 bootstrap 重复执行
  importSeedOnce() {
    if (this._seedDone) return;
    this._seedDone = true;
    this.importSeed();
  },

  // 启动时在后台把云端历史下沉到本机；首启用分页多拉，之后只拉增量。
  // 失败不阻塞启动，下一次进首页还会用 getFeed 的 14 条继续合并。
  startHistorySync() {
    if (this._historySyncStarted) return;
    this._historySyncStarted = true;
    try {
      historySync.sync({ reason: 'launch' }).catch(function () { /* 离线时静默 */ });
    } catch (e) { /* 不影响启动 */ }
  },

  // 未准入用户统一拦截到说明页；已在该页时不重复跳转
  gotoAdmission() {
    const pages = getCurrentPages ? getCurrentPages() : [];
    const cur = pages.length ? pages[pages.length - 1] : null;
    if (cur && cur.route === 'pages/admission/admission') return;
    wx.reLaunch({ url: '/pages/admission/admission' });
  },

  // 页面用：拿到 openid（必要时等待）
  getOpenid() {
    const that = this;
    const cached = that.globalData.openid || wx.getStorageSync('openid');
    if (cached) return Promise.resolve(cached);
    return that.bootstrap().then(d => d.openid || '');
  }
});
