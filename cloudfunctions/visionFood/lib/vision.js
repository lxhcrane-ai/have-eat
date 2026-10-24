// 食物照片识别：提示词 + 结果解析 + 结构校验（纯逻辑，小程序端与云函数端共用）。
// 原则：
//   1) 模型只给"候选条目"，不直接写库；用户必须确认/改克数后随 saveLog 提交。
//   2) 解析失败就明确失败（ok:false），绝不编造条目。
//   3) 数值要过 4/4/9 自洽校验；不自洽时以宏量重算热量并标注 warning。
//   4) 误差必须写清楚：照片估算通常 ±20–30%，有参照物更准。

const MAX_ITEMS = 12;
const MAX_ITEM_KCAL = 2500;
const MAX_MEAL_KCAL = 5000;
const MAX_NAME_LEN = 30;
const KCAL_MISMATCH_TOLERANCE = 0.35;   // 4P+4C+9F 与标注热量允许的偏差

const DISCLAIMER = '照片估算误差通常 ±20–30%，放个参照物（手、勺子、身份证）能明显提高准确度；确认前请按实际份量改克数。';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : null;
}

function round1(v) { return Math.round(v * 10) / 10; }

// 从模型输出里抠出 JSON（容忍 ```json 包裹、前后说明文字、单条对象）
function extractJson(text) {
  // 允许直接传已解析的对象（云函数里可能先 JSON.parse 过）
  if (text && typeof text === 'object') return text;
  if (!text || typeof text !== 'string') return null;
  var s = text.trim();
  // 去掉 markdown 代码块
  var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 直接解析
  try { return JSON.parse(s); } catch (e) {}
  // 截取第一个 { 到最后一个 }
  var a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {}
  }
  // 数组形式
  var c = s.indexOf('['), d = s.lastIndexOf(']');
  if (c >= 0 && d > c) {
    try { return { items: JSON.parse(s.slice(c, d + 1)) }; } catch (e) {}
  }
  return null;
}

// 字段别名归一（不同模型/供应商命名不一致）
function pick(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] !== undefined && obj[keys[i]] !== null && obj[keys[i]] !== '') return obj[keys[i]];
  }
  return null;
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var name = pick(raw, ['name', 'food', '食物', '名称', 'item']);
  if (name === null) return null;
  name = String(name).trim().slice(0, MAX_NAME_LEN);
  if (!name) return null;

  var grams = num(pick(raw, ['grams', 'gram', 'weight_g', 'weight', '克数', '重量', 'g']));
  if (grams !== null && (grams <= 0 || grams > 1500)) grams = grams > 1500 ? 1500 : null;

  var kcal = num(pick(raw, ['kcal', 'calories', 'calorie', 'energy', '热量', '千卡']));
  var protein = num(pick(raw, ['protein', 'protein_g', 'p', '蛋白质']));
  var carbs = num(pick(raw, ['carbs', 'carbohydrate', 'carbs_g', 'c', '碳水', '碳水化合物']));
  var fat = num(pick(raw, ['fat', 'fat_g', 'f', '脂肪']));
  var confidence = num(pick(raw, ['confidence', 'conf', '置信度']));

  if (kcal !== null && kcal < 0) kcal = null;
  if (protein !== null && protein < 0) protein = 0;
  if (carbs !== null && carbs < 0) carbs = 0;
  if (fat !== null && fat < 0) fat = 0;

  // 只有宏量没有热量：按 4/4/9 反算
  if (kcal === null && (protein !== null || carbs !== null || fat !== null)) {
    kcal = (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
  }
  if (kcal === null) return null;

  kcal = Math.round(kcal);
  protein = protein === null ? 0 : round1(protein);
  carbs = carbs === null ? 0 : round1(carbs);
  fat = fat === null ? 0 : round1(fat);

  var warnings = [];
  // 4/4/9 自洽校验：宏量齐全且偏差过大 → 以宏量重算
  if ((protein || carbs || fat) && kcal > 0) {
    var calc = protein * 4 + carbs * 4 + fat * 9;
    var diff = Math.abs(calc - kcal) / kcal;
    if (diff > KCAL_MISMATCH_TOLERANCE && calc > 20) {
      warnings.push(name + '：标注热量 ' + kcal + ' kcal 与宏量反算 ' + Math.round(calc) + ' kcal 偏差过大，已按宏量重算');
      kcal = Math.round(calc);
    }
  }
  if (kcal > MAX_ITEM_KCAL) {
    warnings.push(name + '：单条热量 ' + kcal + ' kcal 超过上限，可能是整盘/多人份，已按 ' + MAX_ITEM_KCAL + ' 截断');
    kcal = MAX_ITEM_KCAL;
  }

  return {
    name: name,
    grams: grams === null ? null : round1(grams),
    kcal: kcal,
    protein: protein,
    carbs: carbs,
    fat: fat,
    confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence)),
    source: 'vision',
    warnings: warnings
  };
}

// 主入口：把模型的原始文本变成可用的候选条目
function normalizeVisionResult(rawText, opts) {
  opts = opts || {};
  var parsed = extractJson(rawText);
  if (!parsed) {
    return { ok: false, reason: 'unparsable', error: '模型没有返回可解析的 JSON', items: [], warnings: [], disclaimer: DISCLAIMER };
  }

  var list = Array.isArray(parsed) ? parsed : (parsed.items || parsed.foods || parsed.result || parsed.food_items);
  if (!Array.isArray(list)) {
    // 单条对象
    if (parsed.name || parsed.food) list = [parsed];
    else return { ok: false, reason: 'no_items', error: '返回结构里没有 foods/items 数组', items: [], warnings: [], disclaimer: DISCLAIMER };
  }

  var warnings = [];
  var items = [];
  list.forEach(function (r) {
    var it = normalizeItem(r);
    if (it) {
      it.warnings.forEach(function (w) { warnings.push(w); });
      delete it.warnings;
      items.push(it);
    }
  });

  if (items.length > MAX_ITEMS) {
    warnings.push('识别出 ' + items.length + ' 项，只保留热量最高的 ' + MAX_ITEMS + ' 项');
    items.sort(function (a, b) { return b.kcal - a.kcal; });
    items = items.slice(0, MAX_ITEMS);
  }
  items.sort(function (a, b) { return b.kcal - a.kcal; });

  var total = items.reduce(function (s, i) { return s + i.kcal; }, 0);
  if (total > MAX_MEAL_KCAL) {
    warnings.push('合计 ' + total + ' kcal 明显偏高（单餐上限按 ' + MAX_MEAL_KCAL + ' 计），请核对是否多人份');
  }

  var note = parsed.note || parsed.comment || parsed.说明 || '';
  if (typeof note === 'string' && note.length > 120) note = note.slice(0, 120);

  if (!items.length) {
    return {
      ok: false, reason: 'no_items',
      error: '照片里没识别出可用的食物条目',
      items: [], warnings: warnings, note: note, disclaimer: DISCLAIMER
    };
  }

  return {
    ok: true,
    items: items,
    warnings: warnings,
    note: note,
    totalKcal: total,
    disclaimer: DISCLAIMER
  };
}

// 转成 meal.items 的结构（与食物库条目同构，规则引擎无需改动）
function toMealItem(v) {
  return {
    name: v.name,
    grams: v.grams,
    kcal: Math.round(v.kcal || 0),
    protein: round1(v.protein || 0),
    carbs: round1(v.carbs || 0),
    fat: round1(v.fat || 0),
    source: 'vision',
    confidence: v.confidence === null || v.confidence === undefined ? null : v.confidence
  };
}

// 提示词：要求严格 JSON、禁止编造、要求给参照物判断
function buildMessages(imageDataUrl, hint) {
  var system = [
    '你是运动营养师的照片记录助手，只做一件事：把餐食照片拆成食物条目并估算份量与营养。',
    '只输出 JSON，不要解释、不要 markdown。',
    'JSON 结构：{"foods":[{"name":"食物名","grams":克数,"kcal":热量,"protein":克,"carbs":克,"fat":克,"confidence":0到1}],"note":"补充说明"}',
    '规则：',
    '1. 只写照片里真实看得见的食物，看不清或不确定就不要写，绝不编造。',
    '2. 中式菜名写到可辨识程度（如"番茄炒蛋"），复合菜按主要成分拆 1–3 条。',
    '3. 份量按常见餐具/手掌做参照估算；有参照物（硬币、勺子、身份证）时优先用它校准。',
    '4. 热量与蛋白/碳水/脂肪必须满足 4/4/9 关系（蛋白4、碳水4、脂肪9 kcal/g）。',
    '5. 不确定就给低 confidence，并写进 note。',
    '6. 照片里没有食物或不是食物，返回 {"foods":[],"note":"原因"}。'
  ].join('\n');

  var userText = '识别这张餐食照片，给出食物条目与营养估算。' + (hint ? ('补充信息：' + String(hint).slice(0, 100)) : '');

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ]
    }
  ];
}

module.exports = {
  normalizeVisionResult: normalizeVisionResult,
  normalizeItem: normalizeItem,
  toMealItem: toMealItem,
  buildMessages: buildMessages,
  extractJson: extractJson,
  DISCLAIMER: DISCLAIMER,
  MAX_ITEMS: MAX_ITEMS,
  MAX_MEAL_KCAL: MAX_MEAL_KCAL
};
