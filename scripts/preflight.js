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
['saveLog', 'getFeed'].forEach(function (fn) {
  const local = path.join(MP, 'utils', 'rules.js');
  const remote = path.join(CF, fn, 'lib', 'rules.js');
  if (!exists(remote)) { err(fn + '/lib/rules.js 不存在，先跑 bash scripts/sync-shared.sh'); return; }
  const a = read(local).replace(/require\('\.\.\/data\/knowledge\.js'\)/, "require('./knowledge.js')");
  const b = read(remote);
  if (a !== b) err(fn + '/lib/rules.js 与 miniprogram/utils/rules.js 不一致，跑 bash scripts/sync-shared.sh');
  const kbA = read(path.join(MP, 'data', 'knowledge.js'));
  const kbB = exists(path.join(CF, fn, 'lib', 'knowledge.js')) ? read(path.join(CF, fn, 'lib', 'knowledge.js')) : '';
  if (kbA !== kbB) err(fn + '/lib/knowledge.js 未同步');
});

// ---------- 9. 配置占位符 ----------
console.log('\n9) 配置');
const cfg = read(path.join(MP, 'config.js'));
if (/YOUR-CLOUD-ENV-ID/.test(cfg)) warn('config.js 的 env 还是占位符，编译后只能进离线模式');
const pc = JSON.parse(read(path.join(ROOT, 'project.config.json')));
if (pc.appid === 'touristappid') warn('project.config.json 的 appid 还是 touristappid，云开发不可用（只能本地预览）');

console.log('\n---------------------------------------');
console.log(errors === 0 ? '没有阻塞性问题' : errors + ' 个阻塞问题') ;
console.log(warns + ' 个提醒');
process.exit(errors ? 1 : 0);
