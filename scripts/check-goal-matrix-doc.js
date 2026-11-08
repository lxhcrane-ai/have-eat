// 目标矩阵：代码与文档逐格对照（legal / goal01Level / evidence）+ 版本同步检查
// 用法：node scripts/check-goal-matrix-doc.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'goal-matrix.md');
const GM = require(path.join(ROOT, 'miniprogram', 'data', 'goalMatrix.js'));
const PHASES = ['maintain', 'cut', 'peak', 'recover'];
const PHASE_LABEL = { maintain: '维持期', cut: '减脂期', peak: '微调期', recover: '恢复期' };

let errors = 0;
let infos = [];
function bad(msg) { errors++; console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }
function info(msg) { infos.push(msg); console.log('  · ' + msg); }

// ---------------------------------------------------------------------------
// 1. 解析 §2.2–2.5 的 60 格表：合法性标记
// ---------------------------------------------------------------------------
const lines = fs.readFileSync(DOC, 'utf8').split(/\r?\n/);
const docCells = {};
let phase = null;
lines.forEach(function (line) {
  const h = line.match(/^### 2\.\d+ (maintain|cut|peak|recover)/);
  if (h) { phase = h[1]; return; }
  if (line.indexOf('### 2.6') === 0) phase = null;
  if (!phase || !line.startsWith('|')) return;
  const cols = line.split('|').map(function (s) { return s.trim(); });
  const atomId = cols[1];
  if (!GM.ATOMS.some(function (a) { return a.id === atomId; })) return;
  docCells[phase + '/' + atomId] = cols[2];
});

console.log('\n1) 60 格合法性');
if (Object.keys(docCells).length !== 60) bad('文档解析到 ' + Object.keys(docCells).length + ' 格，应为 60');
else ok('文档解析到 60 格');
let legalCount = 0;
PHASES.forEach(function (p) {
  GM.ATOMS.forEach(function (a) {
    const key = p + '/' + a.id;
    const marker = docCells[key];
    const c = GM.MATRIX[p] && GM.MATRIX[p][a.id];
    if (!marker) { bad('文档缺格 ' + key); return; }
    const docLegal = marker.indexOf('✅') === 0;
    if (docLegal !== c.legal) bad(key + ' legal 不一致：文档 ' + marker + '，代码 ' + c.legal);
    else {
      legalCount++;
      // 合法子类型只作提示，硬性口径是 legal
      let sub = 'legal';
      if (/条件/.test(marker)) sub = 'conditional';
      else if (/监测/.test(marker)) sub = 'monitor';
      else if (/护栏/.test(marker)) sub = 'guardrail';
      else if (/否决/.test(marker)) sub = 'veto';
      if (docLegal && sub !== 'legal' && c.legality !== sub) {
        info(key + ' 合法子类型文档=' + sub + ' 代码=' + c.legality + '（仅提示，legal 一致）');
      }
    }
  });
});
ok('legal 逐格一致 ' + legalCount + '/60');

// ---------------------------------------------------------------------------
// 2. 解析 §6.1 分级判定表：goal01Level
// ---------------------------------------------------------------------------
const levelRules = [];
let in61 = false;
lines.forEach(function (line) {
  if (line.indexOf('### 6.1') === 0) { in61 = true; return; }
  if (in61 && line.indexOf('### 6.2') === 0) { in61 = false; return; }
  if (!in61 || !line.startsWith('|')) return;
  const cols = line.split('|').map(function (s) { return s.trim(); });
  const first = cols[1] || '';
  const level = cols[2] || '';
  if (!/^(red|amber)$/.test(level)) return;
  const atomIds = (first.match(/\b(?:P|B|G)-(?:POW|SPD|HYP|END|SKL|CUT|HOLD|GAIN|PEAK|REFUEL|SLE|GI|EA|IMM|MED)\b/g) || []);
  if (!atomIds.length) return;
  let phases = PHASES.filter(function (p) { return first.indexOf(p) >= 0; });
  const notPhase = first.match(/不在\s+(maintain|cut|peak|recover)/);
  if (notPhase) phases = PHASES.filter(function (p) { return p !== notPhase[1]; });
  const conditional = /但/.test(first);
  atomIds.forEach(function (id) {
    phases.forEach(function (p) {
      levelRules.push({ atomId: id, phase: p, level: level, conditional: conditional });
    });
  });
});

console.log('\n2) 60 格 goal01Level');
let levelChecked = 0;
function ruleOf(atomId, phase, conditional) {
  return levelRules.filter(function (r) {
    return r.atomId === atomId && r.phase === phase && r.conditional === conditional;
  })[0];
}
PHASES.forEach(function (p) {
  GM.ATOMS.forEach(function (a) {
    const c = GM.MATRIX[p][a.id];
    if (!c.legal) {
      const r = ruleOf(a.id, p, false);
      if (!r) bad(p + '/' + a.id + ' 在 §6.1 找不到非法分级');
      else if (c.goal01Level !== r.level) bad(p + '/' + a.id + ' 级别不一致：文档 ' + r.level + '，代码 ' + c.goal01Level);
      else levelChecked++;
      return;
    }
    if (c.goal01Level) {
      const r = ruleOf(a.id, p, true) || ruleOf(a.id, p, false);
      if (!r) bad(p + '/' + a.id + ' 代码有级别 ' + c.goal01Level + '，文档 §6.1 无对应');
      else if (c.goal01Level !== r.level) bad(p + '/' + a.id + ' 条件级别不一致：文档 ' + r.level + '，代码 ' + c.goal01Level);
      else levelChecked++;
      return;
    }
    const illegalRule = ruleOf(a.id, p, false);
    if (illegalRule) bad(p + '/' + a.id + ' 文档判非法，代码 legal=true');
    else levelChecked++;
  });
});
ok('goal01Level 逐格一致 ' + levelChecked + '/60');

// ---------------------------------------------------------------------------
// 3. 证据：文档明确标弱的原子（§8.3、§2 表内 weak 标记）
// ---------------------------------------------------------------------------
console.log('\n3) 60 格 evidenceStatus');
const weakAtoms = ['P-SKL', 'G-IMM']; // §8.3：技术/战术、大负荷+免疫（仅监测）
let weakChecked = 0;
PHASES.forEach(function (p) {
  GM.ATOMS.forEach(function (a) {
    const c = GM.MATRIX[p][a.id];
    const shouldWeak = weakAtoms.indexOf(a.id) >= 0;
    if (shouldWeak && c.evidenceStatus !== 'weak') bad(p + '/' + a.id + ' 文档标弱证据，代码 ' + c.evidenceStatus);
    else if (!shouldWeak && c.evidenceStatus === 'weak') bad(p + '/' + a.id + ' 代码弱证据，文档未标');
    else weakChecked++;
  });
});
ok('weak 证据逐格一致 ' + weakChecked + '/60');
let drift = [];
PHASES.forEach(function (p) {
  GM.ATOMS.forEach(function (a) {
    const c = GM.MATRIX[p][a.id];
    if (a.evidenceDefault !== c.evidenceStatus) drift.push(p + '/' + a.id + ' ' + a.evidenceDefault + '→' + c.evidenceStatus);
  });
});
info('与原子默认证据不同的格（文档未逐格规定，仅记录）：' + (drift.length ? drift.join('；') : '无'));

// ---------------------------------------------------------------------------
// 4. 版本与四份共享库
// ---------------------------------------------------------------------------
console.log('\n4) 版本与共享库同步');
const rules = require(path.join(ROOT, 'miniprogram', 'utils', 'rules.js'));
if (rules.RULES_VERSION !== 'v4.0') bad('RULES_VERSION 应为 v4.0，实际 ' + rules.RULES_VERSION);
else ok('RULES_VERSION = v4.0');

const LIBS = ['saveLog', 'getFeed', 'coachApi', 'advice'];
const mpRules = fs.readFileSync(path.join(ROOT, 'miniprogram', 'utils', 'rules.js'), 'utf8')
  .replace(/require\('\.\.\/data\/knowledge\.js'\)/, "require('./knowledge.js')")
  .replace(/require\('\.\.\/data\/ruleRegistry\.js'\)/, "require('./ruleRegistry.js')")
  .replace(/require\('\.\.\/data\/goalMatrix\.js'\)/, "require('./goalMatrix.js')");
const mpGoals = fs.readFileSync(path.join(ROOT, 'miniprogram', 'utils', 'goals.js'), 'utf8')
  .replace(/require\('\.\.\/data\/goalMatrix\.js'\)/, "require('./goalMatrix.js')");
const mpGM = fs.readFileSync(path.join(ROOT, 'miniprogram', 'data', 'goalMatrix.js'), 'utf8');

let syncOk = 0;
LIBS.forEach(function (fn) {
  const dir = path.join(ROOT, 'cloudfunctions', fn, 'lib');
  const checks = [['rules.js', mpRules], ['goals.js', mpGoals], ['goalMatrix.js', mpGM]];
  checks.forEach(function (it) {
    const p = path.join(dir, it[0]);
    if (!fs.existsSync(p)) { bad(fn + '/lib/' + it[0] + ' 缺失'); return; }
    if (fs.readFileSync(p, 'utf8') !== it[1]) { bad(fn + '/lib/' + it[0] + ' 未同步'); return; }
    syncOk++;
  });
});
ok('四份共享库 rules/goals/goalMatrix 同步 ' + syncOk + '/12');

const jsFiles = [];
function walk(dir) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name === 'node_modules' || name === '.git') return;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.js')) jsFiles.push(p);
  });
}
['miniprogram', 'cloudfunctions'].forEach(function (d) {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p)) walk(p);
});
const gmDefs = jsFiles.filter(function (p) {
  return /GOAL_MATRIX_VERSION\s*=\s*['"][^'"]+['"]/.test(fs.readFileSync(p, 'utf8'));
});
const versions = new Set(gmDefs.map(function (p) {
  return fs.readFileSync(p, 'utf8').match(/GOAL_MATRIX_VERSION\s*=\s*['"]([^'"]+)['"]/)[1];
}));
if (versions.size !== 1) bad('GOAL_MATRIX_VERSION 出现多个值：' + Array.from(versions).join(', '));
else ok('GOAL_MATRIX_VERSION 单值 ' + Array.from(versions)[0] + '，定义点 ' + gmDefs.length + ' 处（源 + 4 份同步副本）');

console.log('\n---------------------------------------');
console.log(errors === 0 ? '全部一致' : errors + ' 处不一致');
process.exit(errors === 0 ? 0 : 1);
