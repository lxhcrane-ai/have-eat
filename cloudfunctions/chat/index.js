const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 一对一沟通：拳王 <-> 教练。全部经服务端写入，客户端只读（配合安全规则做 watch）。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'send';

  let me = null, peer = null;
  try {
    const u = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
    me = u.data[0] || null;
  } catch (e) { return { ok: false, error: 'users 集合不存在' }; }
  if (!me) return { ok: false, error: '用户不存在，请重新进入小程序' };

  const isCoach = me.role === 'coach';
  let peerOpenid = '';
  if (isCoach) {
    peerOpenid = event.athleteId || '';
    if (!peerOpenid) return { ok: false, error: '教练发送需要 athleteId' };
    const chk = await db.collection('users').where({ _openid: peerOpenid, coachOpenid: OPENID }).count();
    if (!chk.total) return { ok: false, error: '该拳王未与你绑定' };
  } else {
    peerOpenid = me.coachOpenid || '';
    if (!peerOpenid) return { ok: false, error: '还没有绑定教练，请先到「我的 → 绑定教练」输入邀请码' };
  }

  if (action === 'send') {
    const text = String(event.text || '').slice(0, 500).trim();
    if (!text) return { ok: false, error: '内容为空' };
    const now = new Date().toISOString();
    const added = await db.collection('messages').add({
      data: {
        from: OPENID,
        to: peerOpenid,
        readerOpenid: peerOpenid,
        chatId: [OPENID, peerOpenid].sort().join('_'),
        text: text,
        refDate: event.refDate || '',
        read: false,
        createdAt: now
      }
    });
    await db.collection('inbox').add({
      data: {
        owner: peerOpenid,
        athleteId: isCoach ? peerOpenid : OPENID,
        type: 'message',
        level: 'info',
        title: (isCoach ? '教练' : ((me.profile && me.profile.name) || '拳王')) + '：' + text.slice(0, 30),
        body: text,
        read: false,
        createdAt: now
      }
    });
    return { ok: true, id: added._id, sentAt: now };
  }

  if (action === 'list') {
    const chatId = [OPENID, peerOpenid].sort().join('_');
    const res = await db.collection('messages').where({ chatId: chatId }).orderBy('createdAt', 'desc').limit(50).get();
    const list = res.data.reverse().map(function (m) {
      return { id: m._id, mine: m.from === OPENID, text: m.text, at: m.createdAt, refDate: m.refDate };
    });
    // 标记已读
    await db.collection('messages').where({ chatId: chatId, to: OPENID, read: false })
      .update({ data: { read: true } }).catch(function () {});
    await db.collection('inbox').where({ owner: OPENID, type: 'message', read: false })
      .update({ data: { read: true } }).catch(function () {});
    return { ok: true, peer: peerOpenid, chatId: chatId, messages: list };
  }

  return { ok: false, error: '未知 action' };
};
