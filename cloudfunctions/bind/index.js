const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 用一个邀请码把拳王和教练绑到一起：
//  - 拳王输入码 -> role=athlete，clearing 自己的 coachOpenid，等待教练激活
//  - 教练输入码 -> role=coach，并把所有该码的拳王回填 coachOpenid
const DEFAULT_CODE = 'COACH-8888';

async function getCode() {
  try {
    const r = await db.collection('settings').where({ key: 'coachCode' }).limit(1).get();
    if (r.data.length) return r.data[0].value;
  } catch (e) {}
  return DEFAULT_CODE;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const code = String(event.code || '').trim().toUpperCase();
  const asCoach = event.asCoach === true;
  if (!code) return { ok: false, error: '请输入邀请码' };

  const real = String(await getCode()).toUpperCase();
  if (code !== real) return { ok: false, error: '邀请码不正确' };

  const users = db.collection('users');
  const now = new Date().toISOString();
  let me = null;
  try {
    const u = await users.where({ _openid: OPENID }).limit(1).get();
    me = u.data[0] || null;
  } catch (e) { return { ok: false, error: 'users 集合不存在' }; }

  if (asCoach) {
    if (me) {
      await users.doc(me._id).update({ data: { role: 'coach', coachCode: code, updatedAt: now } });
    } else {
      await users.add({ data: { _openid: OPENID, role: 'coach', coachCode: code, profile: { name: '教练' }, createdAt: now, updatedAt: now } });
    }
    // 把等着的拳王接上
    const waiting = await users.where({ coachCode: code, role: 'athlete' }).get();
    let n = 0;
    for (const a of waiting.data) {
      if (a._openid !== OPENID) {
        await users.doc(a._id).update({ data: { coachOpenid: OPENID, updatedAt: now } });
        n++;
      }
    }
    return { ok: true, role: 'coach', boundAthletes: n };
  }

  // 拳王绑定
  if (me) {
    await users.doc(me._id).update({ data: { role: 'athlete', coachCode: code, updatedAt: now } });
  } else {
    await users.add({ data: { _openid: OPENID, role: 'athlete', coachCode: code, profile: { name: '拳王' }, createdAt: now, updatedAt: now } });
  }
  // 若教练已激活，直接接上
  const coach = await users.where({ coachCode: code, role: 'coach' }).limit(1).get();
  if (coach.data.length) {
    const c = coach.data[0];
    await users.where({ _openid: OPENID }).update({ data: { coachOpenid: c._openid, updatedAt: now } });
    return { ok: true, role: 'athlete', coachOpenid: c._openid, coachName: (c.profile && c.profile.name) || '教练' };
  }
  return { ok: true, role: 'athlete', waitingCoach: true };
};
