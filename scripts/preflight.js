// 编译前自检：找出会让微信开发者工具直接报错、或运行时报"未找到页面/函数"的硬伤。
// 用法：node scripts/preflight.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const CF = path.join(ROOT, 'cloudfunctions');

let errors = 0;
let warns = 0;
function err(msg) { errors++; console.log('  ERROR ' + msg); }
function warn(msg) { warns++; console.log('  WARN  ' + msg); }

function exists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }
function read(p) { return fs.readFileSync(p, 'utf8'); }

// ---------- 1. app.json 页面与 tabBar ----------
console.log('\n1) app.json 页面声明');
const app = JSON.parse(read(path.join(MP, 'app.json')));
const pages = app.pages || [];
pages.forEach(function (p) {
  ['.js', '.wxml'].forEach(function (ext) {
    const f = path.join(MP, p + ext);
    if (!exists(f)) err('缺少 ' + p + ext);
  });
  ['.json', '.wxss'].forEach(function (ext) {
    const f = path.join(MP, p + ext);
    if (!exists(f)) warn('缺少可选文件 ' + p + ext);
  });
});
if (new Set(pages).size !== pages.length) err('app.json pages 有重复项');

console.log('\n2) tabBar 路径');
((app.tabBar && app.tabBar.list) || []).forEach(function (t) {
  if (pages.indexOf(t.pagePath) < 0) err('tabBar 指向未声明的页面 ' + t.pagePath);
  if (t.iconPath && !exists(path.join(MP, t.iconPath))) warn('tabBar 图标不存在 ' + t.iconPath);
});

// 反向：页面目录里有、app.json 没声明的（孤页，无法访问）
const pageDir = path.join(MP, 'pages');
fs.readdirSync(pageDir).forEach(function (d) {
  const decl = 'pages/' + d + '/' + d;
  if (exists(path.join(pageDir, d, d + '.js')) && pages.indexOf(decl) < 0 && pages.indexOf(decl + '/' + d) < 0) {
    warn('页面目录 ' + d + ' 未在 app.json 注册');
  }
});

// ---------- 3. 页面跳转目标 ----------
console.log('\n3) wx.navigateTo / switchTab 目标');
function walkFiles(dir, exts, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(function (f) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkFiles(p, exts, out);
    else if (exts.some(function (e) { return f.endsWith(e); })) out.push(p);
  });
  return out;
}
walkFiles(MP, ['.js']).forEach(function (f) {
  const js = read(f).replace(/^\s*\/\/.*$/gm, '');
  const re = /wx\.(navigateTo|redirectTo|switchTab|reLaunch|navigateBack)\s*\(\s*\{[\s\S]{0,200}?url\s*:\s*['"]([^'"$?]+)[^'"]*['"]/g;
  let m;
  while ((m = re.exec(js))) {
    const target = m[2].replace(/^\//, '');
    if (!exists(path.join(MP, target + '.js'))) {
      err(path.relative(ROOT, f) + ' -> ' + m[1] + ' 指向不存在的页面 ' + target);
    }
  }
});

// ---------- 4. WXML 事件处理函数 ----------
console.log('\n4) WXML 事件处理函数是否存在');
walkFiles(path.join(MP, 'pages'), ['.wxml']).forEach(function (wxmlPath) {
  const jsPath = wxmlPath.replace(/\.wxml$/, '.js');
  if (!exists(jsPath)) return;
  const js = read(jsPath);
  const wxml = read(wxmlPath);
  const handlers = new Set();
  // navigateTo 里带 data-url 的不是函数；只收 bind/catch 的属性值
  wxml.replace(/\b(?:bind|catch|capture-bind|capture-catch)[:]?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g, function (m, ev, fn) {
    if (fn && fn.trim()) handlers.add(fn.trim());
    return m;
  });
  handlers.forEach(function (fn) {
    const def = new RegExp('(^|[\\s,{])' + fn.replace(/[$]/g, '\\$') + '\\s*[:(]', 'm');
    if (!def.test(js)) err(path.relative(ROOT, wxmlPath) + ' 绑定了未定义的处理函数 ' + fn);
  });
});

// ---------- 5. WXML 标签配对 ----------
console.log('\n5) WXML 标签配对');
const SELF_CLOSE = new Set(['image', 'input', 'icon', 'progress', 'import', 'include', 'switch', 'slider', 'checkbox', 'radio', 'audio', 'video', 'camera', 'canvas', 'live-player', 'live-pusher', 'map', 'textarea']);
walkFiles(path.join(MP, 'pages'), ['.wxml']).forEach(function (wxmlPath) {
  const src = read(wxmlPath).replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m, bad = false;
  while ((m = re.exec(src))) {
    const tag = m[1], closing = m[0][1] === '/', selfClosed = m[3] === '/';
    if (closing) {
      const top = stack.pop();
      if (top !== tag && !bad) {
        err(path.relative(ROOT, wxmlPath) + ' 标签不配对：期望 </' + (top || '?') + '>，遇到 </' + tag + '>');
        bad = true;
      }
    } else if (!selfClosed && !SELF_CLOSE.has(tag)) {
      stack.push(tag);
    }
  }
  if (!bad && stack.length) err(path.relative(ROOT, wxmlPath) + ' 未闭合标签：' + stack.join(','));
});

// ---------- 6. require 路径 ----------
console.log('\n6) require 路径是否存在');
walkFiles(MP, ['.js']).concat(walkFiles(CF, ['.js'])).forEach(function (f) {
  const js = read(f).replace(/^\s*\/\/.*$/gm, '');
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(js))) {
    const target = path.resolve(path.dirname(f), m[1]);
    const ok = exists(target) || exists(target + '.js') || exists(path.join(target, 'index.js'));
    if (!ok) err(path.relative(ROOT, f) + ' require 找不到 ' + m[1]);
  }
});

// ---------- 7. 云函数完整性 ----------
console.log('\n7) 云函数');
fs.readdirSync(CF).forEach(function (fn) {
  const dir = path.join(CF, fn);
  if (!fs.statSync(dir).isDirectory()) return;
  const idx = path.join(dir, 'index.js');
  if (!exists(idx)) { err('云函数 ' + fn + ' 缺少 index.js'); return; }
  if (!/exports\.main\s*=/.test(read(idx))) err('云函数 ' + fn + ' 没有 exports.main');
  const pkg = path.join(dir, 'package.json');
  if (!exists(pkg)) { err('云函数 ' + fn + ' 缺少 package.json'); return; }
  try {
    const j = JSON.parse(read(pkg));
    if (!j.dependencies || !j.dependencies['wx-server-sdk']) warn('云函数 ' + fn + ' 未声明 wx-server-sdk 依赖');
  } catch (e) { err('云函数 ' + fn + ' package.json 不是合法 JSON'); }
});

// ---------- 8. 云端 lib 与小程序端是否同步 ----------
console.log('\n8) 规则引擎同步状态');
['saveLog', 'getFeed', 'coachApi', 'advice'].forEach(function (fn) {
  const local = path.join(MP, 'utils', 'rules.js');
  const remote = path.join(CF, fn, 'lib', 'rules.js');
  if (!exists(remote)) { err(fn + '/lib/rules.js 不存在，先跑 bash scripts/sync-shared.sh'); return; }
  const a = read(local)
    .replace(/require\('\.\.\/data\/knowledge\.js'\)/, "require('./knowledge.js')")
    .replace(/require\('\.\.\/data\/ruleRegistry\.js'\)/, "require('./ruleRegistry.js')")
    .replace(/require\('\.\.\/data\/goalMatrix\.js'\)/, "require('./goalMatrix.js')");
  const b = read(remote);
  if (a !== b) err(fn + '/lib/rules.js 与 miniprogram/utils/rules.js 不一致，跑 bash scripts/sync-shared.sh');
  const kbA = read(path.join(MP, 'data', 'knowledge.js'));
  const kbB = exists(path.join(CF, fn, 'lib', 'knowledge.js')) ? read(path.join(CF, fn, 'lib', 'knowledge.js')) : '';
  if (kbA !== kbB) err(fn + '/lib/knowledge.js 未同步');
  const regA = read(path.join(MP, 'data', 'ruleRegistry.js'));
  const regB = exists(path.join(CF, fn, 'lib', 'ruleRegistry.js')) ? read(path.join(CF, fn, 'lib', 'ruleRegistry.js')) : '';
  if (regA !== regB) err(fn + '/lib/ruleRegistry.js 未同步');
  const gmB = exists(path.join(CF, fn, 'lib', 'goalMatrix.js')) ? read(path.join(CF, fn, 'lib', 'goalMatrix.js')) : '';
  if (read(path.join(MP, 'data', 'goalMatrix.js')) !== gmB) err(fn + '/lib/goalMatrix.js 未同步');
  const goalsA = read(path.join(MP, 'utils', 'goals.js')).replace(/require\('\.\.\/data\/goalMatrix\.js'\)/, "require('./goalMatrix.js')");
  const goalsB = exists(path.join(CF, fn, 'lib', 'goals.js')) ? read(path.join(CF, fn, 'lib', 'goals.js')) : '';
  if (goalsA !== goalsB) err(fn + '/lib/goals.js 未同步');
  // weekly.js 只有 getFeed / advice 消费；saveLog / coachApi 不要求存在，避免误报 MISSING
  if (fn === 'getFeed' || fn === 'advice') {
    const wkA = read(path.join(MP, 'utils', 'weekly.js'))
      .replace(/require\('\.\/rules\.js'\)/, "require('./rules.js')");
    const wkRemote = path.join(CF, fn, 'lib', 'weekly.js');
    if (!exists(wkRemote)) {
      err(fn + '/lib/weekly.js 不存在，跑 bash scripts/sync-shared.sh');
    } else {
      const wkB = read(wkRemote).replace(/require\('\.\/rules\.js'\)/, "require('./rules.js')");
      if (wkA !== wkB) err(fn + '/lib/weekly.js 与 miniprogram/utils/weekly.js 不一致，跑 bash scripts/sync-shared.sh');
    }
  }
  if (fn === 'advice') return; // advice 不需要 followup
  const fuA = exists(path.join(MP, 'utils', 'followup.js'))
    ? read(path.join(MP, 'utils', 'followup.js')).replace(/require\('\.\.\/data\/ruleRegistry\.js'\)/, "require('./ruleRegistry.js')")
    : '';
  const fuB = exists(path.join(CF, fn, 'lib', 'followup.js')) ? read(path.join(CF, fn, 'lib', 'followup.js')) : '';
  if (fuA && fuA !== fuB) err(fn + '/lib/followup.js 未同步');
});

// ---------- 10. 规则登记表一致性 ----------
console.log('\n10) 规则登记表');
const rulesMod = require(path.join(MP, 'utils', 'rules.js'));
const regIds = rulesMod.listRules().map(function (r) { return r.ruleId; });
if (new Set(regIds).size !== regIds.length) err('ruleId 有重复');
let regProblems = [];
rulesMod.listRules().forEach(function (r) {
  if (!r.name || !r.logicSummary || !r.thresholds) regProblems.push(r.ruleId + ' 缺名称/逻辑/阈值');
  if (!r.sources || !r.sources.length) regProblems.push(r.ruleId + ' 没有来源');
  (r.sources || []).forEach(function (s) {
    if (!s.citation || !s.anchor || !s.year) regProblems.push(r.ruleId + ' 来源缺 citation/anchor/year');
    if (!s.doi && !s.url) regProblems.push(r.ruleId + ' 来源缺 doi/url');
  });
  if (!r.applicablePhases || !r.applicablePhases.length) regProblems.push(r.ruleId + ' 没有适用阶段');
  ['active', 'needs_review', 'deprecated'].indexOf(r.reviewStatus) < 0 && regProblems.push(r.ruleId + ' reviewStatus 非法');
});
if (regProblems.length) err('登记表问题：' + regProblems.slice(0, 6).join('；') + (regProblems.length > 6 ? ' …共 ' + regProblems.length : ''));

// 阶段配置里引用的 ruleId 必须都在登记表中
let phaseProblems = [];
Object.keys(rulesMod.PHASE_PROFILES).forEach(function (p) {
  const prof = rulesMod.PHASE_PROFILES[p];
  prof.activeRuleIds.concat(prof.suppressedRuleIds).forEach(function (id) {
    if (regIds.indexOf(id) < 0) phaseProblems.push(p + ' -> ' + id);
  });
  const w = prof.metricWeights;
  const sum = Object.keys(w).reduce(function (s, k) { return s + w[k]; }, 0);
  if (sum !== 100) phaseProblems.push(p + ' 权重合计 ' + sum);
});
if (phaseProblems.length) err('阶段配置问题：' + phaseProblems.join('；'));

// 登记表的 applicablePhases 必须与阶段配置的 activeRuleIds 完全一致（防止文档与代码漂移）
let driftProblems = [];
regIds.forEach(function (id) {
  const r = rulesMod.getRuleById(id);
  PHASE_LIST().forEach(function (p) {
    const active = rulesMod.PHASE_PROFILES[p].activeRuleIds.indexOf(id) >= 0;
    const declared = (r.applicablePhases || []).indexOf(p) >= 0;
    if (active !== declared) driftProblems.push(id + '@' + p + (active ? ' 代码启用但登记表没写' : ' 登记表写了但代码未启用'));
  });
});
function PHASE_LIST() { return ['maintain', 'cut', 'peak', 'recover']; }
if (driftProblems.length) err('阶段与登记表不一致：' + driftProblems.join('；'));

// 新页面必须能被找到（队列 / 规则库 / 周报）
['pages/queue/queue', 'pages/rules/rules', 'pages/report/report'].forEach(function (p) {
  if (!exists(path.join(MP, p + '.js'))) err('缺少页面 ' + p);
});

// 演示种子数据：非空时会在首次启动导入，必须提醒
try {
  const seed = require(path.join(MP, 'data', 'seed.js'));
  if (Array.isArray(seed) && seed.length) {
    warn('data/seed.js 含 ' + seed.length + ' 条演示数据（首次启动导入），正式使用前改回 []');
  }
} catch (e) {
  err('data/seed.js 不是合法模块');
}

// ---------- 11. 照片识别（visionFood） ----------
console.log('\n11) 照片识别云函数');
const vf = path.join(CF, 'visionFood');
if (!exists(path.join(vf, 'index.js'))) err('缺少云函数 visionFood');
else {
  const src = read(path.join(vf, 'index.js'));
  ['VISION_BASE_URL', 'VISION_MODEL', 'VISION_API_KEY'].forEach(function (k) {
    if (src.indexOf(k) < 0) err('visionFood 没有读取环境变量 ' + k);
  });
  if (!exists(path.join(vf, 'lib', 'vision.js'))) err('visionFood/lib/vision.js 不存在，跑 bash scripts/sync-shared.sh');
  else if (read(path.join(vf, 'lib', 'vision.js')) !== read(path.join(MP, 'utils', 'vision.js'))) {
    err('visionFood/lib/vision.js 与 miniprogram/utils/vision.js 不一致，跑 bash scripts/sync-shared.sh');
  }
  if (!exists(path.join(vf, 'package.json'))) err('visionFood 缺少 package.json');
}

// ---------- 9. 配置占位符 ----------
console.log('\n9) 配置');
const cfg = read(path.join(MP, 'config.js'));
if (/YOUR-CLOUD-ENV-ID/.test(cfg)) warn('config.js 的 env 还是占位符，编译后只能进离线模式');
const pc = JSON.parse(read(path.join(ROOT, 'project.config.json')));
if (pc.appid === 'touristappid') warn('project.config.json 的 appid 还是 touristappid，云开发不可用（只能本地预览）');

// ---------- 12. 复合目标矩阵 ----------
console.log('\n12) 复合目标矩阵');
(function () {
  const GM_PATH = path.join(MP, 'data', 'goalMatrix.js');
  let gm;
  try {
    gm = require(GM_PATH);
  } catch (e) {
    err('data/goalMatrix.js 不是合法模块：' + e.message);
    return;
  }

  const PHASES = ['maintain', 'cut', 'peak', 'recover'];
  const EVIDENCE = ['strong', 'moderate', 'weak', 'mixed'];
  const LEGALITY = ['legal', 'conditional', 'monitor', 'guardrail', 'veto', 'illegal'];

  // 版本号
  if (!gm.GOAL_MATRIX_VERSION || typeof gm.GOAL_MATRIX_VERSION !== 'string') {
    err('GOAL_MATRIX_VERSION 缺失或不是字符串');
  }

  // 原子
  const atoms = gm.ATOMS || [];
  const atomIds = atoms.map(function (a) { return a.id; });
  if (atoms.length !== 16) err('目标原子应为 16 个，实际 ' + atoms.length);
  if (new Set(atomIds).size !== atomIds.length) err('目标原子 ID 有重复');
  if (atomIds.indexOf('EN') >= 0) err('atoms 不得出现 EN（EN 只允许在入口归一化映射里）');
  atoms.forEach(function (a) {
    if (!a.name || !a.dimension) err('目标原子 ' + a.id + ' 缺名称/维度');
    if (!Array.isArray(a.confirmSignals) || !a.confirmSignals.length) err('目标原子 ' + a.id + ' 缺判定信号');
    if (!Array.isArray(a.counterSignals)) err('目标原子 ' + a.id + ' 缺反证信号字段');
    if (!Array.isArray(a.legalPhases) || !a.legalPhases.length) {
      err('目标原子 ' + a.id + ' 没有合法阶段');
    } else {
      a.legalPhases.forEach(function (p) {
        if (PHASES.indexOf(p) < 0) err('目标原子 ' + a.id + ' 的合法阶段 ' + p + ' 不存在');
      });
    }
    if (a.id === 'G-IMM' && a.occupiesSlot !== false) err('G-IMM 不应占用目标名额');
    if (a.id === 'G-MED' && a.selectable !== false) err('G-MED 不应是可选择目标');
  });

  // 64 格：每个原子在每个阶段都有格
  const matrix = gm.MATRIX || {};
  let cellCount = 0;
  PHASES.forEach(function (phase) {
    const row = matrix[phase];
    if (!row) { err('矩阵缺少阶段 ' + phase); return; }
    atoms.forEach(function (a) {
      const c = row[a.id];
      if (!c) { err('矩阵缺少格 ' + phase + '/' + a.id); return; }
      cellCount++;
      if (c.cellId !== 'MX-' + phase.toUpperCase() + '-' + a.id) {
        err('格编号不匹配 ' + phase + '/' + a.id + ' -> ' + c.cellId);
      }
      if (typeof c.legal !== 'boolean') err('格 ' + phase + '/' + a.id + ' 的 legal 不是布尔值');
      if (LEGALITY.indexOf(c.legality) < 0) err('格 ' + phase + '/' + a.id + ' 的 legality 非法：' + c.legality);
      if (EVIDENCE.indexOf(c.evidenceStatus) < 0) err('格 ' + phase + '/' + a.id + ' 的 evidenceStatus 非法：' + c.evidenceStatus);
      if (!c.strategy) err('格 ' + phase + '/' + a.id + ' 缺策略');
      ['timing', 'extraFields', 'monitorRules', 'monitorKbIds', 'monitorFields', 'anchors'].forEach(function (k) {
        if (!Array.isArray(c[k])) err('格 ' + phase + '/' + a.id + ' 的 ' + k + ' 不是数组');
      });

      // 弱证据格不得携带数值处方
      if (c.evidenceStatus === 'weak') {
        if (c.macros !== null) err('弱证据格 ' + phase + '/' + a.id + ' 携带宏量处方');
        ['targets', 'prescription', 'numericRanges', 'grams'].forEach(function (k) {
          if (c[k]) err('弱证据格 ' + phase + '/' + a.id + ' 携带数值处方字段 ' + k);
        });
      }

      // 非法阶段组合标记
      if (c.legal === false) {
        if (c.legality !== 'illegal') err('非法格 ' + phase + '/' + a.id + ' 的 legality 应为 illegal');
        if (!c.illegalReason) err('非法格 ' + phase + '/' + a.id + ' 缺 illegalReason');
        if (!c.goalRule) err('非法格 ' + phase + '/' + a.id + ' 缺 goalRule');
        if (c.macros !== null) err('非法格 ' + phase + '/' + a.id + ' 不应携带宏量');
      } else if (c.legality === 'illegal') {
        err('格 ' + phase + '/' + a.id + ' legal=true 但 legality=illegal');
      }
      if (c.legality === 'conditional' && !c.condition) {
        err('条件合法格 ' + phase + '/' + a.id + ' 缺 condition');
      }

      // 原子合法阶段与矩阵一致
      if (c.legal && a.legalPhases.indexOf(phase) < 0) {
        err('矩阵 ' + phase + '/' + a.id + ' 合法但原子 legalPhases 未包含该阶段');
      }
    });
  });
  if (cellCount !== 64) err('矩阵应为 64 格，实际 ' + cellCount);

  // B-REFUEL 的碳水必须是两个不连续区间：[[4,7],[8,12]]，不得写成 {min:4,max:12}
  const bRefuel = MATRIX_RECOVER_BREFUEL();
  if (!bRefuel || !bRefuel.targets) {
    err('recover/B-REFUEL 缺 targets');
  } else {
    const carb = bRefuel.targets.carb;
    if (!Array.isArray(carb) || carb.length !== 2) {
      err('B-REFUEL targets.carb 必须是两个区间组成的数组');
    } else {
      carb.forEach(function (seg, i) {
        if (!Array.isArray(seg) || seg.length !== 2 || typeof seg[0] !== 'number' || typeof seg[1] !== 'number' || seg[0] > seg[1]) {
          err('B-REFUEL targets.carb 第 ' + i + ' 段不是合法区间');
        }
      });
      if (carb[0][1] >= carb[1][0]) {
        err('B-REFUEL targets.carb 不得连续化（7–8 之间非法）');
      }
    }
  }
  function MATRIX_RECOVER_BREFUEL() {
    return matrix.recover && matrix.recover['B-REFUEL'];
  }

  // 配方
  const comps = gm.COMPOSITES || [];
  if (comps.length !== 29) err('复合配方应为 29 条，实际 ' + comps.length);
  const compIds = comps.map(function (c) { return c.id; });
  if (new Set(compIds).size !== compIds.length) err('配方编号有重复');
  const concessionModes = gm.CONCESSION_MODES || [];
  if (concessionModes.length !== 6) err('让步模式应为 6 种，实际 ' + concessionModes.length);
  // 配方允许额外使用 veto（护栏动作，§4/§5.1 用，但不是 §5.3 的六种让步模式）
  const modes = gm.RECIPE_MODE_IDS || gm.CONCESSION_MODE_IDS || [];
  comps.forEach(function (c) {
    if (!/^C\d{2}$/.test(c.id)) err('配方编号格式错误 ' + c.id);
    if (!Array.isArray(c.atoms) || c.atoms.length < 2 || c.atoms.length > 3) {
      err('配方 ' + c.id + ' 的原子数应为 2–3');
    } else {
      c.atoms.forEach(function (id) {
        if (id === 'EN') err('配方 ' + c.id + ' 的 atoms 不得出现 EN');
        if (atomIds.indexOf(id) < 0) err('配方 ' + c.id + ' 引用未知原子 ' + id);
      });
    }
    if (c.docAtoms && c.docAtoms.indexOf('EN') >= 0) err('配方 ' + c.id + ' 的 docAtoms 不得出现 EN');
    if (c.lead && atomIds.indexOf(c.lead) < 0) err('配方 ' + c.id + ' 的主导原子不存在 ' + c.lead);
    if (c.leadByPhase) {
      Object.keys(c.leadByPhase).forEach(function (p) {
        if (PHASES.indexOf(p) < 0) err('配方 ' + c.id + ' 的 leadByPhase 阶段不存在 ' + p);
        if (atomIds.indexOf(c.leadByPhase[p]) < 0) err('配方 ' + c.id + ' 的 leadByPhase 原子不存在 ' + c.leadByPhase[p]);
      });
    }
    const usedModes = [c.mode].concat(c.modes || []);
    usedModes.forEach(function (m) {
      if (m === 'veto') err('配方 ' + c.id + ' 的 concessions[].mode 不得为 veto');
      if (modes.indexOf(m) < 0) err('配方 ' + c.id + ' 使用未知让步模式 ' + m);
    });
    if (c.guardrailAction && c.guardrailAction !== 'veto') {
      err('配方 ' + c.id + ' 的 guardrailAction 只允许 veto');
    }
    if (!Array.isArray(c.phases) || !c.phases.length) {
      err('配方 ' + c.id + ' 没有触发阶段');
    } else {
      c.phases.forEach(function (p) {
        if (PHASES.indexOf(p) < 0) err('配方 ' + c.id + ' 引用未知阶段 ' + p);
      });
    }
    if (EVIDENCE.indexOf(c.evidence) < 0) err('配方 ' + c.id + ' 的 evidence 非法：' + c.evidence);
  });

  // 冲突边：mode 不得为 veto；护栏动作只允许在 legality/goalBlockers/配方 guardrailAction
  (gm.CONFLICT_EDGES || []).forEach(function (e) {
    if (e.mode === 'veto') err('冲突边 ' + e.a + '↔' + e.b + ' 的 mode 不得为 veto');
  });

  // 优先级栈
  const stack = gm.PRIORITY_STACK || [];
  if (stack.length !== 7) err('优先级栈应为 L0–L6 共 7 层，实际 ' + stack.length);
  stack.forEach(function (s, i) {
    if (s.level !== 'L' + i) err('优先级栈第 ' + i + ' 层应为 L' + i + '，实际 ' + s.level);
  });
})();

console.log('\n---------------------------------------');
console.log(errors === 0 ? '没有阻塞性问题' : errors + ' 个阻塞问题') ;
console.log(warns + ' 个提醒');
process.exit(errors ? 1 : 0);
