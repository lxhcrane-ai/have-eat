// 把 v1 的 boxer_logs_*.json 迁移成 v2 契约
// 用法：node scripts/migrate.js <老文件> <输出文件>
const fs = require('fs');
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));

const src = process.argv[2];
const out = process.argv[3] || 'logs_v2.json';
if (!src) {
  console.log('用法: node scripts/migrate.js <v1.json> [输出.json]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const arr = Array.isArray(raw) ? raw : [raw];
const logs = arr.map(function (r) {
  const n = rules.normalizeLog(r);
  n.schemaVersion = 2;
  n.id = n.id || ('migrated-' + n.date);
  n.migratedFrom = 'v1';
  n.migratedAt = new Date().toISOString();
  return n;
});

logs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), count: logs.length, logs: logs };
fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');

console.log('迁移 ' + logs.length + ' 条 -> ' + out);
logs.forEach(function (l) {
  const fb = rules.evaluate(l, { profile: {} });
  console.log('  ' + l.date + ' | 脱水 ' + (fb.hydration.pct === null ? '--' : fb.hydration.pct + '%') +
    ' | 蛋白 ' + fb.protein.actualG + 'g | 餐数 ' + fb.totals.count +
    ' | 酸痛 ' + (fb.recovery.sorenessMax === null ? '--' : fb.recovery.sorenessMax) +
    ' | 评分 ' + fb.score);
});
console.log('\n把 logs 数组内容放进 miniprogram/data/seed.js 并重新编译，首次启动即会导入本机。');
