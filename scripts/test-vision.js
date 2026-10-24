// 照片识别解析层测试：模型输出千奇百怪，这里保证"要么给出可信条目，要么明确失败"。
// 用法：node scripts/test-vision.js
const path = require('path');
const vision = require(path.join(__dirname, '../miniprogram/utils/vision.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 0.6 : tol); }

console.log('\n1) 标准返回');
const std = JSON.stringify({
  foods: [
    { name: '米饭', grams: 200, kcal: 232, protein: 5.2, carbs: 51.8, fat: 0.6, confidence: 0.8 },
    { name: '鸡胸肉', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, confidence: 0.9 }
  ],
  note: '有手掌参照，份量较可靠'
});
const r1 = vision.normalizeVisionResult(std);
ok(r1.ok === true, '解析成功');
ok(r1.items.length === 2, '两项条目', r1.items.length);
ok(r1.items[0].kcal >= r1.items[1].kcal, '按热量从高到低排序');
ok(r1.totalKcal === 480, '合计热量 480', r1.totalKcal);
ok(r1.note.indexOf('参照') >= 0, '保留模型说明');
ok(r1.warnings.length === 0, '标准数据没有 warning', r1.warnings);
ok(r1.disclaimer.indexOf('±20–30%') >= 0, '带误差声明');

console.log('\n2) markdown 包裹与前后废话');
const messy = '好的，我识别到这些食物：\n```json\n{"foods":[{"name":"番茄炒蛋","grams":250,"kcal":280,"protein":14,"carbs":12,"fat":19}]}\n```\n希望对你有帮助。';
const r2 = vision.normalizeVisionResult(messy);
ok(r2.ok === true && r2.items.length === 1, '能从 ```json 代码块里取出 JSON', r2.items);
ok(r2.items[0].name === '番茄炒蛋', '中文菜名保留');

console.log('\n3) 字段别名与字符串数值');
const alias = {
  foods: [
    { food: '牛奶', weight_g: '250', calories: '163', protein_g: '8.3', carbohydrate: '12.3', fat_g: '9', conf: 85 }
  ]
};
const r3 = vision.normalizeVisionResult(alias);
ok(r3.ok && r3.items[0].grams === 250, 'weight_g → grams，字符串转数字', r3.items[0]);
ok(r3.items[0].protein === 8.3 && r3.items[0].fat === 9, 'protein_g / fat_g 别名生效');
ok(r3.items[0].confidence === 0.85, '置信度 85 → 0.85', r3.items[0].confidence);

console.log('\n4) 只有宏量没有热量 → 4/4/9 反算');
const macroOnly = { foods: [{ name: '鸡蛋白', grams: 100, protein: 11, carbs: 0, fat: 0 }] };
const r4 = vision.normalizeVisionResult(macroOnly);
ok(r4.ok && r4.items[0].kcal === 44, '11g 蛋白 → 44 kcal', r4.items[0].kcal);

console.log('\n5) 热量与宏量不自洽 → 以宏量重算并告警');
const mismatch = { foods: [{ name: '牛肉面', grams: 500, kcal: 900, protein: 30, carbs: 60, fat: 20 }] };
// 30*4 + 60*4 + 20*9 = 540；900 偏差 40% > 35% → 重算
const r5 = vision.normalizeVisionResult(mismatch);
ok(r5.ok && r5.items[0].kcal === 540, '重算为 540 kcal', r5.items[0].kcal);
ok(r5.warnings.length >= 1 && r5.warnings[0].indexOf('偏差过大') >= 0, '给出偏差 warning', r5.warnings);

console.log('\n6) 异常值清洗');
const dirty = {
  foods: [
    { name: '  ', kcal: 100 },
    { name: '炸鸡', grams: -50, kcal: 600, protein: -3, carbs: 20, fat: 40 },
    { name: '超大份火锅', grams: 5000, kcal: 3200, protein: 120, carbs: 200, fat: 180 },
    { kcal: 200 }
  ]
};
const r6 = vision.normalizeVisionResult(dirty);
ok(r6.ok === true, '仍能产出结果');
ok(r6.items.length === 2, '无名字的条目被丢弃', r6.items.map(function (i) { return i.name; }));
ok(r6.items[0].kcal === 2500, '单条热量截断到 2500', r6.items[0].kcal);
ok(r6.items.every(function (i) { return i.protein >= 0 && i.fat >= 0; }), '负数宏量归零');
ok(r6.items.filter(function (i) { return i.name === '炸鸡'; })[0].grams === null, '超大克数置空');

console.log('\n7) 条目过多');
const many = { foods: [] };
for (let i = 0; i < 16; i++) many.foods.push({ name: '食物' + i, grams: 100, kcal: 100 + i * 10, protein: 5, carbs: 10, fat: 3 });
const r7 = vision.normalizeVisionResult(many);
ok(r7.items.length === vision.MAX_ITEMS, '截断到 ' + vision.MAX_ITEMS + ' 项', r7.items.length);
ok(r7.warnings.some(function (w) { return w.indexOf('只保留') >= 0; }), '给出截断 warning');

console.log('\n8) 单条对象（没有 foods 数组）');
const single = { name: '苹果', grams: 200, kcal: 104, protein: 0.6, carbs: 27, fat: 0.4 };
const r8 = vision.normalizeVisionResult(single);
ok(r8.ok && r8.items.length === 1, '能接受单条对象', r8.items);

console.log('\n9) 失败路径：绝不编造');
const bad1 = vision.normalizeVisionResult('抱歉，我无法识别这张图片。');
ok(bad1.ok === false && bad1.reason === 'unparsable', '非 JSON → unparsable', bad1.reason);
ok(bad1.items.length === 0, '失败时不返回任何条目');
const bad2 = vision.normalizeVisionResult('{"foods":[]}');
ok(bad2.ok === false && bad2.reason === 'no_items', '空数组 → no_items', bad2.reason);
ok(bad2.error.indexOf('没识别出') >= 0, '给出可读错误');
const bad3 = vision.normalizeVisionResult('');
ok(bad3.ok === false, '空字符串 → 失败');
const bad4 = vision.normalizeVisionResult('{"note":"只有说明没有食物"}');
ok(bad4.ok === false, '只有 note → 失败', bad4.reason);

console.log('\n10) 单餐总热量异常提示');
const huge = { foods: [{ name: 'A', kcal: 2400, protein: 100, carbs: 200, fat: 120 }, { name: 'B', kcal: 2400, protein: 100, carbs: 200, fat: 120 }, { name: 'C', kcal: 2400, protein: 100, carbs: 200, fat: 120 }] };
const r10 = vision.normalizeVisionResult(huge);
ok(r10.ok === true, '单条 2400 各自保留');
ok(r10.totalKcal > vision.MAX_MEAL_KCAL, '合计超上限', r10.totalKcal);
ok(r10.warnings.some(function (w) { return w.indexOf('合计') >= 0; }), '提示可能多人份');

console.log('\n11) toMealItem：与食物库条目同构');
const mi = vision.toMealItem(r1.items.filter(function (i) { return i.name === '米饭'; })[0]);
ok(mi.name === '米饭' && mi.grams === 200, '名称与克数');
ok(mi.source === 'vision', 'source 标记为 vision');
ok(typeof mi.kcal === 'number' && typeof mi.protein === 'number', '数值为数字');
ok(mi.confidence === 0.8, '置信度带过去（便于周报统计）', mi.confidence);

console.log('\n12) 提示词：要求严格 JSON 且禁止编造');
const msgs = vision.buildMessages('data:image/jpeg;base64,AAAA', '这是午餐');
ok(msgs.length === 2 && msgs[0].role === 'system', 'system + user 两条消息');
ok(msgs[0].content.indexOf('只输出 JSON') >= 0, '要求只输出 JSON');
ok(msgs[0].content.indexOf('绝不编造') >= 0, '明确禁止编造');
ok(msgs[1].content[1].image_url.url.indexOf('data:image/jpeg;base64,') === 0, '图片以 data URL 传入');
ok(msgs[1].content[0].text.indexOf('这是午餐') >= 0, '用户补充信息进入提示词');

console.log('\n13) 与规则引擎的接缝');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));
const log = {
  date: '2026-10-25',
  weights: { morning: { kg: 58 } },
  meals: [{
    slot: 'lunch',
    items: [vision.toMealItem(r1.items[0]), vision.toMealItem(r1.items[1])],
    source: 'vision'
  }],
  goal: {}
};
const fb = rules.evaluate(log, { profile: { phase: 'cut', weightKg: 58, heightCm: 175, age: 24, sex: 'male' }, phase: 'cut' });
ok(fb.totals.kcal === 480, '规则引擎直接吃到 480 kcal（无需改引擎）', fb.totals.kcal);
ok(fb.totals.protein === 52, '蛋白汇总 52g', fb.totals.protein);
ok(fb.totals.structured === 1, 'vision 条目被算作结构化记录');

console.log('\n---------------------------------------');
console.log(fail === 0 ? '全部通过：' + pass + ' 项' : '失败 ' + fail + ' / 通过 ' + pass);
process.exit(fail === 0 ? 0 : 1);
