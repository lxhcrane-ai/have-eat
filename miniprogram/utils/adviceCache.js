// 建议本机缓存：键名集中在这里，避免各页面各写一套。
// - 首页卡：advice_cur_v1_<YYYY-MM-DD>，只读当天键；跨天自动失效。
// - 历史页：advice_hist_v1_<athleteId|self>，只缓存第一页，超过 24h 失效。
// - 审阅草稿备份：advice_backup_v1_<athleteId>_<YYYY-MM-DD>，超过 7 天清理。
// 所有写入都会顺带 prune，缓存不会无界增长。
const fmt = require('./format.js');

const CURRENT = 'advice_cur_v1_';
const HISTORY = 'advice_hist_v1_';
const BACKUP = 'advice_backup_v1_';
const TTL = {
  CURRENT: 7 * 24 * 3600 * 1000,
  HISTORY: 24 * 3600 * 1000,
  BACKUP: 7 * 24 * 3600 * 1000
};

function read(key) {
  try { return wx.getStorageSync(key) || null; } catch (e) { return null; }
}

function owner() {
  try { return wx.getStorageSync('openid') || ''; } catch (e) { return ''; }
}

// 同一台设备换微信账号时，旧账号缓存的建议/草稿不能被新账号读到。
// 旧版本缓存没有 owner 字段，无法追溯，只能在下次写入时补上；这里保持兼容。
function sameOwner(v) {
  if (!v || !v.owner) return true;
  return owner() === v.owner;
}

function write(key, value) {
  try { wx.setStorageSync(key, value); } catch (e) {}
}

function remove(key) {
  try { wx.removeStorageSync(key); } catch (e) {}
}

function fresh(value, ttl) {
  if (!value || !value.savedAt) return false;
  const t = new Date(value.savedAt).getTime();
  if (isNaN(t)) return false;
  return (Date.now() - t) <= ttl;
}

function currentKey(date) { return CURRENT + date; }
function historyKey(athleteId) { return HISTORY + (athleteId || 'self'); }
function backupKey(athleteId, date) { return BACKUP + athleteId + '_' + date; }

function readCurrent(date) {
  const v = read(currentKey(date));
  if (!v || !v.advice || v.date !== date) return null;
  if (!fresh(v, TTL.CURRENT) || !sameOwner(v)) { remove(currentKey(date)); return null; }
  return v;
}

function writeCurrent(date, advice) {
  write(currentKey(date), { date: date, advice: advice, owner: owner(), savedAt: fmt.nowIso() });
  prune();
}

function clearCurrent(date) { remove(currentKey(date)); }

function readHistory(athleteId) {
  const v = read(historyKey(athleteId));
  if (!v || !Array.isArray(v.items)) return null;
  if (!fresh(v, TTL.HISTORY) || !sameOwner(v)) { remove(historyKey(athleteId)); return null; }
  return v;
}

function writeHistory(athleteId, payload) {
  write(historyKey(athleteId), {
    items: (payload && payload.items) || [],
    nextBefore: (payload && payload.nextBefore) || '',
    owner: owner(),
    savedAt: fmt.nowIso()
  });
  prune();
}

function readBackup(athleteId, date) {
  const v = read(backupKey(athleteId, date));
  if (!v || !fresh(v, TTL.BACKUP) || !sameOwner(v)) return null;
  return v;
}

function writeBackup(athleteId, date, data) {
  write(backupKey(athleteId, date), Object.assign({}, data, { owner: owner(), savedAt: fmt.nowIso() }));
  prune();
}

function clearBackup(athleteId, date) { remove(backupKey(athleteId, date)); }

// 只清理本模块前缀下过期项；遇到无法解析的键保持原样
// 写草稿是逐字触发的，prune 最多 5 分钟一次，避免每次输入都遍历 storage
let lastPruneAt = 0;
function prune() {
  const now = Date.now();
  if (now - lastPruneAt < 5 * 60 * 1000) return;
  lastPruneAt = now;
  let keys = [];
  try { keys = (wx.getStorageInfoSync() || {}).keys || []; } catch (e) { return; }
  const prefixes = [CURRENT, HISTORY, BACKUP];
  keys.forEach(function (key) {
    if (prefixes.some(function (p) { return key.indexOf(p) === 0; })) {
      const v = read(key);
      if (!v || !v.savedAt) { remove(key); return; }
      const t = new Date(v.savedAt).getTime();
      let ttl = TTL.CURRENT;
      if (key.indexOf(HISTORY) === 0) ttl = TTL.HISTORY;
      if (key.indexOf(BACKUP) === 0) ttl = TTL.BACKUP;
      if (isNaN(t) || (Date.now() - t) > ttl) remove(key);
    }
  });
}

module.exports = {
  currentKey: currentKey,
  historyKey: historyKey,
  backupKey: backupKey,
  readCurrent: readCurrent,
  writeCurrent: writeCurrent,
  clearCurrent: clearCurrent,
  readHistory: readHistory,
  writeHistory: writeHistory,
  readBackup: readBackup,
  writeBackup: writeBackup,
  clearBackup: clearBackup,
  prune: prune
};
