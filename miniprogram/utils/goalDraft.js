// 目标设置页纯函数：原子分组、名额计数、选择/调序、输入预检。
// 只做内存计算：不读写存储、不调用网络、不依赖 wx。
// 合法性唯一口径仍是 data/goalMatrix.js 与 utils/goals.js::atomLegality。
const GM = require('../data/goalMatrix.js');
const goals = require('./goals.js');

const MAX_MAIN = 3;
const MAX_MONITOR = 1;
const DIMENSION_ORDER = ['performance', 'body', 'guardrail'];

function atomOf(id) {
  for (let i = 0; i < GM.ATOMS.length; i++) {
    if (GM.ATOMS[i].id === id) return GM.ATOMS[i];
  }
  return null;
}

function quota(selected) {
  let main = 0;
  let monitor = 0;
  (selected || []).forEach(function (id) {
    const atom = atomOf(id);
    if (!atom) return;
    if (atom.occupiesSlot) main += 1;
    else monitor += 1;
  });
  return {
    main: main,
    monitor: monitor,
    maxMain: MAX_MAIN,
    maxMonitor: MAX_MONITOR,
    mainFull: main >= MAX_MAIN,
    monitorFull: monitor >= MAX_MONITOR,
    over: main > MAX_MAIN || monitor > MAX_MONITOR,
    total: main + monitor,
    text: '主目标 ' + main + '/' + MAX_MAIN + ' · 监测 ' + monitor + '/' + MAX_MONITOR
  };
}

// 15 个原子的当前阶段状态（顺序与数据层一致）
function atomStates(phase, ctx) {
  return GM.ATOMS.map(function (a) { return goals.atomLegality(phase, a.id, ctx); });
}

// 按维度分组，供页面分区渲染
function atomGroups(states) {
  const byDim = {};
  (states || []).forEach(function (s) {
    const key = s.dimension || 'other';
    if (!byDim[key]) byDim[key] = { id: key, label: s.dimensionLabel || key, atoms: [] };
    byDim[key].atoms.push(s);
  });
  return DIMENSION_ORDER.filter(function (d) { return byDim[d]; }).map(function (d) { return byDim[d]; });
}

function findState(states, id) {
  for (let i = 0; i < (states || []).length; i++) {
    if (states[i].id === id) return states[i];
  }
  return null;
}

// 增删：已选则移除；未选则按名额与矩阵合法性放行
function toggle(selected, id, states) {
  const list = (selected || []).slice();
  const at = list.indexOf(id);
  if (at >= 0) {
    list.splice(at, 1);
    return { ok: true, selected: list, added: false, reason: '' };
  }
  const st = findState(states, id);
  if (!st) return { ok: false, selected: list, added: false, reason: '目标数据缺失，无法选择' };
  if (!st.allowed) return { ok: false, selected: list, added: false, reason: st.reason || '当前阶段不允许该目标' };
  const q = quota(list);
  if (st.occupiesSlot && q.mainFull) {
    return { ok: false, selected: list, added: false, reason: '主目标已满 3 个，请先移除一个再添加' };
  }
  if (!st.occupiesSlot && q.monitorFull) {
    return { ok: false, selected: list, added: false, reason: '免疫监测只能选 1 个，请先移除再加' };
  }
  list.push(id);
  return { ok: true, selected: list, added: true, reason: '' };
}

// 调序：dir 为 'up' / 'down'；越界返回 moved:false
function move(selected, index, dir) {
  const list = (selected || []).slice();
  const step = dir === 'up' ? -1 : (dir === 'down' ? 1 : 0);
  const to = index + step;
  if (!step || index < 0 || index >= list.length || to < 0 || to >= list.length) {
    return { ok: false, selected: list, moved: false };
  }
  const tmp = list[index];
  list[index] = list[to];
  list[to] = tmp;
  return { ok: true, selected: list, moved: true };
}

function removeAt(selected, index) {
  const list = (selected || []).slice();
  if (index < 0 || index >= list.length) return { ok: false, selected: list };
  list.splice(index, 1);
  return { ok: true, selected: list };
}

// 回填：保留原顺序，剔除未知/不可选/重复项；不做静默补位
function sanitize(raw) {
  const selected = [];
  const dropped = [];
  const aliases = [];
  (Array.isArray(raw) ? raw : []).forEach(function (v) {
    const original = (v === null || v === undefined) ? '' : String(v).trim();
    if (!original) return;
    const id = goals.EN_ALIAS[original] || original;
    if (id !== original) aliases.push({ from: original, to: id });
    const atom = atomOf(id);
    if (!atom || atom.selectable === false || selected.indexOf(id) >= 0) {
      dropped.push(id);
      return;
    }
    selected.push(id);
  });
  return { selected: selected, dropped: dropped, aliases: aliases };
}

// 体脂输入：空 → null；否则 3–50
function bodyFatCheck(text) {
  if (text === null || text === undefined || String(text).trim() === '') {
    return { ok: true, value: null, blank: true, reason: '' };
  }
  const n = Number(String(text).trim());
  if (!isFinite(n) || n < 3 || n > 50) {
    return { ok: false, value: null, blank: false, reason: '体脂率应在 3–50% 之间' };
  }
  return { ok: true, value: Math.round(n * 10) / 10, blank: false, reason: '' };
}

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

// 提交前预检：只查本地可判的日期/体脂；阶段与名额仍由 setGoals 复核
function precheck(selected, bodyFatText, date) {
  if ((selected || []).length && !validDate(date)) {
    return { ok: false, code: 'E_GOAL_EMPTY_DATE', reason: goals.goalErrorText('E_GOAL_EMPTY_DATE') };
  }
  const bf = bodyFatCheck(bodyFatText);
  if (!bf.ok) {
    return { ok: false, code: 'E_GOAL_BODYFAT', reason: goals.goalErrorText('E_GOAL_BODYFAT'), bodyFatPct: null };
  }
  return { ok: true, code: '', reason: '', bodyFatPct: bf.value };
}

// 页面渲染用的已选列表：带序号、是否占名额、是否可上/下移
function selectedView(selected, states) {
  return (selected || []).map(function (id, i) {
    const st = findState(states, id);
    return {
      id: id,
      index: i,
      order: i + 1,
      name: st ? st.name : id,
      roleText: st && st.occupiesSlot ? '主目标' : '监测',
      evidenceStatus: st ? st.evidenceStatus : null,
      canUp: i > 0,
      canDown: i < selected.length - 1
    };
  });
}

module.exports = {
  MAX_MAIN: MAX_MAIN,
  MAX_MONITOR: MAX_MONITOR,
  quota: quota,
  atomStates: atomStates,
  atomGroups: atomGroups,
  toggle: toggle,
  move: move,
  removeAt: removeAt,
  sanitize: sanitize,
  bodyFatCheck: bodyFatCheck,
  validDate: validDate,
  precheck: precheck,
  selectedView: selectedView
};
