// 本地存储层：离线也能用，网络恢复后再补同步。
const demoSeed = require('./demoSeed.js');

const KEY = 'logs_v2';
const PENDING = 'pending_sync';

// 微信小程序单个 storage key 上限约 1MB。这里留 8KB 余量给序列化波动，
// 超限时明确失败而不是让 setStorageSync 抛错后被静默吞掉。
const MAX_BYTES = 1024 * 1024 - 8 * 1024;
let lastError = '';

function all() {
  try { return wx.getStorageSync(KEY) || []; } catch (e) { return []; }
}

function byteLength(str) {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c <= 0x7f) bytes += 1;
    else if (c <= 0x7ff) bytes += 2;
    else bytes += 3;
  }
  return bytes;
}

function estimateBytes(list) {
  try { return byteLength(JSON.stringify(list || [])); } catch (e) { return Infinity; }
}

// 返回 true/false：历史同步与保存记录都要能感知“这次没写进去”
function saveAll(list) {
  const textSafe = Array.isArray(list) ? list : [];
  if (estimateBytes(textSafe) > MAX_BYTES) {
    lastError = '本机存储空间不足（单键上限约 1MB），本次未写入';
    console.warn(lastError);
    return false;
  }
  try {
    wx.setStorageSync(KEY, textSafe);
    lastError = '';
    return true;
  } catch (e) {
    lastError = '本机存储写入失败：' + ((e && (e.errMsg || e.message)) || '未知错误');
    console.warn(lastError);
    return false;
  }
}

function lastWriteError() { return lastError; }

function upsert(log) {
  var list = all();
  var i = -1;
  for (var k = 0; k < list.length; k++) { if (list[k].date === log.date) { i = k; break; } }
  if (i >= 0) list[i] = log; else list.push(log);
  list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  saveAll(list);
  return log;
}

function get(date) {
  var list = all();
  for (var i = 0; i < list.length; i++) if (list[i].date === date) return list[i];
  return null;
}

function recent(n) {
  return all().slice(0, n || 14);
}

// 晨重序列（给趋势和速率用）
function morningWeights(limit) {
  return all().slice(0, limit || 21).filter(function (l) {
    return l.weights && l.weights.morning && l.weights.morning.kg;
  }).map(function (l) { return { date: l.date, kg: l.weights.morning.kg }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function addPending(date) {
  var p = wx.getStorageSync(PENDING) || [];
  if (p.indexOf(date) < 0) p.push(date);
  wx.setStorageSync(PENDING, p);
}

function pending() { return wx.getStorageSync(PENDING) || []; }

function clearPending(date) {
  var p = (wx.getStorageSync(PENDING) || []).filter(function (d) { return d !== date; });
  wx.setStorageSync(PENDING, p);
}

// 演示数据识别：demo:true 为准，旧版本 seed-* id 兜底
function isDemo(log) { return demoSeed.isDemo(log); }

function demoCount() {
  return all().filter(isDemo).length;
}

// 真实记录落盘时调用：演示数据整批移除，避免真假混排
function removeDemo() {
  var list = all();
  var kept = list.filter(function (l) { return !isDemo(l); });
  if (kept.length !== list.length) saveAll(kept);
  return list.length - kept.length;
}

module.exports = {
  all: all, saveAll: saveAll, upsert: upsert, get: get, recent: recent,
  morningWeights: morningWeights, addPending: addPending, pending: pending, clearPending: clearPending,
  isDemo: isDemo, demoCount: demoCount, removeDemo: removeDemo,
  estimateBytes: estimateBytes, lastWriteError: lastWriteError
};
