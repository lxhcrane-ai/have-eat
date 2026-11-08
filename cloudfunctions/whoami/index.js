const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const submsg = require('./lib/submsg.js');

// 准入判定：新用户初始待准入；升级前的老文档有绑定关系或教练身份视为已准入。
// 判定只在这里和业务云函数各做一次，不采信前端传入的角色。
function admissionOf(doc) {
  if (!doc) return 'pending';
  if (doc.admission === 'active' || doc.admission === 'pending' || doc.admission === 'blocked') return doc.admission;
  if (doc.role === 'coach') return 'active';
  if (doc.coachOpenid || doc.coachCode) return 'active';
  return 'pending';
}

// 返回调用者 openid、角色与准入状态。
// 首次进入仍建 user 文档，但状态是 pending：没有有效邀请/配对关系前不能进入业务页面。
exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const users = db.collection('users');
  let doc = null;
  try {
    const res = await users.where({ _openid: OPENID }).limit(1).get();
    doc = res.data[0] || null;
  } catch (e) {
    return { ok: false, error: 'users 集合不存在，请先在云开发控制台创建 users/logs/messages/inbox/settings' };
  }

  const now = new Date().toISOString();

  if (!doc) {
    const defaultProfile = { name: '拳王', weightKg: 58, phase: 'maintain' };
    await users.add({
      data: {
        _openid: OPENID,
        role: 'athlete',
        admission: 'pending',
        admissionAt: now,
        admissionReason: 'new-user',
        coachOpenid: '',
        coachCode: '',
        profile: defaultProfile,
        createdAt: now,
        updatedAt: now
      }
    });
    doc = { role: 'athlete', admission: 'pending', profile: defaultProfile, coachOpenid: '' };
  } else if (!doc.admission) {
    // 老文档升级：把判定结果落库，避免每次调用重复推断。
    // 已绑定/教练身份 -> active；从没绑定过的老用户 -> pending（需要配对码）。
    const admission = admissionOf(doc);
    try {
      await users.doc(doc._id).update({
        data: { admission: admission, admissionAt: now, admissionReason: 'legacy-upgrade', updatedAt: now }
      });
    } catch (e) { /* 落库失败不影响本次返回，下次调用会再次尝试 */ }
    doc.admission = admission;
  }

  const admission = admissionOf(doc);
  return {
    ok: true,
    openid: OPENID,
    role: doc.role || 'athlete',
    admission: admission,
    profile: doc.profile || {},
    coachOpenid: doc.coachOpenid || '',
    // 模板 ID 属于后台配置，不放前端常量；前端拿这个结果去 requestSubscribeMessage
    subscribeTemplates: submsg.templates()
  };
};
