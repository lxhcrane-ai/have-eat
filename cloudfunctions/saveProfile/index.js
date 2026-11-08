const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 只允许写白名单字段，避免盲写整个 profile
// 注意：phase 不在白名单里 —— 阶段只能由营养师通过 coachApi.setPhase 设置（拳王端只读）
const ALLOW = ['name', 'sex', 'heightCm', 'age', 'weightKg', 'targetWeightKg', 'weighInDate', 'restingHrBaseline', 'note'];
const NUM = ['heightCm', 'age', 'weightKg', 'targetWeightKg', 'restingHrBaseline'];
// 这些字段只能由后台写，保存档案时必须原样保留
const LOCKED = ['phase', 'phaseEffectiveDate', 'phaseSetBy', 'phaseSetAt', 'maintainBandPct', 'coachOpenid', 'goals', 'goalEffectiveDate', 'goalSource', 'bodyFatPct', 'refeedDays'];

function admissionOf(user) {
  if (!user) return 'pending';
  if (user.admission === 'active' || user.admission === 'pending' || user.admission === 'blocked') return user.admission;
  if (user.role === 'coach') return 'active';
  if (user.coachOpenid || user.coachCode) return 'active';
  return 'pending';
}

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
  const me = u.data[0] || null;
  // 不再在这里新建用户：身份和准入只由 whoami/bind 产生，避免绕过邀请直接拿到可用账号
  if (admissionOf(me) !== 'active') {
    return { ok: false, code: 'PENDING_ADMISSION', error: '账号待准入：请输入教练提供的配对码' };
  }
  const old = me.profile || {};
  const merged = Object.assign({}, old, clean);       // 合并而不是覆盖，避免丢字段
  LOCKED.forEach(function (k) { if (old[k] !== undefined) merged[k] = old[k]; });
  await users.doc(me._id).update({ data: { profile: merged } });
  return { ok: true, profile: merged };
};
