// 运动营养知识库（供规则引擎引用 + 小程序内浏览）
// 每条都带 source，反馈里的建议必须能溯源到条目，不凭空生成。
// 数值区间来自下列公开共识声明，具体个体仍需教练/营养师调整。

const CATEGORIES = [
  { id: 'weightcut', name: '赛前减重', desc: '分级、控重节奏、称重后恢复' },
  { id: 'protein', name: '蛋白质', desc: '总量、分配、质量' },
  { id: 'carb', name: '碳水与能量', desc: '训练日碳水、能量可用性' },
  { id: 'hydration', name: '水合与电解质', desc: '脱水判定、补液量、钠' },
  { id: 'recovery', name: '恢复与睡眠', desc: '睡眠时长、酸痛、负荷管理' },
  { id: 'fightday', name: '赛前与比赛日', desc: '赛前餐、称重后 24h、上场前' },
  { id: 'supplement', name: '补剂', desc: '有证据的少数几种' },
  { id: 'basic', name: '基础营养', desc: '食物选择、餐次结构' }
];

const ITEMS = [
  // ---------- 赛前减重 ----------
  {
    id: 'wc-rate', cat: 'weightcut', title: '安全减重速率：每周 0.5–1% 体重',
    body: '备赛期减重应控制在每周 0.5–1% 体重（58kg 拳手约 0.3–0.6kg/周）。超过这个速度，减掉的相当比例是肌肉和水分，出拳力量与耐力会同步下降。距称重不足 2 周时不要再启动新的减重计划，只做水盐与胃肠内容物的微调。',
    source: 'ACSM Position Stand: Weight Loss in Wrestlers; IOC consensus on sports nutrition (Maughan et al., 2018)',
    tags: ['weightRate', 'cut']
  },
  {
    id: 'wc-phases', cat: 'weightcut', title: '备赛四个阶段，策略完全不同',
    body: '维持期（非赛季）：体重稳定在参赛级别 +3–5%，正常吃。减脂期（赛前 8–12 周）：每周 0.5–1%，蛋白提到 2.0–2.4 g/kg 保肌。微调期（赛前 1–2 周）：只动水、钠、纤维和胃肠内容物，不再动热量缺口。恢复期（称重后 12–24h）：补液补糖，把体重拉回 3–5%。把阶段写进 App，规则才知道该给你哪套建议。',
    source: 'IOC consensus statement on sports nutrition (2018); ACSM/AND/DC joint position stand (2016)',
    tags: ['phase']
  },
  {
    id: 'wc-dehydration-risk', cat: 'weightcut', title: '赛前脱水减重（sauna/限制饮水）的代价',
    body: '通过出汗或限水在 24h 内掉 2–4% 体重，会带来血浆容量下降、心率升高、出拳速度下降和抗打击能力下降。研究一致显示：脱水 2% 以上就开始损失无氧表现。如果必须用，限在 2–3% 以内，并保证称重后有 12h 以上恢复窗口，同时有人在旁边盯着。',
    source: 'ACSM Position Stand: Exercise and Fluid Replacement (2007); IOC RED-S consensus (2018)',
    tags: ['dehydration', 'cut']
  },
  {
    id: 'wc-refeed', cat: 'weightcut', title: '减脂期不要一路减到底：安排 refeed',
    body: '连续 8 周以上热量缺口会让瘦素、甲状腺激素和训练表现一起下滑。每 2–3 周安排 1–2 天回到维持热量（碳水为主），体重会短期回升 0.5–1kg，那是糖原和水，不是脂肪。日记里看到体重反弹先别慌，看 7 日移动平均。',
    source: 'ISSN Position Stand: Diets and Body Composition (Aragon et al., 2017)',
    tags: ['refeed', 'weightRate']
  },
  {
    id: 'wc-weighin-recovery', cat: 'weightcut', title: '称重后 12–24 小时怎么把身体拉回来',
    body: '称重后按每流失 1kg 体重补 1.25–1.5L 含钠液体，分次喝，别一次灌。碳水按 1.0–1.2 g/kg/h 补前 4 小时（58kg 约 58–70g/h），优先低纤维、易消化的米面、香蕉、运动饮料。蛋白同步补 20–40g。目标是称重后 12h 内恢复体重 3–5%，胃不胀。',
    source: 'ACSM/AND/DC joint position stand (2016); IOC consensus (2018)',
    tags: ['weighin', 'recovery']
  },

  // ---------- 蛋白质 ----------
  {
    id: 'pro-total', cat: 'protein', title: '总量：1.6–2.2 g/kg/天',
    body: '力量与格斗类项目建议每天 1.6–2.2 g/kg（58kg 约 93–128g）。减脂期热量不足时提到 2.3–3.1 g/kg 去脂体重，用来对抗肌肉流失。超过 2.2 g/kg 对增肌没有额外好处，但在减脂期有意义。',
    source: 'ISSN Position Stand: Protein and Exercise (Jäger et al., 2017); Helms et al. (2014)',
    tags: ['protein']
  },
  {
    id: 'pro-spread', cat: 'protein', title: '分配：每餐 0.3–0.4 g/kg，3–5 餐',
    body: '把总量摊到 3–5 餐，每餐 0.3–0.4 g/kg（58kg 约 17–23g，实战建议 25–35g）。一次吃 60g 蛋白并不会浪费，但分次对合成刺激更均匀。睡前一餐 30–40g 缓释蛋白（牛奶、酸奶、酪蛋白）对夜间修复有用。',
    source: 'ISSN Position Stand: Nutrient Timing (Kerksick et al., 2017)',
    tags: ['protein', 'timing']
  },
  {
    id: 'pro-quality', cat: 'protein', title: '来源：优先乳清、蛋、鱼虾、瘦肉',
    body: '动物蛋白氨基酸评分高，含足量亮氨酸（每餐 2.5–3g 亮氨酸是合成阈值，约等于 25g 乳清或 100g 鸡胸）。植物蛋白可以吃，但总量要再加 10–20%，或做谷物+豆类搭配。减重期红肉选瘦的，脂肪留给必须脂肪酸。',
    source: 'ISSN Position Stand: Protein and Exercise (2017)',
    tags: ['protein', 'food']
  },
  {
    id: 'pro-timing', cat: 'protein', title: '训练后 2 小时内补 25–40g 蛋白',
    body: '所谓"30 分钟窗口"被夸大了，真正重要的是全天总量。但训练后 2h 内吃 25–40g 蛋白 + 碳水，对一天只吃 3 餐的人确实有用。实战课/对练后优先液体（牛奶、蛋白粉+香蕉），因为这时候嚼不动。',
    source: 'ISSN Position Stand: Nutrient Timing (2017)',
    tags: ['protein', 'timing']
  },

  // ---------- 碳水与能量 ----------
  {
    id: 'carb-training', cat: 'carb', title: '训练日碳水：3–7 g/kg，看负荷',
    body: '格斗项目训练日建议 4–7 g/kg（58kg 约 230–400g），技术课日取下限，一天两练或实战日取上限。碳水低于 3 g/kg 连续多日，会出现"低能量可用性"，表现为反应变慢、情绪低落、易受伤。',
    source: 'ACSM/AND/DC joint position stand (2016); IOC consensus (2018)',
    tags: ['carb']
  },
  {
    id: 'carb-timing', cat: 'carb', title: '训练前 1–3h 吃 1–2 g/kg 碳水',
    body: '训练前 1–3 小时吃 1–2 g/kg 易消化碳水（58kg 约 60–115g），比如米饭+鸡蛋、面包+香蕉。训练前 30 分钟内避免大量纤维和脂肪。空腹晨练对减脂没有额外好处，反而让技术课质量下降。',
    source: 'ACSM/AND/DC joint position stand (2016)',
    tags: ['carb', 'timing']
  },
  {
    id: 'carb-recovery', cat: 'carb', title: '两练之间：1.0–1.2 g/kg/h 补糖',
    body: '如果一天两练或训练超过 90 分钟，训练后 4 小时内按 1.0–1.2 g/kg/h 补碳水（58kg 约 60–70g/h），能明显加快糖原恢复。加 20–30g 蛋白一起补效果更好。只练一次、间隔 24h 的话，吃够全天总量就够。',
    source: 'ISSN Position Stand: Nutrient Timing (2017)',
    tags: ['carb', 'recovery']
  },
  {
    id: 'carb-energy-availability', cat: 'carb', title: '能量可用性低于 30 kcal/kg 去脂体重/天 = 红灯',
    body: '长期低能量可用性（LEA）会损伤激素轴、骨密度、免疫和恢复能力，女性常见月经紊乱，男性常见睾酮下降和性欲减退。粗算：58kg、体脂 12% 的拳手去脂体重约 51kg，安全下限约 1530 kcal 的可利用能量（总摄入减运动消耗）。减重期不要把摄入压到这个线以下太久。',
    source: 'IOC RED-S consensus statement (Mountjoy et al., 2018)',
    tags: ['energy', 'red']
  },
  {
    id: 'carb-fightweek', cat: 'fightday', title: '赛前 24–48h：碳水提到 8–10 g/kg',
    body: '格斗项目不需要传统 3 天碳水负荷，但称重后到比赛前的 24h 内把碳水提到 8–10 g/kg（58kg 约 460–580g）能补满糖原。选低纤维、低脂、体积小的碳水，避免赛前腹胀。',
    source: 'ACSM/AND/DC joint position stand (2016)',
    tags: ['fightday', 'carb']
  },
  {
    id: 'fightday-meal', cat: 'fightday', title: '赛前 3–4h 正餐，赛前 60–90min 加餐',
    body: '赛前 3–4 小时吃熟悉的正餐：碳水 1–2 g/kg + 蛋白 25–40g + 低脂低纤维。赛前 60–90 分钟补 30–60g 易消化碳水（香蕉、能量胶、米饼）。比赛当天不要试新食物、新补剂。',
    source: 'IOC consensus (2018); ACSM/AND/DC (2016)',
    tags: ['fightday', 'timing']
  },

  // ---------- 水合 ----------
  {
    id: 'hyd-2pct', cat: 'hydration', title: '脱水 2% 就开始掉表现',
    body: '体重下降 2% 以上（58kg 约 1.16kg）时，血容量下降、心率上升、主观用力感升高，出拳速度和反应明显变差。3% 以上属于危险区。用训练前后体重差判断脱水是最可靠、最便宜的方法。',
    source: 'ACSM Position Stand: Exercise and Fluid Replacement (Sawka et al., 2007)',
    tags: ['hydration', 'dehydration']
  },
  {
    id: 'hyd-replace', cat: 'hydration', title: '每掉 1kg 体重，补 1.25–1.5L 液体',
    body: '补液量要大于流失量，因为尿液和汗液会继续丢。按 1kg 缺口补 1.25–1.5L，分 2–4 次喝完，别一次灌 2L（会引发胃肠不适和低钠风险）。训练超过 60–90 分钟或大量出汗时，选含钠 300–700 mg/L 的饮料。',
    source: 'ACSM Position Stand: Exercise and Fluid Replacement (2007)',
    tags: ['hydration']
  },
  {
    id: 'hyd-urine', cat: 'hydration', title: '尿色是最快的自查指标',
    body: '晨尿淡黄（1–3 级）为水合良好，4 级以上偏深提示需要补水，茶色或可乐色要警惕横纹肌溶解和严重脱水，属于就医信号。这也是赛前控水期最应该盯的指标。',
    source: 'ACSM Position Stand: Exercise and Fluid Replacement (2007)',
    tags: ['hydration']
  },
  {
    id: 'hyd-sodium', cat: 'hydration', title: '大汗体质需要钠，不只是水',
    body: '衣服上有白色汗渍、汗味重、训练后头痛，通常提示汗钠偏高。这类人只喝白水容易低钠，表现为恶心、头胀、越喝越难受。方案：训练饮料里加盐（每 500ml 加 0.5–1g 盐）或喝含电解质饮料，同时不要过量饮水。',
    source: 'ACSM Position Stand: Exercise and Fluid Replacement (2007)',
    tags: ['hydration', 'sodium']
  },

  // ---------- 恢复 ----------
  {
    id: 'rec-sleep', cat: 'recovery', title: '睡眠 7–9 小时，是恢复的第一优先级',
    body: '睡眠不足 6 小时与力量下降、反应变慢、受伤风险上升、食欲激素紊乱（饥饿素升高、瘦素下降）都相关。备赛期睡眠比任何补剂都重要。判断标准：不靠闹钟能醒、白天不犯困。如果长期睡不够，先砍训练量，不要加补剂。',
    source: 'Walsh et al., Sleep and the athlete (2021); AASM/SRS consensus',
    tags: ['sleep']
  },
  {
    id: 'rec-soreness', cat: 'recovery', title: '酸痛 7 分以上，别做速度与爆发课',
    body: '速度、爆发、最大力量课依赖中枢神经系统的"新鲜度"。酸痛 7/10 以上、或晨起静息心率比平时高 5–8 次/分时，做速度课收益极低且受伤风险高。改成技术、战术、柔韧或低强度有氧，把速度课挪到恢复之后。',
    source: 'ACSM/AND/DC (2016); 训练负荷管理通用原则',
    tags: ['soreness', 'recovery', 'plan']
  },
  {
    id: 'rec-sleep-hygiene', cat: 'recovery', title: '赛前 2 周固定作息，别靠补觉',
    body: '赛前 2 周开始固定入睡与起床时间（误差 <30 分钟），睡前一小时不开强光屏幕，卧室降到 18–20℃。比赛前夜失眠很常见，一晚睡 4–5 小时对表现的影响有限，不要因此焦虑或临时吃安眠药。',
    source: 'Walsh et al. (2021), Sleep and the athlete',
    tags: ['sleep', 'fightday']
  },
  {
    id: 'rec-load', cat: 'recovery', title: '用 sRPE 记录负荷：时长 × 主观强度',
    body: 'sRPE = 训练时长（分钟）× RPE（1–10）。每周总负荷比上周涨超过 15–20% 是伤病高发区。这个数比"练了几小时"有用得多，因为它把强度折进去了。连续 3 周负荷上升而没有减载周，就该安排一周降 40%。',
    source: '训练负荷管理通用实践（Foster et al. sRPE 方法）',
    tags: ['load', 'rpe']
  },

  // ---------- 补剂 ----------
  {
    id: 'sup-creatine', cat: 'supplement', title: '肌酸：3–5 g/天，唯一值得长期吃的',
    body: '一水肌酸每天 3–5g，不需要冲击期，对力量和无氧能力有稳定的小幅提升。备赛减重期尤其有用（保肌）。安全性证据充分，肾功能正常者无顾虑。注意会带来 0.5–1kg 的水重，减重期看到体重上升别误判。',
    source: 'ISSN Position Stand: Creatine Supplementation (Kreider et al., 2017)',
    tags: ['supplement']
  },
  {
    id: 'sup-caffeine', cat: 'supplement', title: '咖啡因：赛前 60min，3–6 mg/kg',
    body: '比赛前 60 分钟摄入 3–6 mg/kg（58kg 约 175–350mg，约 2–3 杯咖啡），对反应速度、耐力和主观用力感有帮助。备赛期先试过，确认不影响睡眠和胃肠。赛前 8 小时内不要再补，避免影响入睡。',
    source: 'ISSN Position Stand: Caffeine and Exercise Performance (Guest et al., 2021)',
    tags: ['supplement', 'fightday']
  },
  {
    id: 'sup-warning', cat: 'supplement', title: '减重期慎用"燃脂"类产品',
    body: '大多数减脂补剂（左旋肉碱、CLA、藤黄果等）证据薄弱，部分含未标注的兴奋剂成分，而拳击项目有反兴奋剂检测。任何补剂先查 WADA 禁用清单与产品第三方检测（Informed Sport / NSF）。减重靠热量缺口，不靠产品。',
    source: 'IOC consensus (2018); WADA Prohibited List',
    tags: ['supplement', 'risk']
  },

  // ---------- 基础 ----------
  {
    id: 'basic-plate', cat: 'basic', title: '一拳餐盘：1/2 蔬菜 + 1/4 蛋白 + 1/4 主食',
    body: '没有称重条件时用体积法：半个餐盘蔬菜，四分之一掌心大小的蛋白（鱼虾蛋瘦肉），四分之一拳头主食。减脂期把主食减到 1/4 以下但不要归零，训练日必须保证主食。',
    source: '中国居民膳食指南 (2022); ACSM/AND/DC (2016)',
    tags: ['basic', 'food']
  },
  {
    id: 'basic-breakfast', cat: 'basic', title: '早餐别只有碳水',
    body: '只吃粥+包子的早餐蛋白不足 10g，撑不到中午。加 2 个鸡蛋或一杯牛奶/豆浆，蛋白直接到 25–30g。晨练前吃不下的话，把蛋白放到训练后第一餐。',
    source: 'ISSN Position Stand: Protein and Exercise (2017)',
    tags: ['basic', 'protein']
  },
  {
    id: 'basic-fiber', cat: 'basic', title: '赛前 24h 减纤维，平时别减',
    body: '平时每天 25–30g 纤维对肠道和血脂有好处。但称重前 24–48 小时要把粗粮、豆类、大量蔬菜换成白米、白面、去皮水果，减少肠道内容物重量（可差 0.5–1.5kg）。',
    source: 'ACSM/AND/DC (2016); 赛前胃肠管理实践',
    tags: ['fightday', 'fiber']
  },
  {
    id: 'basic-alcohol', cat: 'basic', title: '备赛期酒精基本等于负收益',
    body: '酒精抑制蛋白合成、扰乱睡眠结构、增加脱水、提供 7 kcal/g 的空热量。减脂期每周超过 4 标准杯就会明显拖慢进度。',
    source: 'ISSN Position Stand: Diets and Body Composition (2017)',
    tags: ['basic', 'risk']
  },
  {
    id: 'basic-logging', cat: 'basic', title: '只记一餐＝没有数据',
    body: '少于 2 餐的记录无法判断全天能量与蛋白，系统会给"数据不足"而不是"达标"。记录的价值在连续性：每天 3 餐、连续 7 天，才能看出问题在哪一餐。',
    source: '膳食记录方法学通用要求',
    tags: ['log']
  },
  {
    id: 'basic-photo', cat: 'basic', title: '拍照记餐的准确率取决于参照物',
    body: '照片估算误差通常在 ±20–30%，放一个硬币、筷子或手掌做参照能明显提高准确度。有称重条件的优先称，照片只用于没秤的场合。',
    source: '膳食记录方法学通用要求',
    tags: ['log', 'photo']
  },
  {
    id: 'rec-hrv', cat: 'recovery', title: '晨脉比情绪更诚实',
    body: '每天醒来躺着测 1 分钟脉搏，连续记录。晨脉比个人基线高 5–8 次/分，且持续 2 天以上，通常意味着恢复不足、感染前兆或脱水。这时候减量比硬练划算。',
    source: 'ACSM/AND/DC (2016); 恢复监测通用实践',
    tags: ['recovery', 'hr']
  }
];

module.exports = { version: 3, categories: CATEGORIES, items: ITEMS };
