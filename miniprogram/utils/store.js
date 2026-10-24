// 本地存储层：离线也能用，网络恢复后再补同步。
const KEY = 'logs_v2';
const PENDING = 'pending_sync';

function all() {
  try { return wx.getStorageSync(KEY) || []; } catch (e) { return []; }
}

function saveAll(list) {
  try { wx.setStorageSync(KEY, list); } catch (e) {}
}

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

module.exports = { all: all, upsert: upsert, get: get, recent: recent, morningWeights: morningWeights, addPending: addPending, pending: pending, clearPending: clearPending };
