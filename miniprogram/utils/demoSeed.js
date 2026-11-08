// 演示数据的识别、平移与导入决策（纯函数，便于 Node 测试，不依赖 wx）。
// 约定：
// - 演示记录必须带 demo:true；历史版本没有 demo 标记，用 id 前缀 seed- 兜底识别。
// - 真实记录永远不参与任何"重导/清空"，只会在有真实记录时把演示记录剔除。
const fmt = require('./format.js');

const META_KEY = 'demo_seed_meta_v1';
const OPTOUT_KEY = 'demo_seed_optout_v1';

function isDemo(log) {
  if (!log) return false;
  if (log.demo === true) return true;
  return !!(log.id && String(log.id).indexOf('seed-') === 0);
}

function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return fmt.todayStr(d);
}

function maxDate(list) {
  let max = '';
  (list || []).forEach(function (l) {
    if (l && l.date && l.date > max) max = l.date;
  });
  return max;
}

function sortDesc(list) {
  return (list || []).slice().sort(function (a, b) {
    const av = (a && a.date) || '';
    const bv = (b && b.date) || '';
    if (av === bv) return 0;
    return av < bv ? 1 : -1;
  });
}

function seedVersion(seed) {
  for (let i = 0; i < (seed || []).length; i++) {
    if (seed[i] && seed[i].demoVersion) return String(seed[i].demoVersion);
  }
  return 'legacy';
}

// 整体平移一条记录：日期、seed-* id、目标称重日、createdAt 的日期段
function shiftRecord(rec, days) {
  const out = JSON.parse(JSON.stringify(rec));
  const next = shiftDate(rec.date, days);
  out.date = next;
  out.demo = true;
  if (out.id && String(out.id).indexOf('seed-') === 0) out.id = 'seed-' + next;
  if (out.goal && out.goal.weighInDate) out.goal.weighInDate = shiftDate(out.goal.weighInDate, days);
  if (out.createdAt && /^\d{4}-\d{2}-\d{2}T/.test(out.createdAt)) {
    out.createdAt = next + out.createdAt.slice(10);
  }
  return out;
}

// 以 seed 里最大日期为基准结束日，把整批演示数据平移到 today 结束
function reanchor(seed, today) {
  if (!seed || !seed.length) return [];
  const baseEnd = maxDate(seed);
  if (!baseEnd) return [];
  const delta = fmt.daysBetween(baseEnd, today);
  return sortDesc(seed.map(function (r) { return shiftRecord(r, delta); }));
}

// 导入决策。返回 { action, records, meta }：
// - keep-real     有真实记录：只保留真实记录，演示记录被剔除
// - purge-optout  用户清空过本机：不导入演示，仅保留真实记录（通常为空）
// - skip-optout   无真实记录且已选择停用演示：原样保留，不导入
// - fresh         首次 / 版本变化 / 同版本但本机无演示：按今天重锚整批导入
// - shift         同版本跨天：保留用户对演示记录的修改，只平移日期
// - keep          同版本同一天：不动
function planImport(opts) {
  const seed = opts.seed || [];
  const logs = opts.logs || [];
  const meta = opts.meta || null;
  const today = opts.today;
  const reals = logs.filter(function (l) { return !isDemo(l); });
  const demos = logs.filter(isDemo);

  if (reals.length) {
    return {
      action: 'keep-real',
      records: sortDesc(reals),
      meta: null,
      realCount: reals.length,
      demoCount: demos.length
    };
  }

  if (opts.optout) {
    return {
      action: demos.length ? 'purge-optout' : 'skip-optout',
      records: [],
      meta: null,
      realCount: 0,
      demoCount: demos.length
    };
  }

  const version = seedVersion(seed);
  const records = reanchor(seed, today);

  if (!meta || meta.version !== version) {
    return { action: 'fresh', records: records, meta: buildMeta(version, seed, today, records.length), realCount: 0, demoCount: 0 };
  }

  if (!demos.length) {
    return { action: 'fresh', records: records, meta: buildMeta(version, seed, today, records.length), realCount: 0, demoCount: 0 };
  }

  const last = maxDate(demos);
  const delta = fmt.daysBetween(last, today);
  if (delta > 0) {
    const shifted = sortDesc(demos.map(function (r) { return shiftRecord(r, delta); }));
    return { action: 'shift', records: shifted, meta: buildMeta(version, seed, today, shifted.length), realCount: 0, demoCount: shifted.length };
  }
  if (delta < 0) {
    // 设备时间回拨：用 seed 重新锚定，避免出现"未来演示记录"
    return { action: 'fresh', records: records, meta: buildMeta(version, seed, today, records.length), realCount: 0, demoCount: 0 };
  }
  return { action: 'keep', records: sortDesc(demos), meta: buildMeta(version, seed, today, demos.length), realCount: 0, demoCount: demos.length };
}

function buildMeta(version, seed, today, count) {
  return {
    version: version,
    baseEnd: maxDate(seed),
    installedEnd: today,
    count: count,
    installedAt: fmt.nowIso()
  };
}

module.exports = {
  META_KEY: META_KEY,
  OPTOUT_KEY: OPTOUT_KEY,
  isDemo: isDemo,
  shiftDate: shiftDate,
  maxDate: maxDate,
  sortDesc: sortDesc,
  seedVersion: seedVersion,
  shiftRecord: shiftRecord,
  reanchor: reanchor,
  planImport: planImport
};
