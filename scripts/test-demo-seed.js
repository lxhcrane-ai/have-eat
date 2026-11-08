// 演示数据（seed 相对日期）的回归测试
// 用法：node scripts/test-demo-seed.js
const path = require('path');
const ds = require(path.join(__dirname, '../miniprogram/utils/demoSeed.js'));
const seedFile = require(path.join(__dirname, '../miniprogram/data/seed.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

function rec(date, extra) {
  return Object.assign({
    date: date,
    demo: true,
    demoVersion: 'v1',
    id: 'seed-' + date,
    goal: { weighInDate: ds.shiftDate(date, 35) },
    createdAt: date + 'T12:00:00.000Z',
    weights: { morning: { kg: 60 } }
  }, extra || {});
}

console.log('\n1) 日期平移：跨月、闰年、跨年');
ok(ds.shiftDate('2026-02-28', 1) === '2026-03-01', '2026-02-28 +1 → 03-01', ds.shiftDate('2026-02-28', 1));
ok(ds.shiftDate('2024-02-28', 1) === '2024-02-29', '闰年 2024-02-28 +1 → 02-29');
ok(ds.shiftDate('2026-12-31', 1) === '2027-01-01', '跨年 12-31 +1 → 01-01');
ok(ds.shiftDate('2026-01-01', -1) === '2025-12-31', '跨年 01-01 -1 → 12-31');

console.log('\n2) 演示记录识别');
ok(ds.isDemo({ demo: true }) === true, 'demo:true 识别为演示');
ok(ds.isDemo({ id: 'seed-2026-10-12' }) === true, '旧版 seed-* id 兜底识别');
ok(ds.isDemo({ date: '2026-10-12', weights: { morning: { kg: 60 } } }) === false, '普通记录不算演示');
ok(ds.isDemo(null) === false, 'null 不算演示');

console.log('\n3) reanchor：以 seed 最大日期为基准，整批结束于今天');
const seed = [rec('2026-10-12'), rec('2026-10-25', { weights: { morning: { kg: 59.1 } }, custom: 'keep' })];
const today = '2026-11-08';
const fresh = ds.reanchor(seed, today);
ok(fresh.length === 2, '条数不变');
ok(fresh[0].date === today, '排序为近→远，最新一条是今天', fresh[0].date);
ok(fresh[1].date === '2026-10-26', '另一条同步平移 14 天', fresh[1].date);
ok(fresh[1].id === 'seed-2026-10-26', 'seed-* id 随日期更新');
const custom = fresh.filter(function (r) { return r.custom === 'keep'; })[0] || {};
ok(custom.date === today && custom.id === 'seed-' + today, '带自定义字段的记录平移到今天，id 同步');
ok(custom.goal.weighInDate === '2026-12-13', '目标称重日同步平移（10-25 的 +35 天再 +14 天）', custom.goal.weighInDate);
ok(custom.createdAt === today + 'T12:00:00.000Z', 'createdAt 日期段同步', custom.createdAt);
ok(custom.weights.morning.kg === 59.1, '当天数值保持不变');
ok(fresh.every(function (r) { return r.demo === true; }), '重锚后仍带 demo 标记');

console.log('\n4) planImport：首次导入');
const p1 = ds.planImport({ seed: seed, logs: [], meta: null, optout: false, today: today });
ok(p1.action === 'fresh', '首次 → fresh');
ok(p1.records.length === 2 && p1.records[0].date === today, '按今天重锚');
ok(p1.meta && p1.meta.version === 'v1' && p1.meta.installedEnd === today, '写入版本与安装日期');

console.log('\n5) planImport：真实记录优先，seed 不覆盖');
const real = { date: '2026-11-07', weights: { morning: { kg: 61.2 } }, note: '我的真实记录' };
const mixed = [real, rec('2026-11-06')];
const p2 = ds.planImport({ seed: seed, logs: mixed, meta: p1.meta, optout: false, today: today });
ok(p2.action === 'keep-real', '真实+演示 → keep-real');
ok(p2.records.length === 1 && p2.records[0].note === '我的真实记录', '只保留真实记录且内容不变');
ok(p2.records[0].demo !== true, '真实记录不被写成演示');
ok(p2.demoCount === 1, '报告被剔除的演示条数');

console.log('\n6) planImport：真实记录单独存在时不动');
const p3 = ds.planImport({ seed: seed, logs: [real], meta: p1.meta, optout: false, today: today });
ok(p3.action === 'keep-real' && p3.records.length === 1, '只有真实记录也保持原样');

console.log('\n7) planImport：清空本机后的 opt-out');
const p4 = ds.planImport({ seed: seed, logs: [], meta: null, optout: true, today: today });
ok(p4.action === 'skip-optout', 'opt-out 且无记录 → 不导入');
ok(p4.records.length === 0, '不写入任何演示记录');

console.log('\n8) planImport：同版本跨天只平移，保留用户对演示的修改');
const yesterday = ds.shiftDate(today, -1);
const edited = rec(yesterday, { weights: { morning: { kg: 58.8 } }, custom: 'edited' });
const metaSame = { version: 'v1', baseEnd: '2026-10-25', installedEnd: yesterday, count: 1 };
const p5 = ds.planImport({ seed: seed, logs: [edited], meta: metaSame, optout: false, today: today });
ok(p5.action === 'shift', '同版本跨天 → shift');
ok(p5.records[0].date === today, '平移到今天');
ok(p5.records[0].weights.morning.kg === 58.8 && p5.records[0].custom === 'edited', '演示里的修改不丢');
ok(p5.records[0].demo === true, '平移后仍是演示');

console.log('\n9) planImport：同一天不重复写；设备时间回拨按今天重锚');
const p6 = ds.planImport({ seed: seed, logs: [edited], meta: metaSame, optout: false, today: yesterday });
ok(p6.action === 'keep', '同一天 → keep');
const tomorrowDemo = rec(ds.shiftDate(today, 1));
const p7 = ds.planImport({ seed: seed, logs: [tomorrowDemo], meta: metaSame, optout: false, today: today });
ok(p7.action === 'fresh', '演示日期在未来 → fresh 重锚');
ok(p7.records.every(function (r) { return r.date <= today; }), '不产生未来演示记录');

console.log('\n10) planImport：版本变化整批重导');
const metaOld = { version: 'v0', baseEnd: '2026-10-25', installedEnd: today, count: 2 };
const p8 = ds.planImport({ seed: seed, logs: [rec(today)], meta: metaOld, optout: false, today: today });
ok(p8.action === 'fresh', '版本变化 → fresh');
ok(p8.meta.version === 'v1', '元数据版本更新为当前 seed 版本');

console.log('\n11) 产物 seed.js 自检');
ok(Array.isArray(seedFile) && seedFile.length === 14, 'seed 为 14 天数组', seedFile.length);
ok(seedFile.every(function (r) { return r.demo === true; }), '每条 seed 记录都带 demo:true');
ok(seedFile.every(function (r) { return r.demoVersion === 'v1'; }), '每条 seed 记录都带 demoVersion');
ok(ds.maxDate(seedFile) === seedFile[seedFile.length - 1].date, 'seed 按时间升序，最大日期即基准结束日');
ok(ds.reanchor(seedFile, today)[0].date === today, '无论 seed 生成于哪天，重锚后结束日都是今天');

console.log('\n----------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) process.exit(1);
