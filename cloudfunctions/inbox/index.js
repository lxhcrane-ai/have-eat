const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event.action === 'readAll') {
    await db.collection('inbox').where({ owner: OPENID, read: false }).update({ data: { read: true } });
    return { ok: true };
  }
  const r = await db.collection('inbox').where({ owner: OPENID }).orderBy('createdAt', 'desc').limit(30).get();
  const c = await db.collection('inbox').where({ owner: OPENID, read: false }).count();
  return { ok: true, items: r.data, unread: c.total };
};
