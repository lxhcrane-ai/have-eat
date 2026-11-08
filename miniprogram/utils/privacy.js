// 准入与隐私的前端公共约束。
// 这里只做"客户端自检"，真正的身份与归属判定以云函数为准。
const ADMISSION_KEY = 'admission';
const OWNED_KEY = 'coach_athletes_v1';

function admissionState() {
  try {
    const saved = wx.getStorageSync(ADMISSION_KEY);
    if (saved) return saved;
    // 升级前的老设备没有 admission 字段：已有 openid + role 视为已准入，
    // 后续 whoami 会用服务端结果覆盖；新设备没有这两个键，先按待准入处理。
    const openid = wx.getStorageSync('openid');
    const role = wx.getStorageSync('role');
    return (openid && role) ? 'active' : 'pending';
  } catch (e) {
    return 'pending';
  }
}

function setAdmission(state) {
  try { wx.setStorageSync(ADMISSION_KEY, state || 'pending'); } catch (e) {}
}

// 禁用当前页面的转发/朋友圈菜单，配合 app.json + sitemap 降低外部传播面。
function lockShare() {
  try {
    if (wx.hideShareMenu) wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  } catch (e) {}
}

// 教练名下拳王 openid 列表：由教练端成功拉取后写入，供离线缓存做归属过滤。
// 未确认归属（返回 null）时，调用方应拒绝读取任何按 athleteId 隔离的缓存。
function setOwnedAthletes(list) {
  const ids = (list || []).map(function (x) {
    return typeof x === 'string' ? x : (x && (x.openid || x._openid));
  }).filter(Boolean);
  try { wx.setStorageSync(OWNED_KEY, ids); } catch (e) {}
}

function ownedAthletes() {
  try {
    const v = wx.getStorageSync(OWNED_KEY);
    return Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

function isOwnedAthlete(id) {
  if (!id) return false;
  const list = ownedAthletes();
  return !!(list && list.indexOf(id) >= 0);
}

function filterOwnedItems(items) {
  const list = ownedAthletes();
  if (!list) return [];
  return (items || []).filter(function (x) { return x && list.indexOf(x.athleteId) >= 0; });
}

module.exports = {
  ADMISSION_KEY: ADMISSION_KEY,
  OWNED_KEY: OWNED_KEY,
  admissionState: admissionState,
  setAdmission: setAdmission,
  lockShare: lockShare,
  setOwnedAthletes: setOwnedAthletes,
  ownedAthletes: ownedAthletes,
  isOwnedAthlete: isOwnedAthlete,
  filterOwnedItems: filterOwnedItems
};
