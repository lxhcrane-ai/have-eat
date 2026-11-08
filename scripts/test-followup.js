// 跟进队列测试 + 模拟数据集（3 名拳手 × 2 天）
// 用法：node scripts/test-followup.js
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));
const fu = require(path.join(__dirname, '../miniprogram/utils/followup.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function has(items, ruleId) { return items.some(function (i) { return i.ruleId === ruleId; }); }
function get(items, ruleId) { return items.filter(function (i) { return i.ruleId === ruleId; })[0]; }

const fixture = require('./fixtures/followup-demo.js');
const D1 = fixture.D1, D2 = fixture.D2, D3 = fixture.D3;
const D4 = fu.shiftDate(D3, 1);   // 仅测试用：再往后一天，构造未到期的稍后项
const A = fixture.A, B = fixture.B, C = fixture.C;
const athletes = fixture.athletes;

console.log('\n1) 第一天生成队列：只留需要人跟进的规则');
const q1 = fu.generateQueue({ date: D1, athletes: athletes, history: [], now: D1 + 'T20:00:00Z' });
const a1 = q1.items.filter(function (i) { return i.athleteId === 'a-li'; });
const b1 = q1.items.filter(function (i) { return i.athleteId === 'xiao-ma'; });
const c1 = q1.items.filter(function (i) { return i.athleteId === 'a-jie'; });
ok(q1.stats.athletes === 3, '3 名拳手都进入队列', q1.stats.athletes);
ok(has(a1, 'HYD-01') && has(a1, 'PRO-01') && has(a1, 'REC-03'), '阿力：脱水/蛋白/晨脉三项入队', a1.map(function (i) { return i.ruleId; }));
ok(!has(a1, 'HYD-03'), '不需要人工跟进的 HYD-03（尿色提示）不入队');
ok(!has(b1, 'SUP-01'), 'SUP-01 标了 requiresHumanFollowUp=false，不入队');
ok(b1.length === 0, '小马第一天正常 → 队列为空（不制造无意义待办）', b1.length);
ok(c1.length === 0, '阿杰第一天恢复合格 → 队列为空', c1.length);
ok(q1.items.every(function (i) { return i.level === 'red' || i.level === 'amber'; }), '队列里只有 red / amber');
ok(q1.items.every(function (i) { return i.evidence && i.suggestedAction && i.suggestedAction !== i.title; }), '每项都带证据与跟进动作');

console.log('\n2) 第二天：连续未解决自动合并 + 升级置顶');
// 模拟营养师第一天没处理，全部保持 pending
const history = q1.items.map(function (i) { return Object.assign({}, i, { status: 'pending' }); });
const q2 = fu.generateQueue({ date: D2, athletes: fixture.athletesDay2, history: history, now: D2 + 'T20:00:00Z' });

const a2 = q2.items.filter(function (i) { return i.athleteId === 'a-li'; });
const b2 = q2.items.filter(function (i) { return i.athleteId === 'xiao-ma'; });
const c2 = q2.items.filter(function (i) { return i.athleteId === 'a-jie'; });

ok(has(a2, 'HYD-01') && get(a2, 'HYD-01').consecutiveDays === 2, '阿力脱水连续 2 天合并', get(a2, 'HYD-01').consecutiveDays);
ok(get(a2, 'HYD-01').escalated === true, '连续 2 天未解决 → 升级');
ok(/连续 2 天/.test(get(a2, 'HYD-01').escalationReason), '升级原因写明连续天数', get(a2, 'HYD-01').escalationReason);
ok(q2.items[0].athleteId === 'a-li' && q2.items[0].escalated, '升级项排在最前');
ok(q2.stats.escalated >= 3, '升级项 ≥ 3（脱水/蛋白/晨脉）', q2.stats.escalated);
ok(q2.groups[0].athleteId === 'a-li', '阿力所在分组排第一（升级数最多）');
ok(has(b2, 'HYD-05') && has(b2, 'GI-01'), '小马：补液执行率 + 胃肠症状入队', b2.map(function (i) { return i.ruleId; }));
ok(get(b2, 'GI-01').level === 'red', '胃肠症状 3/4 → 红灯');
ok(!has(b2, 'HYD-01'), '小马 peak 期不因体重差报警（阶段抑制生效）');
ok(has(c2, 'HYD-04') && has(c2, 'REC-04'), '阿杰：称重后补液与体重回升入队', c2.map(function (i) { return i.ruleId; }));
ok(get(c2, 'REC-04').level === 'red', '只回升 15% → 红灯', get(c2, 'REC-04').evidence);
ok(a2.filter(function (i) { return i.ruleId === 'REC-02'; }).length === 1, '同规则同日多条告警合并成一条（id 唯一）');
ok(q2.items.every(function (i) { return i.id === i.athleteId + ':' + i.date + ':' + i.ruleId; }), 'item id 稳定可复现');
ok(new Set(q2.items.map(function (i) { return i.id; })).size === q2.items.length, '队列内 id 不重复');

console.log('\n3) 已处理项不再累计连续天数');
const resolved = q1.items.map(function (i) { return Object.assign({}, i, { status: 'confirmed' }); });
const q2b = fu.generateQueue({ date: D2, athletes: fixture.athletesDay2, history: resolved, now: D2 + 'T21:00:00Z' });
const aHyd = q2b.items.filter(function (i) { return i.athleteId === 'a-li' && i.ruleId === 'HYD-01'; })[0];
ok(aHyd.consecutiveDays === 1, '前一天已确认 → 连续天数重置为 1', aHyd.consecutiveDays);
ok(!aHyd.escalated, '重置后不再升级');

console.log('\n4) 营养师后台：分组只显示待处理');
const oneConfirmed = q2.items.map(function (i, idx) { return idx === 0 ? Object.assign({}, i, { status: 'confirmed' }) : i; });
const groups = fu.groupForNutritionist(oneConfirmed, D2).groups;
const shown = groups.reduce(function (n, g) { return n + g.items.length; }, 0);
ok(shown === oneConfirmed.length - 1, '已确认项从待处理列表消失', { shown: shown, total: oneConfirmed.length });
ok(groups.every(function (g) { return g.items.every(function (i) { return i.status !== 'dismissed' && i.status !== 'confirmed'; }); }), '分组里没有已处理项');
ok(groups[0].escalated > 0, '分组头显示升级数', groups[0].escalated);

console.log('\n5) 确认 → 次日提醒（拳王端只看到这一条）');
const target = get(b2, 'HYD-05');
const edited = '小马，今天补液 2100/3000ml 差得有点多。剩下午用 300ml 一次，间隔 40 分钟喝完，含钠。';
const rem = fu.buildReminder(target, edited, 'coach-openid-1');
ok(rem.athleteId === 'xiao-ma', '提醒指向正确拳手');
ok(rem.date === D3, '提醒日期 = 次日', rem.date);
ok(rem.text === edited, '营养师改写后的文案原样保留');
ok(rem.ruleId === 'HYD-05' && rem.fromItemId === target.id, '提醒可回溯到跟进项与规则');
const auto = fu.buildReminder(target, '', 'coach-openid-1');
ok(auto.text.indexOf('补液') >= 0 && auto.text !== target.title, '不改写时用默认文案（含系统建议动作）', auto.text);
ok(fu.nextDateOf('2026-12-31') === '2027-01-01', '跨年日期正确', fu.nextDateOf('2026-12-31'));

console.log('\n6) 队列统计（给"今天需要我处理 N 件事"）');
ok(q2.stats.total === q2.items.length, 'total 与条目数一致');
ok(q2.stats.red === q2.items.filter(function (i) { return i.level === 'red'; }).length, 'red 计数一致');
console.log('     第二天队列：' + q2.stats.total + ' 项，其中升级 ' + q2.stats.escalated + ' 项，红灯 ' + q2.stats.red + ' 项，涉及 ' + q2.stats.athletes + ' 名拳手');

console.log('\n7) 已稍后：单独分组、到期回落、统计口径');
const mix = q2.items.map(function (i) { return Object.assign({}, i); });
const liMix = mix.filter(function (i) { return i.athleteId === 'a-li'; });
liMix[0].status = 'snoozed'; liMix[0].nextReminderDate = D3;   // 未到期
liMix[1].status = 'snoozed'; liMix[1].nextReminderDate = D2;   // 今天到期
const maMix = mix.filter(function (i) { return i.athleteId === 'xiao-ma'; })[0];
maMix.status = 'snoozed'; maMix.nextReminderDate = D4;

const view7 = fu.groupForNutritionist(mix, D2);
const todoItems7 = view7.groups.reduce(function (n, g) { return n + g.items.length; }, 0);
const snoozedItems7 = view7.snoozedGroups.reduce(function (n, g) { return n + g.items.length; }, 0);
ok(view7.stats.total === todoItems7, 'stats.total 与待办分组项数一致', { total: view7.stats.total, todo: todoItems7 });
ok(view7.stats.snoozed === snoozedItems7, 'stats.snoozed 与已稍后分组项数一致', { stats: view7.stats.snoozed, snoozed: snoozedItems7 });
ok(todoItems7 === mix.length - 2, '未到期的稍后项离开待办，其余仍在待办', { todo: todoItems7, all: mix.length });
const dueItem = view7.groups.reduce(function (arr, g) { return arr.concat(g.items); }, [])
  .filter(function (i) { return i.snoozedDue; })[0];
ok(!!dueItem && dueItem.originalDate === D2, '到期项回落待办并保留原定日期', dueItem && { due: dueItem.snoozedDue, original: dueItem.originalDate });
ok(view7.snoozedGroups.length === 2, '未到期项进入独立的已稍后分组', view7.snoozedGroups.length);

function fakeSnoozed(id, athleteId, name, nextDate, ruleId) {
  return {
    id: id, athleteId: athleteId, athleteName: name, date: D2,
    ruleId: ruleId || 'HYD-01', level: 'amber', status: 'snoozed',
    nextReminderDate: nextDate, consecutiveDays: 1, escalated: false
  };
}
const viewOrder = fu.groupForNutritionist([
  fakeSnoozed('c', 'c-ath', 'C', D4),
  fakeSnoozed('a', 'a-ath', 'A', D3),
  fakeSnoozed('b', 'b-ath', 'B', D3)
], D2);
ok(viewOrder.snoozedGroups[0].athleteId === 'a-ath' &&
   viewOrder.snoozedGroups[1].athleteId === 'b-ath' &&
   viewOrder.snoozedGroups[2].athleteId === 'c-ath',
   '已稍后分组按最早 nextReminderDate 升序', viewOrder.snoozedGroups.map(function (g) { return g.athleteId + '@' + g.nextReminderDate; }));
const viewItemOrder = fu.groupForNutritionist([
  fakeSnoozed('x1', 'x-ath', 'X', D4),
  fakeSnoozed('x2', 'x-ath', 'X', D3, 'PRO-01')
], D2);
ok(viewItemOrder.snoozedGroups[0].items[0].id === 'x2', '同一拳王组内按稍后日期升序', viewItemOrder.snoozedGroups[0].items.map(function (i) { return i.id; }));

console.log('\n8) requiresFollowUp 缺省时回落到规则登记表');
const noFlag = fu.candidatesFromFeedback(
  { athleteId: 'a-li', name: '阿力' },
  { alerts: [
    { ruleId: 'HYD-01', level: 'amber', title: '训练脱水', evidence: 'pct 2.4%' },
    { ruleId: 'HYD-03', level: 'amber', title: '晨尿颜色偏深', evidence: '6/8' }
  ] },
  D2
);
ok(noFlag.length === 1 && noFlag[0].ruleId === 'HYD-01',
  '告警未带 requiresFollowUp 时按登记表判定（HYD-01 保留 / HYD-03 剔除）', noFlag.map(function (i) { return i.ruleId; }));
const explicitFalse = fu.candidatesFromFeedback(
  { athleteId: 'a-li', name: '阿力' },
  { alerts: [{ ruleId: 'HYD-01', level: 'amber', title: '训练脱水', requiresFollowUp: false }] },
  D2
);
ok(explicitFalse.length === 0, '告警显式 requiresFollowUp=false 仍然剔除', explicitFalse.length);

console.log('\n--- 队列预览（阿力，按展示顺序） ---');
a2.forEach(function (i) {
  console.log('  [' + (i.escalated ? '升级' : i.level) + '] ' + i.ruleId + ' ' + i.title + '（连续 ' + i.consecutiveDays + ' 天）');
  console.log('        证据：' + i.evidence);
  console.log('        动作：' + i.suggestedAction);
});

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
