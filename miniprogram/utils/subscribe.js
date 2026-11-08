// 订阅消息前端工具：模板 ID 由 whoami 从云函数环境变量下发，前端只缓存不写死。
// 一次性订阅：每次 requestSubscribeMessage 只换一次发送机会，发送后服务端会把状态置为 sent。
const api = require('./api.js');

const CACHE_KEY = 'subscribe_templates';
const ROLE_SCENARIOS = {
  coach: ['coachLog'],
  athlete: ['athleteMsg', 'advicePublish', 'adviceChange']
};

function cacheTemplates(templates) {
  if (!templates || typeof templates !== 'object') return;
  try { wx.setStorageSync(CACHE_KEY, templates); } catch (e) { /* 缓存失败不影响发送 */ }
}

function templates() {
  try {
    const v = wx.getStorageSync(CACHE_KEY);
    return (v && typeof v === 'object') ? v : {};
  } catch (e) { return {}; }
}

function scenariosFor(role) {
  return ROLE_SCENARIOS[role === 'coach' ? 'coach' : 'athlete'];
}

function report(results) {
  if (!results || !Object.keys(results).length) return Promise.resolve(results || {});
  return api.call('bind', { action: 'subscribe', subscribe: results })
    .then(function () { return results; })
    .catch(function () { return results; });
}

// 在用户点击链路里调用；返回 { 场景: 'accept'|'reject'|'ban'|'filter' }
function ask(role) {
  const tpl = templates();
  const scenarios = scenariosFor(role).filter(function (s) { return !!tpl[s]; });
  if (!scenarios.length) return Promise.resolve({});
  if (!wx.requestSubscribeMessage) return Promise.resolve({});

  // 同一模板被配到多个场景时去重，避免 tmplIds 重复导致请求失败
  const ids = [];
  scenarios.forEach(function (s) {
    if (ids.indexOf(tpl[s]) < 0) ids.push(tpl[s]);
  });
  return new Promise(function (resolve) {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: function (res) {
        const out = {};
        scenarios.forEach(function (s) {
          const v = res && res[tpl[s]];
          if (v) out[s] = v;
        });
        resolve(out);
      },
      fail: function () { resolve({}); }
    });
  }).then(report);
}

module.exports = {
  CACHE_KEY: CACHE_KEY,
  cacheTemplates: cacheTemplates,
  templates: templates,
  ask: ask
};
