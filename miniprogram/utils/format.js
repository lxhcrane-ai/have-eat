function pad(n) { return n < 10 ? '0' + n : '' + n; }

// 本地日期 YYYY-MM-DD（使用设备时区，而不是 UTC）
function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function nowIso() { return new Date().toISOString(); }

function tzOffsetMinutes() { return -new Date().getTimezoneOffset(); }

function timeStr(d) {
  d = d || new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function round1(v) { return Math.round(v * 10) / 10; }

function weekday(dateStr) {
  var names = ['日', '一', '二', '三', '四', '五', '六'];
  var d = new Date(dateStr + 'T00:00:00');
  return '周' + names[d.getDay()];
}

function daysBetween(a, b) {
  var t1 = new Date(a + 'T00:00:00').getTime();
  var t2 = new Date(b + 'T00:00:00').getTime();
  return Math.round((t2 - t1) / 86400000);
}

module.exports = { todayStr: todayStr, nowIso: nowIso, tzOffsetMinutes: tzOffsetMinutes, timeStr: timeStr, round1: round1, weekday: weekday, daysBetween: daysBetween };
