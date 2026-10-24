const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 只允许写白名单字段，避免盲写整个 profile
const ALLOW = ['name', 'sex', 'heightCm', 'age', 'weightKg', 'targetWeightKg', 'weighInDate', 'phase', 'restingHrBaseline', 'note'];
const NUM = ['heightCm', 'age', 'weightKg', 'targetWeightKg', 'restingHrBaseline'];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const incoming = event.profile || {};
  const clean = {};
  ALLOW.forEach(function (k) {
    if (incoming[k] === undefined || incoming[k] === null || incoming[k] === '') return;
    clean[k] = NUM.indexOf(k) >= 0 ? Number(incoming[k]) : String(incoming[k]).slice(0, 120);
  });
  if (!Object.keys(clean).length) return { ok: false, error: '没有可保存的字段' };
  clean.updatedAt = new Date().toISOString();

  const users = db.collection('users');
  const u = await users.where({ _openid: OPENID }).limit(1).get();
  if (u.data.length) {
    await users.doc(u.data[0]._id).update({ data: { profile: clean } });
  } else {
    await users.add({ data: { _openid: OPENID, role: 'athlete', profile: clean } });
  }
  return { ok: true, profile: clean };
};
