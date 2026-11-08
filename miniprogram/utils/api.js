// 云函数调用统一封装：任何失败都不抛到页面，返回 {ok:false, error}
const privacy = require('./privacy.js');

function gotoAdmission() {
  try {
    const app = getApp();
    if (app && typeof app.gotoAdmission === 'function') app.gotoAdmission();
  } catch (e) {}
}

function request(name, data) {
  return new Promise(function (resolve) {
    wx.cloud.callFunction({
      name: name,
      data: data || {},
      success: function (res) {
        const r = (res && res.result) || { ok: false, error: '空返回' };
        if (r && r.code === 'PENDING_ADMISSION') gotoAdmission();
        resolve(r);
      },
      fail: function (err) {
        resolve({ ok: false, error: (err && err.errMsg) || '云函数调用失败', offline: true });
      }
    });
  });
}

function call(name, data) {
  // 待准入用户只允许调用 whoami / bind；其余业务接口在客户端直接拦住，
  // 服务端仍会再校验一次（前端拦截不能替代服务端归属校验）。
  const exempt = name === 'whoami' || name === 'bind';
  if (exempt) return request(name, data);

  function guarded() {
    if (privacy.admissionState() !== 'active') {
      gotoAdmission();
      return Promise.resolve({
        ok: false, code: 'PENDING_ADMISSION',
        error: '账号待准入：请输入教练提供的配对码'
      });
    }
    return request(name, data);
  }

  // 首次启动时 whoami 可能还没返回：先等身份确认，避免把“还没查到”误判成待准入。
  let app = null;
  try { app = getApp(); } catch (e) {}
  if (app && !app.globalData.ready && app.readyPromise && typeof app.readyPromise.then === 'function') {
    return app.readyPromise.then(guarded, guarded);
  }
  return guarded();
}

module.exports = { call: call };
