const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const submsg = require('./lib/submsg.js');

// 绑定关系：
//  - 教练激活码（settings.coachActivationCode）：唯一能授予 coach 角色的入口
//  - 一次性配对码（pair_codes，30 分钟有效，首次使用即失效）：授予 athlete 角色
//  - 旧邀请码（settings.coachCode / DEFAULT_CODE）：兼容历史，仅授予 athlete 角色
// 角色完全由服务端根据“码属于哪一类”判定，前端传 asCoach/role 都不参与授权。
//  - action=unbind 只清关系字段，不删除日志与消息，重复调用幂等
const DEFAULT_CODE = 'COACH-8888';

async function getSetting(key, dflt) {
  try {
    const r = await db.collection('settings').where({ key: key }).limit(1).get();
    if (r.data.length) return String(r.data[0].value || '').trim();
  } catch (e) {}
  return dflt || '';
}

async function userOf(openid) {
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    return u.data[0] || null;
  } catch (e) { return null; }
}

function admissionOf(doc) {
  if (!doc) return 'pending';
  if (doc.admission === 'active' || doc.admission === 'pending' || doc.admission === 'blocked') return doc.admission;
  if (doc.role === 'coach') return 'active';
  if (doc.coachOpenid || doc.coachCode) return 'active';
  return 'pending';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'bind';
  const now = new Date().toISOString();
  const users = db.collection('users');

  let me = await userOf(OPENID);
  // blocked 是管理员停用状态：不允许通过重新输码自行恢复
  if (me && me.admission === 'blocked') {
    return { ok: false, code: 'BLOCKED', error: '账号已被停用，请联系管理员' };
  }
  // 订阅授权结果落库（保存成功 / 绑定成功 / 首次聊天后由前端上报）
  if (action === 'subscribe') {
    if (!me) return { ok: false, error: '用户不存在，请重新进入小程序' };
    const subscribe = await submsg.record(OPENID, event.subscribe);
    return { ok: true, subscribe: subscribe || (me.subscribe || {}) };
  }
  if (action === 'unbind') {
    // 教练解绑指定拳王
    if (me && me.role === 'coach' && event.athleteId) {
      const target = await userOf(event.athleteId);
      if (!target || !target.coachOpenid) return { ok: true, role: 'coach', admission: admissionOf(me), alreadyUnbound: true };
      if (target.coachOpenid !== OPENID) return { ok: false, error: '该拳王未绑定到你' };
      await users.doc(target._id).update({ data: { coachOpenid: '', coachCode: '', updatedAt: now } });
      return { ok: true, role: 'coach', admission: admissionOf(me), athleteId: event.athleteId, unbound: true };
    }
    if (me && me.role === 'coach') return { ok: false, error: '请指定要解绑的拳王' };
    // 拳王解绑自己（已解绑时同样返回 ok）。解绑不清准入状态，避免已受邀用户被误锁。
    if (me) await users.doc(me._id).update({ data: { coachOpenid: '', coachCode: '', updatedAt: now } });
    return { ok: true, role: 'athlete', admission: admissionOf(me), openid: OPENID, unbound: true };
  }

  const code = String(event.code || '').trim().toUpperCase();
  if (!code) return { ok: false, error: '请输入配对码或教练激活码' };

  // 1) 教练激活码：只有管理员在 settings 里配置的独立密钥才能授予 coach
  const activation = String(await getSetting('coachActivationCode', '')).trim().toUpperCase();
  if (activation && code === activation) {
    if (me) {
      await users.doc(me._id).update({
        data: {
          role: 'coach', coachOpenid: '', coachCode: '',
          admission: 'active', admissionAt: now, admissionReason: 'coach-activation',
          updatedAt: now
        }
      });
    } else {
      await users.add({
        data: {
          _openid: OPENID, role: 'coach', coachOpenid: '', coachCode: '',
          admission: 'active', admissionAt: now, admissionReason: 'coach-activation',
          profile: { name: '教练' }, createdAt: now, updatedAt: now
        }
      });
    }
    // 不再把“所有使用同一旧邀请码的拳王”批量接到新教练，避免任意教练激活后接管等待池。
    return { ok: true, role: 'coach', admission: 'active', openid: OPENID, boundAthletes: 0 };
  }

  // 2) 一次性配对码：授予 athlete
  let pc = null;
  try {
    const r = await db.collection('pair_codes').where({ code: code }).limit(1).get();
    pc = r.data[0] || null;
  } catch (e) { pc = null; }
  if (pc) {
    if (pc.status !== 'active') return { ok: false, error: '配对码已被使用，请让教练重新生成' };
    if (pc.expiresAt && new Date(pc.expiresAt).getTime() <= Date.now()) {
      return { ok: false, error: '配对码已过期，请让教练重新生成' };
    }
    if (me && me.role === 'coach') return { ok: false, error: '当前账号是教练账号，不能绑定为拳王' };
    const upd = await db.collection('pair_codes')
      .where({ _id: pc._id, status: 'active' })
      .update({ data: { status: 'used', usedAt: now, athleteOpenid: OPENID } });
    if (!upd.stats || !upd.stats.updated) return { ok: false, error: '配对码已被使用，请让教练重新生成' };
    if (me) {
      await users.doc(me._id).update({
        data: {
          role: 'athlete', coachOpenid: pc.coachOpenid, coachCode: '',
          admission: 'active', admissionAt: now, admissionReason: 'pair-code',
          updatedAt: now
        }
      });
    } else {
      await users.add({
        data: {
          _openid: OPENID, role: 'athlete', coachOpenid: pc.coachOpenid, coachCode: '',
          admission: 'active', admissionAt: now, admissionReason: 'pair-code',
          profile: { name: '拳王' }, createdAt: now, updatedAt: now
        }
      });
    }
    return {
      ok: true, role: 'athlete', admission: 'active', openid: OPENID,
      coachOpenid: pc.coachOpenid, pairCode: true, coachName: pc.coachName || '教练'
    };
  }

  // 3) 旧邀请码（兼容路径）：仅授予 athlete
  const real = String(await getSetting('coachCode', DEFAULT_CODE) || DEFAULT_CODE).toUpperCase();
  if (code !== real) return { ok: false, error: '配对码不正确或已失效' };
  if (me && me.role === 'coach') return { ok: false, error: '当前账号是教练账号，不能绑定为拳王' };

  if (me) {
    await users.doc(me._id).update({
      data: {
        role: 'athlete', coachCode: code,
        admission: 'active', admissionAt: now, admissionReason: 'legacy-code',
        updatedAt: now
      }
    });
  } else {
    await users.add({
      data: {
        _openid: OPENID, role: 'athlete', coachCode: code,
        admission: 'active', admissionAt: now, admissionReason: 'legacy-code',
        profile: { name: '拳王' }, createdAt: now, updatedAt: now
      }
    });
  }
  // 若教练已激活，直接接上（只认 role=coach 且持有同一旧邀请码的账号）
  const coach = await users.where({ coachCode: code, role: 'coach' }).limit(1).get();
  if (coach.data.length) {
    const c = coach.data[0];
    await users.where({ _openid: OPENID }).update({ data: { coachOpenid: c._openid, updatedAt: now } });
    return {
      ok: true, role: 'athlete', admission: 'active', openid: OPENID,
      coachOpenid: c._openid, coachName: (c.profile && c.profile.name) || '教练'
    };
  }
  return { ok: true, role: 'athlete', admission: 'active', openid: OPENID, waitingCoach: true };
};
