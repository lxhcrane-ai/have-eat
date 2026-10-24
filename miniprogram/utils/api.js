// 云函数调用统一封装：任何失败都不抛到页面，返回 {ok:false, error}
function call(name, data) {
  return new Promise(function (resolve) {
    wx.cloud.callFunction({
      name: name,
      data: data || {},
      success: function (res) { resolve((res && res.result) || { ok: false, error: '空返回' }); },
      fail: function (err) {
        resolve({ ok: false, error: (err && err.errMsg) || '云函数调用失败', offline: true });
      }
    });
  });
}

module.exports = { call: call };
