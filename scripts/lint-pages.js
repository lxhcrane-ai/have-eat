// 粗粒度一致性检查：WXML 里引用的顶层 data 字段，是否在页面 JS 的 data/setData 里出现过。
const fs = require('fs');
const path = require('path');

const PAGES = path.join(__dirname, '../miniprogram/pages');
const LOOP_VARS = new Set(['item', 'index', 'it', 'j', 'i', 'r', 'd', 't', 'idx']);
const IGNORE = new Set(['true', 'false', 'null', 'undefined', 'Math', 'JSON']);

function walk(dir) {
  let out = [];
  fs.readdirSync(dir).forEach(function (f) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (f.endsWith('.wxml')) out.push(p);
  });
  return out;
}

// 用括号计数取出 data:{...} 整块，避免嵌套对象导致截断
function extractData(js) {
  const at = js.search(/data:\s*\{/);
  if (at < 0) return '';
  const start = js.indexOf('{', at);
  let depth = 0;
  for (let i = start; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') { depth--; if (depth === 0) return js.slice(start, i + 1); }
  }
  return '';
}

let problems = 0;
walk(PAGES).forEach(function (wxmlPath) {
  const jsPath = wxmlPath.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) return;
  const js = fs.readFileSync(jsPath, 'utf8');
  const wxml = fs.readFileSync(wxmlPath, 'utf8');

  const keys = new Set();
  const block = extractData(js);
  // data 块里可能一行多个字段，收集所有 `key:` 形式（多收嵌套 key 无副作用）
  block.replace(/([A-Za-z_$][\w$]*)\s*:/g, function (m, k) { keys.add(k); return m; });
  // setData 里的 'a.b' / 'a' 路径
  js.replace(/'([A-Za-z_$][\w$]*)(\.[^']*)?'/g, function (m, root) { keys.add(root); return m; });
  js.replace(/o\['([A-Za-z_$][\w$]*)/g, function (m, root) { keys.add(root); return m; });

  const used = new Set();
  wxml.replace(/\{\{([\s\S]*?)\}\}/g, function (m, expr) {
    expr.replace(/(^|[^.\w$'"])([A-Za-z_$][\w$]*)/g, function (mm, pre, id) {
      if (!LOOP_VARS.has(id) && !IGNORE.has(id)) used.add(id);
      return mm;
    });
    return m;
  });

  const missing = [];
  used.forEach(function (u) {
    if (keys.has(u)) return;
    if (/^[0-9a-f]{6}$/i.test(u)) return;   // 颜色值
    if (/^(kg|kcal|g|ml|h|rpx)$/.test(u)) return;
    missing.push(u);
  });
  if (missing.length) {
    problems += missing.length;
    console.log(path.relative(PAGES, wxmlPath) + '  ->  ' + missing.join(', '));
  }
});

console.log(problems === 0 ? '\n一致：未发现未定义字段' : '\n疑似未定义字段 ' + problems + ' 个');
