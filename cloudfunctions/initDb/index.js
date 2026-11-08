// 初始化云数据库集合：只建集合，不写任何业务数据；可重复调用。
// 注意：云函数无法创建索引，索引必须在云开发控制台手工创建（见 docs/cloud-setup.md）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = [
  { name: 'advice', purpose: '营养师建议（draft / published / revoked）' },
  { name: 'advice_revisions', purpose: '发布后修改与撤回的留痕' },
  { name: 'pair_codes', purpose: '教练生成的一次性配对码' }
];

function errText(e) {
  return String((e && (e.errMsg || e.message)) || e || '');
}

// 集合已存在时各版本返回文案不完全一致，这里只认「已存在」，避免把「不存在」误判
function isExistsError(e) {
  const msg = errText(e).toLowerCase();
  if (msg.indexOf('not exist') >= 0) return false;
  return msg.indexOf('exist') >= 0 || msg.indexOf('已存在') >= 0;
}

exports.main = async () => {
  const results = [];
  for (const item of COLLECTIONS) {
    try {
      await db.createCollection(item.name);
      results.push({
        collection: item.name,
        status: 'created',
        created: true,
        purpose: item.purpose
      });
    } catch (e) {
      if (isExistsError(e)) {
        results.push({
          collection: item.name,
          status: 'exists',
          created: false,
          purpose: item.purpose
        });
        continue;
      }
      results.push({
        collection: item.name,
        status: 'failed',
        created: false,
        purpose: item.purpose,
        errCode: (e && e.errCode !== undefined) ? e.errCode : null,
        error: errText(e)
      });
    }
  }

  const failed = results.filter(function (r) { return r.status === 'failed'; });
  return {
    ok: failed.length === 0,
    results: results,
    created: results.filter(function (r) { return r.status === 'created'; }).map(function (r) { return r.collection; }),
    existed: results.filter(function (r) { return r.status === 'exists'; }).map(function (r) { return r.collection; }),
    failed: failed.map(function (r) { return r.collection; }),
    note: '集合已按需创建；云函数无法创建索引，请按 docs/cloud-setup.md 在云开发控制台手工创建索引并设置集合权限。'
  };
};
