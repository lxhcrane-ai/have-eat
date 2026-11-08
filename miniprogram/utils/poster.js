// 周报长图：把 weekly.buildWeekly 的结果排成 750 逻辑像素宽的画布内容。
// 纯布局（buildPages）+ 纯绘制（renderPage），不碰 wx.*，方便页面注入真实的 measure。
// 所有数字都直接取自 buildWeekly / compareWeekly，与复制文本同源。

const PAGE_W = 750;
const PAGE_H = 1600;          // 约两屏；放不下就自动分页
const PAD = 44;
const CONTENT_W = PAGE_W - PAD * 2;
const HEADER_H = 206;
const FOOTER_H = 104;
const TOP = HEADER_H + 12;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 18;

const BG = '#0d0f0e';
const CARD = '#161a18';
const TEXT = '#e9eeec';
const MUTED = '#8a968f';
const ACCENT = '#e8ff47';
const RED = '#ff7a6b';
const AMBER = '#ffc46b';
const OK = '#5ce39a';

const TONE = { red: RED, amber: AMBER, ok: OK, good: OK, bad: RED };

function fontOf(size, bold) {
  return (bold ? 'bold ' : '') + size + 'px sans-serif';
}

function hasNum(v) { return typeof v === 'number' && isFinite(v); }

function num(v, digits) {
  if (!hasNum(v)) return '--';
  const k = Math.pow(10, digits === undefined ? 0 : digits);
  return Math.round(v * k) / k;
}

function signed(v, digits, unit) {
  if (!hasNum(v)) return '--';
  const n = num(v, digits);
  return (n > 0 ? '+' : '') + n + (unit || '');
}

// 按真实宽度换行：ASCII 单词/数字尽量整体保留，中文逐字断行；超长单词硬切。
const TOKEN_RE = /[A-Za-z0-9]+(?:[.,%/:+\-][A-Za-z0-9]+)*|\s+|[\s\S]/g;

function hardSplit(token, maxW, font, measure) {
  const out = [];
  let cur = '';
  for (let i = 0; i < token.length; i++) {
    const next = cur + token[i];
    if (cur && measure(next, font) > maxW) { out.push(cur); cur = token[i]; }
    else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function wrapText(text, maxW, size, bold, measure) {
  const font = fontOf(size, bold);
  const lines = [];
  String(text === null || text === undefined ? '' : text).split('\n').forEach(function (para) {
    const tokens = para.match(TOKEN_RE) || [];
    let line = '';
    tokens.forEach(function (tk) {
      if (/^\s+$/.test(tk)) {
        if (line && !/\s$/.test(line)) line += ' ';
        return;
      }
      const cand = line + tk;
      if (line && measure(cand, font) > maxW) {
        lines.push(line.replace(/\s+$/, ''));
        if (measure(tk, font) > maxW) {
          const parts = hardSplit(tk, maxW, font, measure);
          parts.forEach(function (p, i) {
            if (i < parts.length - 1) lines.push(p);
            else line = p;
          });
        } else {
          line = tk;
        }
      } else if (!line && measure(tk, font) > maxW) {
        const parts = hardSplit(tk, maxW, font, measure);
        parts.forEach(function (p, i) {
          if (i < parts.length - 1) lines.push(p);
          else line = p;
        });
      } else {
        line = cand;
      }
    });
    lines.push(line.replace(/\s+$/, ''));
  });
  return lines;
}

function truncate(text, maxW, size, bold, measure) {
  const s = String(text === null || text === undefined ? '' : text);
  const font = fontOf(size, bold);
  if (measure(s, font) <= maxW) return s;
  let cut = s;
  while (cut.length && measure(cut + '…', font) > maxW) cut = cut.slice(0, -1);
  return cut + '…';
}

function buildPages(input, measure) {
  input = input || {};
  const w = input.w;
  const cmp = input.cmp;
  if (!w) return [];

  const pages = [];
  let page = null;
  let y = 0;
  let buf = null;   // 当前小节：先攒够高度，避免标题落在页底、内容跨页被拆散

  function newPage() {
    page = { ops: [] };
    pages.push(page);
    y = TOP;
  }
  function ensure(h) {
    if (!page || y + h > CONTENT_BOTTOM) newPage();
  }
  function put(op, h) {
    ensure(h);
    op.y = y;
    page.ops.push(op);
    y += h;
  }
  function emit(op, h) {
    if (buf) { buf.items.push({ op: op, h: h }); return; }
    put(op, h);
  }
  function flush() {
    if (!buf) return;
    const items = buf.items;
    const total = 64 + 12 + items.reduce(function (s, it) { return s + it.h; }, 0);
    ensure(total);
    put({ type: 'section', x: PAD, title: buf.title, note: buf.note || '' }, 64);
    y += 6;
    items.forEach(function (it) { put(it.op, it.h); });
    y += 6;
    buf = null;
  }
  function section(title, note) {
    flush();
    buf = { title: title, note: note || '', items: [] };
  }

  function paragraph(text, opts) {
    opts = opts || {};
    const size = opts.size || 28;
    const bold = !!opts.bold;
    const lh = opts.lh || Math.round(size * 1.55);
    const maxW = (opts.maxW || CONTENT_W) - (opts.indent || 0);
    wrapText(text, maxW, size, bold, measure).forEach(function (ln) {
      emit({ type: 'text', x: PAD + (opts.indent || 0), text: ln, size: size, bold: bold, color: opts.color || TEXT }, lh);
    });
    if (opts.gap) emit({ type: 'gap' }, opts.gap);
  }
  function bullet(text) { paragraph('· ' + text, { indent: 8, gap: 2 }); }
  function numbered(n, text) { paragraph(n + '. ' + text, { indent: 8, gap: 2 }); }
  function note(text) { paragraph(text, { size: 22, color: MUTED, lh: 32, gap: 4 }); }
  function kv(label, value, tone) {
    emit({ type: 'kv', x: PAD, label: label, value: value, tone: tone || '' }, 50);
  }
  function grid(cells) {
    emit({ type: 'grid', x: PAD, w: CONTENT_W, cells: cells }, 2 * 142 + 14 + 18);
  }
  function spark(series) {
    emit({ type: 'spark', x: PAD, w: CONTENT_W, series: series }, 200 + 12);
  }
  function hit(h, max) {
    emit({
      type: 'hit', x: PAD, rid: h.ruleId, name: h.name, count: h.count,
      ratio: max ? Math.min(1, h.count / max) : 0, red: h.red
    }, 56);
  }
  function cmpRow(r) {
    emit({ type: 'cmp', x: PAD, label: r.label, curText: r.curText, prevText: r.prevText, deltaText: r.deltaText, tone: r.tone }, 66);
  }

  newPage();

  // ---------- 概览 ----------
  section('本周概览', input.weekLabel || '');
  const wk = w.weight;
  const deltaSub = wk.deltaKg !== null ? '周内 ' + signed(wk.deltaKg, 1, ' kg')
    : (wk.points ? '仅 ' + wk.points + ' 个晨重点' : '无晨重记录');
  grid([
    {
      label: '晨重', value: num(wk.lastKg, 1), unit: 'kg', sub: deltaSub, tone: ''
    },
    {
      label: '周速率', value: num(wk.weeklyRate, 1), unit: 'kg/周',
      sub: wk.weeklyPct !== null ? wk.weeklyPct + '% 体重' : '需 ≥4 个晨重点',
      tone: wk.weeklyPct !== null && wk.weeklyPct > 1 ? 'red' : ''
    },
    {
      label: '蛋白达标', value: w.protein.rate === null ? '--' : w.protein.rate, unit: '%',
      sub: w.protein.knownDays ? w.protein.okDays + '/' + w.protein.knownDays + ' 天 · 均 ' + w.protein.avgG + 'g' : '数据不足',
      tone: w.protein.rate === null ? '' : (w.protein.rate < 85 ? 'amber' : 'ok')
    },
    {
      label: '能量达标', value: w.energy.rate === null ? '--' : w.energy.rate, unit: '%',
      sub: w.energy.knownDays ? w.energy.okDays + '/' + w.energy.knownDays + ' 天 · 均 ' + w.energy.avgIntake + ' kcal' : '数据不足',
      tone: w.energy.rate === null ? '' : (w.energy.rate < 70 ? 'amber' : 'ok')
    }
  ]);
  kv('记录完整度', w.loggedDays + '/' + w.days + ' 天有记录 · ' + w.completeDays + ' 天必填完整');
  if (w.sleep.avg !== null) kv('睡眠', w.sleep.avg + 'h · 低于 ' + w.sleep.threshold + 'h 有 ' + w.sleep.shortDays + ' 天');
  else kv('睡眠', '无记录');
  kv('训练负荷', w.load.sessions ? w.load.total + ' sRPE / ' + w.load.sessions + ' 次课' : '无训练课记录');
  if (w.hydration.measuredDays) kv('水合', '训练脱水 ≥2% ' + w.hydration.over2Days + '/' + w.hydration.measuredDays + ' 天');
  else if (w.hydration.planAvg !== null) kv('补液计划', '平均执行率 ' + w.hydration.planAvg + '%');

  // ---------- 晨重 ----------
  section('晨重曲线');
  if (wk.series && wk.series.length >= 2) {
    spark(wk.series);
    paragraph('本周 ' + wk.points + ' 个晨重点：' + num(wk.firstKg, 1) + ' → ' + num(wk.lastKg, 1) + ' kg' +
      (wk.deltaKg === null ? '' : '（' + signed(wk.deltaKg, 1, 'kg') + '）'), { size: 24, gap: 4 });
  } else {
    paragraph('本周只有 ' + (wk.points || 0) + ' 个晨重点，画不出曲线（连线至少 2 个点，周速率至少 4 个点）。', { size: 24, color: MUTED });
  }

  // ---------- 结论 ----------
  section('这周发生了什么');
  (w.conclusions || []).forEach(bullet);
  if (w.completeDays < w.loggedDays) {
    note('其中 ' + (w.loggedDays - w.completeDays) + ' 天缺本阶段必填项，相关结论只能算「部分」。');
  }

  // ---------- 蛋白与能量 ----------
  section('蛋白与能量');
  kv('蛋白达标率', w.protein.rate === null ? '--（数据不足）'
    : w.protein.rate + '%（' + w.protein.okDays + '/' + w.protein.knownDays + ' 天，均 ' + w.protein.avgG + 'g）',
    w.protein.rate === null ? '' : (w.protein.rate < 85 ? 'amber' : 'ok'));
  kv('能量达标率', w.energy.rate === null ? '--（数据不足）'
    : w.energy.rate + '%（' + w.energy.okDays + '/' + w.energy.knownDays + ' 天，均摄入 ' + w.energy.avgIntake + ' kcal）',
    w.energy.rate === null ? '' : (w.energy.rate < 70 ? 'amber' : 'ok'));
  if (w.energy.avgBalance !== null) kv('平均能量平衡', signed(w.energy.avgBalance, 0, ' kcal/天'));

  // ---------- 规则命中 ----------
  section('规则命中', w.ruleHits.length ? '按红灯数排序，展示前 6 条' : '');
  if (w.ruleHits.length) {
    const max = Math.max.apply(null, w.ruleHits.map(function (h) { return h.count; }).concat([1]));
    w.ruleHits.slice(0, 6).forEach(function (h) { hit(h, max); });
    if (w.ruleHits.length > 6) note('另有 ' + (w.ruleHits.length - 6) + ' 条规则命中，完整列表见页面。');
  } else {
    paragraph('本周没有规则告警。', { size: 24, color: MUTED });
  }

  // ---------- 与上一周 ----------
  section('与上一周对比');
  if (cmp && cmp.prevAvailable) {
    note('上一周 ' + cmp.prevFromDate + ' ~ ' + cmp.prevEndDate + ' · ' + cmp.prevLoggedDays + ' 天有记录（同为滚动 7 天窗口）');
    (cmp.rows || []).forEach(cmpRow);
  } else {
    paragraph('上周无数据可对比（不按 0 计算）。', { size: 24, color: MUTED });
  }

  // ---------- 下周 ----------
  section('下周先做这几件');
  (w.nextWeek || []).slice(0, 6).forEach(function (t, i) { numbered(i + 1, t); });
  if ((w.nextWeek || []).length > 6) note('另有 ' + (w.nextWeek.length - 6) + ' 条建议见页面。');

  flush();
  return pages;
}

// ---------- 绘制 ----------

function rrect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function textRight(ctx, text, right, y, size, bold, color) {
  ctx.font = fontOf(size, bold);
  ctx.fillStyle = color;
  const tw = ctx.measureText(String(text)).width;
  ctx.fillText(String(text), right - tw, y);
}

function drawHeader(ctx, input, index) {
  const coach = input.view === 'coach';
  ctx.fillStyle = '#111413';
  ctx.fillRect(0, 0, PAGE_W, HEADER_H);

  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, 46, 6, 26);
  ctx.font = fontOf(20, false);
  ctx.fillStyle = MUTED;
  ctx.fillText('拳王备赛 · 周报', PAD + 18, 48);

  const rawTitle = coach ? ((input.athleteName || '该拳王') + ' 的备赛周报') : '我的备赛周报';
  ctx.font = fontOf(40, true);
  ctx.fillStyle = TEXT;
  const title = (function () {
    let s = rawTitle;
    while (s.length && ctx.measureText(s).width > CONTENT_W) s = s.slice(0, -1);
    return s === rawTitle ? s : s + '…';
  })();
  ctx.fillText(title, PAD, 82);

  ctx.font = fontOf(24, false);
  ctx.fillStyle = MUTED;
  const sub = input.fromDate + ' ~ ' + input.endDate + ' · ' + (input.weekLabel || '') +
    (input.phaseLabel ? ' · ' + input.phaseLabel : '');
  ctx.fillText(sub, PAD, 142);

  // 来源徽标：云端/本机 + 谁的数据
  const badge = input.sourceLabel || '';
  if (badge) {
    const isLocal = input.source === 'local';
    ctx.font = fontOf(20, false);
    const bw = ctx.measureText(badge).width + 28;
    rrect(ctx, PAD, 172, bw, 32, 16, isLocal ? '#2a2213' : '#13212b', isLocal ? '#4a3a1c' : '#1d3a4d');
    ctx.fillStyle = isLocal ? AMBER : '#6bc4ff';
    ctx.fillText(badge, PAD + 14, 178);
  }
  if (index > 0) textRight(ctx, '续页', PAGE_W - PAD, 178, 20, false, MUTED);
}

function drawFooter(ctx, input, index, total) {
  const baseY = PAGE_H - FOOTER_H;
  ctx.fillStyle = '#1f2523';
  ctx.fillRect(PAD, baseY, CONTENT_W, 1);

  const coach = input.view === 'coach';
  ctx.font = fontOf(24, true);
  ctx.fillStyle = ACCENT;
  ctx.fillText(coach ? '营养师端生成' : '拳王本人导出', PAD, baseY + 20);

  ctx.font = fontOf(20, false);
  ctx.fillStyle = MUTED;
  const line = (coach ? '数据：' : '数据：') + (input.sourceLabel || '') + ' · 生成于 ' + (input.generatedAt || '');
  ctx.fillText(line, PAD, baseY + 56);

  textRight(ctx, '第 ' + (index + 1) + ' / ' + total + ' 页', PAGE_W - PAD, baseY + 20, 20, false, MUTED);
}

function drawSection(ctx, op) {
  ctx.fillStyle = ACCENT;
  ctx.fillRect(op.x, op.y + 12, 7, 36);
  ctx.font = fontOf(34, true);
  ctx.fillStyle = TEXT;
  ctx.fillText(op.title, op.x + 22, op.y + 8);
  if (op.note) textRight(ctx, op.note, PAGE_W - PAD, op.y + 20, 21, false, MUTED);
}

function drawGrid(ctx, op) {
  const gap = 14;
  const cw = (op.w - gap) / 2;
  const ch = 142;
  (op.cells || []).forEach(function (c, i) {
    const cx = op.x + (i % 2) * (cw + gap);
    const cy = op.y + Math.floor(i / 2) * (ch + gap);
    rrect(ctx, cx, cy, cw, ch, 16, CARD, '#242b28');

    ctx.font = fontOf(24, false);
    ctx.fillStyle = MUTED;
    ctx.fillText(c.label, cx + 22, cy + 18);

    ctx.font = fontOf(42, true);
    ctx.fillStyle = TONE[c.tone] || TEXT;
    ctx.fillText(String(c.value), cx + 22, cy + 46);

    if (c.unit) {
      const vw = (function () { ctx.font = fontOf(42, true); return ctx.measureText(String(c.value)).width; })();
      ctx.font = fontOf(21, false);
      ctx.fillStyle = MUTED;
      ctx.fillText(c.unit, cx + 22 + vw + 6, cy + 66);
    }

    ctx.font = fontOf(20, false);
    ctx.fillStyle = MUTED;
    const sub = truncate(c.sub || '', cw - 44, 20, false, function (t, f) {
      ctx.font = f; return ctx.measureText(t).width;
    });
    ctx.fillText(sub, cx + 22, cy + 104);
  });
}

function drawSpark(ctx, op) {
  rrect(ctx, op.x, op.y, op.w, 200, 16, CARD, '#242b28');
  const s = op.series || [];
  const min = Math.min.apply(null, s.map(function (p) { return p.kg; }));
  const max = Math.max.apply(null, s.map(function (p) { return p.kg; }));
  const span = (max - min) || 0.5;

  ctx.font = fontOf(20, false);
  ctx.fillStyle = MUTED;
  ctx.fillText(s.length + ' 个晨重点 · 波动 ' + num(max - min, 1) + 'kg', op.x + 22, op.y + 18);
  textRight(ctx, num(min, 1) + '–' + num(max, 1) + ' kg', op.x + op.w - 22, op.y + 18, 20, false, MUTED);

  const px0 = op.x + 44;
  const px1 = op.x + op.w - 44;
  const py0 = op.y + 58;
  const py1 = op.y + 154;

  ctx.strokeStyle = '#1f2523';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px0, py0);
  ctx.lineTo(px1, py0);
  ctx.moveTo(px0, py1);
  ctx.lineTo(px1, py1);
  ctx.stroke();

  const pts = s.map(function (p, i) {
    return {
      x: s.length === 1 ? px0 : px0 + (i / (s.length - 1)) * (px1 - px0),
      y: py1 - ((p.kg - min) / span) * (py1 - py0)
    };
  });

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke();

  pts.forEach(function (p, i) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === pts.length - 1 ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
  });

  ctx.font = fontOf(18, false);
  ctx.fillStyle = MUTED;
  ctx.fillText(s[0].date.slice(5), px0, op.y + 168);
  textRight(ctx, s[s.length - 1].date.slice(5), px1, op.y + 168, 18, false, MUTED);
}

function drawHit(ctx, op) {
  const x = op.x;
  const y = op.y;

  ctx.font = fontOf(20, false);
  const bw = ctx.measureText(op.rid).width + 20;
  rrect(ctx, x, y + 2, bw, 32, 6, '#1a201d');
  ctx.fillStyle = '#9aa8a1';
  ctx.fillText(op.rid, x + 10, y + 9);

  const nameW = CONTENT_W - bw - 120;
  ctx.font = fontOf(26, false);
  ctx.fillStyle = '#b9c4be';
  const name = truncate(op.name, nameW, 26, false, function (t, f) {
    ctx.font = f; return ctx.measureText(t).width;
  });
  ctx.fillText(name, x + bw + 14, y + 6);

  textRight(ctx, op.count + ' 天', PAGE_W - PAD, y + 6, 26, false, TEXT);

  rrect(ctx, x, y + 42, CONTENT_W, 6, 3, '#1f2523');
  if (op.ratio > 0) {
    rrect(ctx, x, y + 42, Math.max(6, CONTENT_W * op.ratio), 6, 3, op.red ? RED : AMBER);
  }
}

function drawCmp(ctx, op) {
  const y = op.y;
  ctx.font = fontOf(26, false);
  ctx.fillStyle = TEXT;
  ctx.fillText(op.label, op.x, y + 4);

  ctx.font = fontOf(26, true);
  ctx.fillStyle = TONE[op.tone] || MUTED;
  ctx.fillText(op.deltaText, op.x + 250, y + 4);

  ctx.font = fontOf(22, false);
  ctx.fillStyle = MUTED;
  ctx.fillText('本周 ' + op.curText + ' · 上周 ' + op.prevText, op.x, y + 38);
}

function drawKv(ctx, op) {
  ctx.font = fontOf(26, false);
  ctx.fillStyle = MUTED;
  ctx.fillText(op.label, op.x, op.y + 8);

  ctx.font = fontOf(32, true);
  ctx.fillStyle = TONE[op.tone] || TEXT;
  textRight(ctx, op.value, PAGE_W - PAD, op.y + 4, 32, true, TONE[op.tone] || TEXT);
}

function drawOp(ctx, op) {
  if (op.type === 'section') drawSection(ctx, op);
  else if (op.type === 'text') {
    ctx.font = fontOf(op.size, op.bold);
    ctx.fillStyle = op.color;
    ctx.fillText(op.text, op.x, op.y + 3);
  }
  else if (op.type === 'grid') drawGrid(ctx, op);
  else if (op.type === 'spark') drawSpark(ctx, op);
  else if (op.type === 'hit') drawHit(ctx, op);
  else if (op.type === 'cmp') drawCmp(ctx, op);
  else if (op.type === 'kv') drawKv(ctx, op);
}

function renderPage(ctx, page, input, index, total) {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  drawHeader(ctx, input, index);
  (page.ops || []).forEach(function (op) { drawOp(ctx, op); });
  drawFooter(ctx, input, index, total);
  ctx.restore();
}

module.exports = {
  PAGE_W: PAGE_W,
  PAGE_H: PAGE_H,
  fontOf: fontOf,
  buildPages: buildPages,
  renderPage: renderPage
};
