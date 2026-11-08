// 跟进队列端到端演示：3 名拳手 × 2 天，展示生成 → 连续合并 → 升级置顶 → 确认 → 次日提醒。
// 用法：node scripts/demo-followup.js
const path = require('path');
const fu = require(path.join(__dirname, '../miniprogram/utils/followup.js'));
const fixture = require('./fixtures/followup-demo.js');

const D1 = fixture.D1, D2 = fixture.D2;

function line() { console.log('─'.repeat(72)); }

console.log('\n===== 第 1 天（' + D1 + '）生成队列 =====');
const q1 = fu.generateQueue({ date: D1, athletes: fixture.athletes, history: [], now: D1 + 'T20:00:00Z' });
fu.groupForNutritionist(q1.items, D1).groups.forEach(function (g) {
  console.log(g.name + '（' + g.items.length + ' 项）');
  g.items.forEach(function (i) {
    console.log('  [' + i.level + '] ' + i.ruleId + ' ' + i.title);
    console.log('        证据：' + i.evidence);
  });
});
console.log('小计：' + q1.stats.total + ' 项 / ' + q1.stats.athletes + ' 名拳手' +
  '；小马与阿杰当天正常，队列为空（没有制造无意义待办）');

console.log('\n===== 营养师当天没有处理，全部保持 pending =====');
const history = q1.items.map(function (i) { return Object.assign({}, i, { status: 'pending' }); });

console.log('\n===== 第 2 天（' + D2 + '）队列：连续天数合并 + 升级置顶 =====');
const q2 = fu.generateQueue({ date: D2, athletes: fixture.athletesDay2, history: history, now: D2 + 'T20:00:00Z' });
console.log('顶部数字：' + q2.stats.total + ' 件事待处理，其中 ' + q2.stats.escalated + ' 项升级为人工介入');
line();
fu.groupForNutritionist(q2.items, D2).groups.forEach(function (g) {
  console.log('\n【' + g.name + '】' + g.count + ' 项，升级 ' + g.escalated + ' 项，最高级别 ' + g.maxLevel);
  g.items.forEach(function (i) {
    const tag = i.escalated ? '升级' : i.level;
    console.log('  [' + tag + '] ' + i.ruleId + ' ' + i.title + '（连续 ' + i.consecutiveDays + ' 天）');
    console.log('        证据：' + i.evidence);
    console.log('        建议：' + i.suggestedAction);
    if (i.escalated) console.log('        升级原因：' + i.escalationReason);
  });
});
line();

console.log('\n===== 营养师处理小马的"补液执行率" =====');
const target = q2.items.filter(function (i) {
  return i.athleteId === 'xiao-ma' && i.ruleId === 'HYD-05';
})[0];
console.log('跟进项：' + target.ruleId + ' ' + target.title);
console.log('系统建议：' + target.suggestedAction);
const edited = '小马，昨天补液 2100/3000ml，差得有点多。今天每小时 300ml，分 5 次喝完，必须含钠。';
const reminder = fu.buildReminder(target, edited, 'coach-openid-1');
console.log('营养师改写文案 →');
console.log('  次日（' + reminder.date + '）拳王端只看到这一段：');
console.log('  "' + reminder.text + '"');
console.log('  可回溯：ruleId=' + reminder.ruleId + '，fromItemId=' + reminder.fromItemId);

console.log('\n===== 对照：如果营养师第 1 天就确认了，连续天数会重置 =====');
const resolved = q1.items.map(function (i) { return Object.assign({}, i, { status: 'confirmed' }); });
const q2b = fu.generateQueue({ date: D2, athletes: fixture.athletesDay2, history: resolved, now: D2 + 'T21:00:00Z' });
const hyd = q2b.items.filter(function (i) { return i.athleteId === 'a-li' && i.ruleId === 'HYD-01'; })[0];
console.log('阿力 HYD-01：连续 ' + hyd.consecutiveDays + ' 天，升级=' + hyd.escalated + '（预期 1 天、不升级）');

console.log('\n===== 后台分组视图（只含待处理） =====');
const groups = fu.groupForNutritionist(q2.items.map(function (i, idx) {
  return idx === 0 ? Object.assign({}, i, { status: 'confirmed' }) : i;   // 假设第一项已被确认
}), D2).groups;
groups.forEach(function (g) {
  console.log('  ' + g.name + '：' + g.count + ' 项' + (g.escalated ? '（' + g.escalated + ' 项升级）' : ''));
});
console.log('  已确认项不出现在待处理里：' + (groups.reduce(function (n, g) { return n + g.items.length; }, 0) === q2.items.length - 1));
