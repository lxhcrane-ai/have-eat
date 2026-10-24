const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 返回调用者 openid 与角色；首次进入自动建 user 文档（athlete）
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

  if (!doc) {
    const now = new Date().toISOString();
    await users.add({
      data: {
        _openid: OPENID,
        role: 'athlete',
        coachOpenid: '',
        coachCode: '',
        profile: { name: '拳王', weightKg: 58, phase: 'maintain' },
        createdAt: now,
        updatedAt: now
      }
    });
    doc = { role: 'athlete', profile: { name: '拳王', weightKg: 58, phase: 'maintain' }, coachOpenid: '' };
  }

  return { ok: true, openid: OPENID, role: doc.role || 'athlete', profile: doc.profile || {}, coachOpenid: doc.coachOpenid || '' };
};
