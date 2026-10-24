# 规则–来源对照表（由 scripts/dump-docs.js 生成，勿手改）

每条规则至少 1 个一级来源，anchor 具体到章节或结论句。复核状态为 `needs_review` 的规则，告警展开时会显示"该规则待复核"。

## 总表

| 规则 ID | 规则名 | 阈值 | 复核 | 来源数 | 一级来源（类型 · 年份 · 锚点） |
|---|---|---|---|---|---|
| HYD-01 | 训练脱水百分比 | pct ≥ 2% → amber；pct ≥ 3% → red；本规则只在 maintain / cut 生效 | 有效 | 2 | 立场声明 2007 · Position Stand 正文“Dehydration and performance”段：体重丢失 ≥2% 即损害有氧与无氧表现，>3–4% 时热病风险上升（doi:10.1249/mss.0b013e31802ca597）<br>立场声明 2016 · Section “Fluid”: 用训练前后体重差估算出汗量，按 1.25–1.5 L/kg 补液（doi:10.1249/MSS.0000000000000852） |
| HYD-02 | 补液量（按失重折算） | needMl = lossKg × 1250；remainingMl = max(0, needMl − 已记录饮水) | 有效 | 1 | 立场声明 2007 · Position Stand 正文“Fluid replacement”段：每丢失 1 kg 体重补充约 1.25–1.5 L 液体，含钠有助于维持血浆容量（doi:10.1249/mss.0b013e31802ca597） |
| HYD-03 | 晨尿颜色 | urineColor ≥ 5 → amber；不参与评分权重 | 有效 | 1 | 立场声明 2007 · Position Stand 正文“Hydration assessment”段：尿色与尿比重可作为简易水合指标（doi:10.1249/mss.0b013e31802ca597） |
| HYD-04 | 称重后补液（恢复期） | postWeighIn.fluidMl ≥ 1000（前 2h）且含钠 → ok；<1000 → amber；<500 → red | 有效 | 2 | 立场声明 2025 · Position Statement 第 12 条：称重后应立即优先使用口服补液溶液（ORS），1–1.5 L/h，钠 50–90 mmol/L（doi:10.1080/15502783.2025.2467909）<br>立场声明 2007 · “Fluid replacement”段：含钠液体比纯水更快恢复血浆容量（doi:10.1249/mss.0b013e31802ca597） |
| HYD-05 | 微调期补液计划执行率 | 执行率 ≥90% → ok；80–90% → info；<80% → amber；未填计划或实际 → amber（数据不足） | 有效 | 2 | 立场声明 2025 · Position Statement 第 8–10 条：赛前周通过钠限制与饮水负荷诱导多尿，脱水策略需在监督下按计划执行（doi:10.1080/15502783.2025.2467909）<br>立场声明 2016 · Section “Fluid”: 个体化补液计划与执行监测优于事后按体重差反推（doi:10.1249/MSS.0000000000000852） |
| PRO-01 | 蛋白总量 | cut 2.0–2.4 g/kg；maintain/peak 1.6–2.2 g/kg；recover 1.6–2.0 g/kg | **待复核** | 3 | 立场声明 2017 · Position Stand 建议段：日常 1.4–2.0 g/kg/天；能量限制期减脂保肌可到 2.3–3.1 g/kg FFM/天（doi:10.1186/s12970-017-0177-8）<br>系统综述/元分析 2025 · 摘要与结论：能量限制 + 抗阻训练人群中，蛋白摄入（以 g/kg FFM 表达）与 FFM 变化呈剂量-反应关系；能量缺口越大 FFM 丢失越多，蛋白的保肌作用被缺口部分抵消（doi:10.1519/SSC.0000000000000888）<br>立场声明 2025 · Position Statement 第 6 条：纵向减重期蛋白 1.2–2.0 g/kg（下限），碳水 3.0–4.0 g/kg，脂肪 0.5–1.0 g/kg（doi:10.1080/15502783.2025.2467909） |
| PRO-02 | 单餐蛋白分配 | 平均每餐蛋白 < 20 g → info；不参与红灯 | 有效 | 1 | 立场声明 2017 · Position Stand：每餐 0.25 g/kg 体重或 20–40 g 优质蛋白，每 3–4 小时一次，全天 3–4 次以上（doi:10.1186/s12970-017-0177-8） |
| ENE-01 | 能量盈余 / 缺口 | cut: bal > 200 amber，bal < −900 red；maintain: \|bal\| ≤ 350 ok，否则 amber | 有效 | 2 | 立场声明 2016 · Section “Energy”: 减重期建议 300–600 kcal/天缺口以保去脂体重（doi:10.1249/MSS.0000000000000852）<br>专家共识 2023 · Consensus 正文“Energy availability”段：长期低于 30 kcal/kg FFM/天进入低能量可用性，损害骨、内分泌与表现（doi:10.1136/bjsports-2023-106860） |
| PHASE-01 | 减重速率上限 | pctPerWeek > 1 → red；< 0.3 且 cut → info；r > +0.5 kg/周 → amber（方向相反） | 有效 | 3 | 立场声明 2016 · Section “Weight management”: 长期减重建议 0.5–1.0% 体重/周，过快会增加去脂体重损失（doi:10.1249/MSS.0000000000000852）<br>立场声明 2025 · Position Statement 第 7 条：赛前 72/48/24 小时可接受的体重丢失分别为 6.7%/5.7%/4.4%——这是急性脱水窗口，不能当作长期速率使用（doi:10.1080/15502783.2025.2467909）<br>系统综述/元分析 2025 · 结论段：能量缺口越大，即使抗阻训练 FFM 丢失也越多（doi:10.1519/SSC.0000000000000888） |
| PHASE-02 | 维持期体重偏离 | 目标体重 +3–5% 为项目设定带宽；超出上限 → info | **待复核** | 1 | 立场声明 2025 · Position Statement 第 3 条：非赛季/一般准备期应把体重维持在参赛级别要求之上 12–15%（doi:10.1080/15502783.2025.2467909） |
| SLE-01 | 睡眠时长 | 目标 7–9h；<6.5h amber；<6h red；peak 期 <7h amber | 有效 | 2 | 专家共识 2021 · Expert consensus recommendations 段：运动员目标睡眠 7–9 h/晚，habitual short sleep（<7h）与表现、免疫、情绪下降相关；赛前周应固定作息而非补觉（doi:10.1136/bjsports-2020-102025）<br>专家共识 2013 · Consensus 正文“Sleep”：睡眠不足是恢复不足与过度训练综合征的核心可干预因素（doi:10.1249/MSS.0b013e318279a10a） |
| REC-01 | 称重后碳水与进食节奏 | 糖原明显耗尽 → 8–12 g/kg；轻度限制 → 4–7 g/kg；进食间隔 ≤60 g/h 快碳；纤维限制到最低 | 有效 | 3 | 立场声明 2025 · Position Statement 第 13–14 条：称重后先 ORS 再快碳（≤60 g/h）；糖原耗尽者碳水 8–12 g/kg，轻度限制者 4–7 g/kg，同时限制纤维避免胃肠不适（doi:10.1080/15502783.2025.2467909）<br>立场声明 2025 · Position Statement 第 11、15 条：称重后快速回升体重/体液是为了比赛表现，方案需在监督下执行（doi:10.1080/15502783.2025.2467909）<br>立场声明 2016 · Section “Nutrition before, during and after competition”: 赛后 0–4h 补糖与补液优先（doi:10.1249/MSS.0000000000000852） |
| REC-02 | 酸痛与高强度课冲突 | sorenessMax ≥ 8 → red；≥7 → amber；与 speed/power/max_strength 同现 → red | 有效 | 2 | 叙述性综述 2003 · 正文“Performance factors”段：DOMS 在离心运动后 24–72h 达峰，伴随力量与爆发力下降、关节位置觉变差（doi:10.2165/00007256-200333020-00005）<br>专家共识 2013 · Consensus：持续的肌肉酸痛合并表现下降应被视为恢复不足信号，需调整负荷（doi:10.1249/MSS.0b013e318279a10a） |
| REC-03 | 晨脉高于基线 | delta ≥ 5 → amber；delta ≥ 8 或连续 2 天 → 升级 | 有效 | 2 | 叙述性综述 2014 · 正文“Resting HR and HRV”: 静息心率/HRV 必须对照个体滚动基线解释，绝对值无意义；持续偏离提示自主神经恢复不足（doi:10.3389/fphys.2014.00073）<br>专家共识 2013 · Consensus：静息心率持续升高是过度训练综合征的辅助诊断指标之一（doi:10.1249/MSS.0b013e318279a10a） |
| REC-04 | 称重后体重回升不足 | regainPct < 50% → amber；<30% 或主观 ≤2 → red | 有效 | 2 | 立场声明 2025 · Position Statement 第 15 条：称重后补液/补能不足会持续损害比赛表现（doi:10.1080/15502783.2025.2467909）<br>立场声明 2007 · “Fluid replacement”段：补液量应覆盖失重的 125–150%（doi:10.1249/mss.0b013e31802ca597） |
| GI-01 | 胃肠症状 | 任一症状 ≥2（0–4 量表）→ amber；≥3 或合并呕吐 → red | 有效 | 2 | 立场声明 2025 · Position Statement 第 13 条：称重后应限制纤维以避免胃肠不适；快碳按可耐受速率 ≤60 g/h 递增（doi:10.1080/15502783.2025.2467909）<br>立场声明 2016 · Section “Gastrointestinal distress”: 赛前减少高纤维、高脂肪与高渗食物可降低 GI 症状（doi:10.1249/MSS.0000000000000852） |
| SUP-01 | 补剂计划执行 | 计划内补剂任一项未执行 → info；咖啡因赛前 3–6 mg/kg 且 60min 前 | 有效 | 2 | 立场声明 2025 · Position Statement 第 4 条：肌酸、β-丙氨酸、HMB、咖啡因在准备期、比赛与赛后恢复中有证据支持（doi:10.1080/15502783.2025.2467909）<br>专家共识 2018 · Consensus 正文：只有证据等级较高的少数补剂值得使用，剂量与 timing 个体化，需第三方检测认证（doi:10.1136/bjsports-2018-099027） |
| LOG-01 | 记录不足 | meals.structured < 2 或 missingRequired 非空 → amber | 有效 | 1 | 立场声明 2016 · Section “Assessment”: 膳食评估依赖完整记录，记录不全时不应据此给出能量/蛋白达标判断（doi:10.1249/MSS.0000000000000852） |

## 完整文献条目

- Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS; American College of Sports Medicine. Exercise and fluid replacement: ACSM position stand. Med Sci Sports Exerc. 2007;39(2):377-390. doi:10.1249/mss.0b013e31802ca597 https://pubmed.ncbi.nlm.nih.gov/17277604/
- Thomas DT, Erdman KA, Burke LM. Nutrition and athletic performance: position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine. Med Sci Sports Exerc. 2016;48(3):543-568. doi:10.1249/MSS.0000000000000852 https://doi.org/10.1249/MSS.0000000000000852
- Ricci AA, Evans C, Stull C, Peacock CA, French DN, Stout JR, Fukuda DH, Galpin AJ, Tartar J, Johnson S, Kreider RB, Kerksick CM. International Society of Sports Nutrition position stand: nutrition and weight cut strategies for mixed martial arts and other combat sports. J Int Soc Sports Nutr. 2025;22(1):2467909. doi:10.1080/15502783.2025.2467909 https://pmc.ncbi.nlm.nih.gov/articles/PMC11894756/
- Jäger R, Kerksick CM, Campbell BI, Cribb PJ, Wells SD, Skwiat TM, et al. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20. doi:10.1186/s12970-017-0177-8 https://doi.org/10.1186/s12970-017-0177-8
- Refalo MC, Trexler ET, Helms ER, et al. Effect of dietary protein on fat-free mass in energy restricted, resistance-trained individuals: an updated systematic review with meta-regression. Strength Cond J. 2025 (published online 22 Jan 2025). doi:10.1519/SSC.0000000000000888 https://doi.org/10.1519/ssc.0000000000000888
- Mountjoy M, Ackerman KE, Bailey DM, Burke LM, Constantini N, Hackney AC, et al. 2023 International Olympic Committee’s (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs). Br J Sports Med. 2023;57(17):1073-1097. doi:10.1136/bjsports-2023-106860 https://bjsm.bmj.com/content/57/17/1073
- Walsh NP, Halson SL, Sargent C, Roach GD, Nédélec M, Gupta L, et al. Sleep and the athlete: narrative review and 2021 expert consensus recommendations. Br J Sports Med. 2021;55(7):356-368. doi:10.1136/bjsports-2020-102025 https://bjsm.bmj.com/content/55/7/356
- Meeusen R, Duclos M, Foster C, Fry A, Gleeson M, Nieman D, et al. Prevention, diagnosis and treatment of the overtraining syndrome: joint consensus statement of the European College of Sport Science and the American College of Sports Medicine. Med Sci Sports Exerc. 2013;45(1):186-205. doi:10.1249/MSS.0b013e318279a10a https://doi.org/10.1249/MSS.0b013e318279a10a
- Cheung K, Hume PA, Maxwell L. Delayed onset muscle soreness: treatment strategies and performance factors. Sports Med. 2003;33(2):145-164. doi:10.2165/00007256-200333020-00005 https://doi.org/10.2165/00007256-200333020-00005
- Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol. 2014;5:73. doi:10.3389/fphys.2014.00073 https://doi.org/10.3389/fphys.2014.00073
- Maughan RJ, Burke LM, Dvorak J, Larson-Meyer DE, Peeling P, Phillips SM, et al. IOC consensus statement: dietary supplements and the high-performance athlete. Br J Sports Med. 2018;52(7):439-455. doi:10.1136/bjsports-2018-099027 https://bjsm.bmj.com/content/52/7/439

## 待复核与冲突（代码里标了 needs_review）

### PRO-01 蛋白总量

阈值冲突（待复核）：本项目 cut 期用 2.0–2.4 g/kg BM，ISSN 2025 给出的下限是 1.2–2.0 g/kg、ISSN 2017 的 2.3–3.1 是 g/kg FFM 而非 BM。两者按 15% 体脂换算大致相容，但同一拳手体重口径不同结论会差 20–30g。建议营养师决定：继续用 BM 上限偏保守，还是改成 g/kg FFM 口径（需要体脂数据）。

### PHASE-02 维持期体重偏离

阈值冲突（待复核）：项目原设定 +3–5%，ISSN 2025 第 3 条给的是 +12–15%（针对 MMA 等需大幅减重的项目）。拳击与 MMA 的赛前减重幅度不同，需营养师按项目定档；未定档前本规则只出 info，不做红灯。

