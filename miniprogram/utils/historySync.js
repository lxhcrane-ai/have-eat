// 云端历史下沉本机：把 getFeed 返回的日志批量合并进 logs_v2。
//
// 合并优先级（高 -> 低）：
//   1. 本机 pending_sync（尚未上传成功的记录）：绝不被云端覆盖
//   2. 云端记录：同一天以云端为准
//   3. 本机演示记录（demo:true / seed-*）：一旦云端出现任何真实记录，整批剔除
//
// 只落 payload，不落服务端 feedback：feedback 可能是旧规则版本，
// 读取展示的页面统一用本地 rules.evaluate 重算。
//
// 云端未返回某一天时，不删除本机记录：可能是分页没覆盖、账号解绑或云端误删。
// 本机保留，用户下次保存会重新上传（等于恢复），避免同步把唯一副本删掉。
const api = require('./api.js');
const store = require('./store.js');
const fmt = require('./format.js');
const privacy = require('./privacy.js');

const META_KEY = 'history_sync_v1';
const PAGE_DAYS = 90;          // getFeed 单次范围上限，按 90 天分页
const MAX_PAGES = 3;           // 首启最多回溯 270 天
const MAX_CLOUD_LOGS = 300;    // 单次同步最多处理的云端条数
const MAX_LOCAL_LOGS = 240;    // 本机最多保留条数（只裁剪云端来源，不裁本机记录）
const INCREMENTAL_DAYS = 14;   // 日常增量窗口
const MIN_INTERVAL_MS = 10 * 60 * 1000;

let running = null;

function meta() {
  try { return wx.getStorageSync(META_KEY) || {}; } catch (e) { return {}; }
}

function saveMeta(m) {
  try { wx.setStorageSync(META_KEY, m); } catch (e) { /* 元信息丢了下一次会重试 */ }
}

function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return fmt.todayStr(d);
}

// 只有已准入的拳王才需要把“自己的”历史落本机；教练端不落他人数据。
function canSync() {
  try {
    if (privacy.admissionState() !== 'active') return false;
    return (wx.getStorageSync('role') || 'athlete') !== 'coach';
  } catch (e) { return false; }
}

function sortDesc(list) {
  return (list || []).slice().sort(function (a, b) {
    const av = (a && a.date) || '';
    const bv = (b && b.date) || '';
    if (av === bv) return 0;
    return av < bv ? 1 : -1;
  });
}

// 云端日志 -> 本机 payload；不接受云端演示数据，避免把演示混进真实统计。
function payloadOf(item) {
  if (!item) return null;
  const p = item.payload || item;
  if (!p || !p.date) return null;
  if (store.isDemo(p)) return null;
  return Object.assign({}, p, { _sync: 'cloud' });
}

function mergeCloudLogs(cloudLogs) {
  const pendingMap = {};
  store.pending().forEach(function (d) { pendingMap[d] = true; });

  const local = store.all();
  const byDate = {};
  local.forEach(function (l) {
    if (l && l.date) byDate[l.date] = l;
  });

  const real = [];
  (cloudLogs || []).forEach(function (item) {
    const p = payloadOf(item);
    if (p) real.push(p);
  });

  // 云端没有真实记录：不动本机（包括演示数据）
  if (!real.length) {
    return {
      ok: true, changed: false, cloud: 0, added: 0, updated: 0,
      conflicts: 0, demoRemoved: 0, trimmed: 0, storageFull: false
    };
  }

  let added = 0;
  let updated = 0;
  let conflicts = 0;
  let demoOverwritten = 0;

  real.forEach(function (p) {
    const date = p.date;
    // 本机未同步记录优先：保留用户刚填、还没上传成功的版本
    if (pendingMap[date]) { conflicts++; return; }
    const old = byDate[date];
    if (old) {
      if (store.isDemo(old)) demoOverwritten++;
      else if (JSON.stringify(old) !== JSON.stringify(p)) updated++;
    } else {
      added++;
    }
    byDate[date] = p;
  });

  // 有真实云端记录 -> 演示数据整批剔除，避免真假混排
  let demoRemoved = demoOverwritten;
  Object.keys(byDate).forEach(function (k) {
    if (store.isDemo(byDate[k])) { delete byDate[k]; demoRemoved++; }
  });

  let list = sortDesc(Object.keys(byDate).map(function (k) { return byDate[k]; }));

  // 容量保护：只裁剪最旧的“云端来源”记录，且不碰 pending；本机记录一律不裁。
  let trimmed = 0;
  if (list.length > MAX_LOCAL_LOGS) {
    const need = list.length - MAX_LOCAL_LOGS;
    const drop = {};
    const oldestFirst = list.slice().reverse();
    for (let i = 0; i < oldestFirst.length && trimmed < need; i++) {
      const l = oldestFirst[i];
      if (l._sync === 'cloud' && !pendingMap[l.date]) { drop[l.date] = true; trimmed++; }
    }
    if (trimmed) list = list.filter(function (l) { return !drop[l.date]; });
  }

  if (!added && !updated && !demoRemoved && !trimmed) {
    return {
      ok: true, changed: false, cloud: real.length, added: 0, updated: 0,
      conflicts: conflicts, demoRemoved: 0, trimmed: 0, storageFull: false
    };
  }

  const wrote = store.saveAll(list);
  if (!wrote) {
    return {
      ok: false, storageFull: true, changed: false, cloud: real.length,
      added: added, updated: updated, conflicts: conflicts,
      demoRemoved: demoRemoved, trimmed: trimmed, error: store.lastWriteError()
    };
  }

  return {
    ok: true, changed: true, cloud: real.length, added: added, updated: updated,
    conflicts: conflicts, demoRemoved: demoRemoved, trimmed: trimmed, storageFull: false
  };
}

function fetchPage(from, to) {
  return api.call('getFeed', { from: from, to: to }).then(function (res) {
    if (!res || !res.ok) {
      return {
        ok: false, offline: !!(res && res.offline),
        error: (res && res.error) || '读取云端历史失败',
        logs: []
      };
    }
    return { ok: true, logs: res.logs || [] };
  });
}

async function doSync(m) {
  const full = !m.fullDone;
  const to = fmt.todayStr();
  let logs = [];
  let pages = 0;
  let complete = true;

  if (full) {
    for (let i = 0; i < MAX_PAGES; i++) {
      const pageTo = shiftDate(to, -i * PAGE_DAYS);
      const pageFrom = shiftDate(pageTo, -(PAGE_DAYS - 1));
      const r = await fetchPage(pageFrom, pageTo);
      if (!r.ok) {
        // 第一页就失败：整体失败，不写 meta，下次重试；后续页失败则保留已拿到的部分
        if (!i) return r;
        complete = false;
        break;
      }
      pages++;
      logs = logs.concat(r.logs);
      if (logs.length >= MAX_CLOUD_LOGS) break;
      // 连续两页都没有数据就不必再往更早翻
      if (!r.logs.length && i > 0) break;
    }
  } else {
    const pageFrom = shiftDate(to, -(INCREMENTAL_DAYS - 1));
    const r = await fetchPage(pageFrom, to);
    if (!r.ok) return r;
    pages = 1;
    logs = r.logs;
  }

  const merged = mergeCloudLogs(logs);
  if (!merged.ok) return merged;
  return Object.assign({}, merged, {
    fullDone: !!m.fullDone || (full && complete),
    pages: pages
  });
}

function sync(opts) {
  if (!canSync()) return Promise.resolve({ ok: false, skipped: 'not-athlete' });
  if (running) return running;

  const reason = (opts && opts.reason) || 'manual';
  const m = meta();
  if (reason === 'home' && m.lastSyncAt && Date.now() - m.lastSyncAt < MIN_INTERVAL_MS) {
    return Promise.resolve({ ok: true, skipped: 'throttle' });
  }

  running = doSync(m)
    .then(function (r) {
      if (r && r.ok) {
        saveMeta({
          fullDone: !!r.fullDone,
          lastSyncAt: Date.now(),
          lastDate: fmt.todayStr(),
          total: store.all().length
        });
      }
      return r;
    })
    .catch(function (e) {
      return { ok: false, error: (e && e.message) || '云端历史同步失败', offline: true };
    })
    .then(function (r) { running = null; return r; });

  return running;
}

// 首页已经拿到 getFeed 的 14 条：直接合并，省一次云函数调用。
function absorb(logs) {
  if (!canSync()) return { ok: false, skipped: 'not-athlete' };
  const merged = mergeCloudLogs(logs);
  if (merged.ok && merged.changed) {
    const m = meta();
    saveMeta({
      fullDone: !!m.fullDone,
      lastSyncAt: Date.now(),
      lastDate: fmt.todayStr(),
      total: store.all().length
    });
  }
  return merged;
}

module.exports = {
  META_KEY: META_KEY,
  MAX_LOCAL_LOGS: MAX_LOCAL_LOGS,
  sync: sync,
  absorb: absorb,
  mergeCloudLogs: mergeCloudLogs
};
