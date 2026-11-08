// 收件箱：列表 / 单条已读 / 按范围全部已读。
// 归属规则：拳王只能读写 owner=自己的记录；教练只能按名下拳王 athleteId 过滤自己的收件箱。
// 未读口径统一为 inbox 集合的 read 字段，与 getFeed 教练分支的统计一致（owner + athleteId + read:false）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const TYPES = ['log', 'message', 'advice', 'advice_update', 'advice_revoke', 'followup'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function cleanType(t) {
  const s = String(t || '');
  return TYPES.indexOf(s) >= 0 ? s : '';
}

function admissionOf(user) {
  if (!user) return 'pending';
  if (user.admission === 'active' || user.admission === 'pending' || user.admission === 'blocked') return user.admission;
  if (user.role === 'coach') return 'active';
  if (user.coachOpenid || user.coachCode) return 'active';
  return 'pending';
}

async function userOf(openid) {
  const r = await db.collection('users').where({ _openid: openid }).limit(1).get();
  return r.data[0] || null;
}

async function canReadAthlete(coachOpenid, athleteId) {
  if (!coachOpenid || !athleteId) return false;
  const r = await db.collection('users')
    .where({ _openid: athleteId, coachOpenid: coachOpenid, role: 'athlete' })
    .limit(1).get().catch(function () { return { data: [] }; });
  return r.data.length > 0;
}

exports.main = async (event) => {
  const e = event || {};
  const { OPENID } = cloud.getWXContext();
  const action = e.action || 'list';

  let me = null;
  try {
    me = await userOf(OPENID);
  } catch (err) {
    return { ok: false, error: 'users 集合不存在' };
  }
  if (!me) return { ok: false, error: '用户不存在，请重新进入小程序' };
  if (admissionOf(me) !== 'active') {
    return { ok: false, code: 'PENDING_ADMISSION', error: '账号待准入：请输入教练提供的配对码' };
  }
  const isCoach = me.role === 'coach';

  // 教练当前名下拳王：列表/全部已读都只在这个范围内生效。
  // 解绑后旧消息仍留在 coach 的收件箱里，但不再返回内容。
  let boundIds = null;
  if (isCoach) {
    const b = await db.collection('users')
      .where({ coachOpenid: OPENID, role: 'athlete' }).limit(100).get()
      .catch(function () { return { data: [] }; });
    boundIds = b.data.map(function (x) { return x._openid; });
  }

  // 教练可按名下拳王过滤；拳王始终锁定 owner=自己，不接受他人的 athleteId
  let athleteId = '';
  if (isCoach && e.athleteId) {
    const owned = await canReadAthlete(OPENID, e.athleteId);
    if (!owned) return { ok: false, error: '该拳王未与你绑定' };
    athleteId = e.athleteId;
  } else if (!isCoach && e.athleteId === OPENID) {
    athleteId = OPENID;
  }

  // 单条已读：只允许操作自己的收件箱记录
  if (action === 'read') {
    const id = String(e.id || '');
    if (!id) return { ok: false, error: '缺少消息 id' };
    try {
      const r = await db.collection('inbox').where({ _id: id }).limit(1).get();
      const doc = r.data[0];
      if (!doc) return { ok: false, error: '消息不存在' };
      if (doc.owner !== OPENID) return { ok: false, error: '无权操作该消息' };
      // 教练只能操作仍在自己名下拳王的消息；解绑后旧消息不再可写
      if (isCoach && doc.athleteId && boundIds.indexOf(doc.athleteId) < 0) {
        return { ok: false, error: '该拳王未与你绑定' };
      }
      if (!doc.read) await db.collection('inbox').doc(id).update({ data: { read: true } });
      return { ok: true, id: id, read: true };
    } catch (err) {
      return { ok: false, error: '标记已读失败' };
    }
  }

  // 全部已读：必须显式指定范围，避免“默认清空全部”的歧义
  if (action === 'readAll') {
    const scope = String(e.scope || '');
    if (scope !== 'all' && scope !== 'type' && scope !== 'athlete') {
      return { ok: false, error: '请指定已读范围：all / type / athlete' };
    }
    const where = { owner: OPENID, read: false };
    let type = '';
    if (scope === 'type') {
      type = cleanType(e.type);
      if (!type) return { ok: false, error: '请指定要清空的消息类型' };
      where.type = type;
    }
    if (scope === 'athlete') {
      if (!athleteId) return { ok: false, error: '请指定要清空的拳王' };
      where.athleteId = athleteId;
    } else if (isCoach) {
      // 教练的 all/type 范围也只覆盖当前名下拳王
      if (!boundIds.length) return { ok: true, scope: scope, type: type, athleteId: '', before: 0, updated: 0 };
      where.athleteId = _.in(boundIds);
    }
    const before = await db.collection('inbox').where(where).count()
      .catch(function () { return { total: 0 }; });
    let updated = 0;
    try {
      const r = await db.collection('inbox').where(where).update({ data: { read: true } });
      updated = (r.stats && r.stats.updated) || 0;
    } catch (err) {
      return { ok: false, error: '清空失败，请稍后重试' };
    }
    return {
      ok: true,
      scope: scope,
      type: type,
      athleteId: scope === 'athlete' ? athleteId : '',
      before: before.total || 0,
      updated: updated
    };
  }

  if (action !== 'list') return { ok: false, error: '未知 action' };

  const type = cleanType(e.type);
  const limit = Math.min(Math.max(Number(e.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(e.offset) || 0, 0);
  const where = { owner: OPENID };
  if (type) where.type = type;
  if (athleteId) where.athleteId = athleteId;
  else if (isCoach) {
    // 教练未指定拳王时，只返回当前名下拳王的收件箱
    if (!boundIds.length) {
      return { ok: true, role: 'coach', athleteId: '', items: [], unread: 0, nextOffset: 0, hasMore: false };
    }
    where.athleteId = _.in(boundIds);
  }

  let rows = [];
  try {
    const r = await db.collection('inbox').where(where)
      .orderBy('createdAt', 'desc').skip(offset).limit(limit + 1).get();
    rows = r.data;
  } catch (err) {
    return { ok: false, error: '收件箱读取失败（请确认 inbox 集合已创建）' };
  }
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const unread = await db.collection('inbox')
    .where(Object.assign({}, where, { read: false }))
    .count().catch(function () { return { total: 0 }; });

  return {
    ok: true,
    role: isCoach ? 'coach' : 'athlete',
    athleteId: athleteId,
    items: items,
    unread: unread.total || 0,
    nextOffset: offset + items.length,
    hasMore: hasMore
  };
};
