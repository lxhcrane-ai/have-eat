// S5 纯函数断言：发布后编辑 / 撤回的状态与入参约束。
// 直接跑 node scripts/test-advice-core.js；不依赖云 SDK。
const assert = require('assert');
const core = require('../cloudfunctions/advice/lib/core.js');

let n = 0;
function ok(name, fn) {
  try {
    fn();
    n += 1;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name + ' -> ' + e.message);
    process.exitCode = 1;
  }
}

console.log('advice core：S5 纯函数');
ok('updateCheck 拒绝空文档', function () {
  assert.strictEqual(core.updateCheck(null, '正文').ok, false);
});
ok('updateCheck 拒绝草稿', function () {
  const r = core.updateCheck({ status: core.STATUS.DRAFT, body: '旧' }, '新正文');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'NOT_PUBLISHED');
});
ok('updateCheck 已发布且正文非空通过', function () {
  assert.strictEqual(core.updateCheck({ status: core.STATUS.PUBLISHED, body: '旧' }, '新正文').ok, true);
});
ok('updateCheck 拒绝空正文', function () {
  assert.strictEqual(core.updateCheck({ status: core.STATUS.PUBLISHED, body: '旧' }, '   ').ok, false);
});

ok('revokeCheck 已发布通过', function () {
  assert.strictEqual(core.revokeCheck({ status: core.STATUS.PUBLISHED }).ok, true);
});
ok('revokeCheck 已撤回幂等', function () {
  const r = core.revokeCheck({ status: core.STATUS.REVOKED });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.already, true);
});
ok('revokeCheck 拒绝草稿', function () {
  assert.strictEqual(core.revokeCheck({ status: core.STATUS.DRAFT }).ok, false);
});

ok('normalizeUpdateInput 正文必填', function () {
  assert.strictEqual(core.normalizeUpdateInput({ body: '   ' }).ok, false);
});
ok('normalizeUpdateInput 保留引用与原因', function () {
  const r = core.normalizeUpdateInput({
    body: '  新正文  ',
    reason: ' 补充蛋白量 ',
    ruleIds: ['R01', 'R01'],
    kbIds: ['K01'],
    phase: 'cut'
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.body, '新正文');
  assert.strictEqual(r.data.reason, '补充蛋白量');
  assert.deepStrictEqual(r.data.ruleIds, ['R01']);
  assert.deepStrictEqual(r.data.kbIds, ['K01']);
  assert.strictEqual(r.data.phase, 'cut');
});

ok('buildInboxDoc 支持 advice_update 类型与会话标题', function () {
  const d = core.buildInboxDoc({
    athleteId: 'a1', coachName: '王教练', date: '2026-11-08',
    adviceId: 'x1', body: '新的建议正文', type: 'advice_update',
    title: '王教练 更新了 2026-11-08 的营养建议'
  });
  assert.strictEqual(d.type, 'advice_update');
  assert.strictEqual(d.title, '王教练 更新了 2026-11-08 的营养建议');
  assert.strictEqual(d.adviceId, 'x1');
  assert.strictEqual(d.body, '新的建议正文');
});
ok('buildInboxDoc 默认类型仍为 advice', function () {
  assert.strictEqual(core.buildInboxDoc({ athleteId: 'a1' }).type, 'advice');
});
ok('buildRevisionDoc 记录修改前正文、原因与动作', function () {
  const d = core.buildRevisionDoc({
    adviceId: 'x1', version: 2, action: 'update',
    body: '修改前正文', ruleIds: ['R02'], kbIds: ['K02'], reason: '调整晚餐'
  });
  assert.strictEqual(d.action, 'update');
  assert.strictEqual(d.version, 2);
  assert.strictEqual(d.body, '修改前正文');
  assert.strictEqual(d.reason, '调整晚餐');
  assert.deepStrictEqual(d.ruleIds, ['R02']);
});
ok('buildRevisionDoc 撤回动作', function () {
  assert.strictEqual(core.buildRevisionDoc({ action: 'revoke' }).action, 'revoke');
});

ok('状态机：published 可原地更新，revoked 不可回退', function () {
  assert.strictEqual(core.canTransition(core.STATUS.PUBLISHED, core.STATUS.PUBLISHED), true);
  assert.strictEqual(core.canTransition(core.STATUS.PUBLISHED, core.STATUS.REVOKED), true);
  assert.strictEqual(core.canTransition(core.STATUS.REVOKED, core.STATUS.PUBLISHED), false);
  assert.strictEqual(core.canTransition(core.STATUS.DRAFT, core.STATUS.REVOKED), false);
});
ok('update / revoke 已登记为启用动作', function () {
  assert.ok(core.ACTIONS_ENABLED.indexOf('update') >= 0);
  assert.ok(core.ACTIONS_ENABLED.indexOf('revoke') >= 0);
});

console.log('完成：' + n + ' 项通过');
