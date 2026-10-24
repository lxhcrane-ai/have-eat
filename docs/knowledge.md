# 知识库来源

`miniprogram/data/knowledge.js` 共 33 条，8 个分类。每条都有 `source` 字段，规则引擎输出的每个结论都指向具体条目。

## 采用的共识文件

| 缩写 | 全称 |
|---|---|
| ACSM 2016 | Nutrition and Athletic Performance（ACSM / AND / DC 联合立场声明，Thomas, Erdman & Burke）|
| ACSM 2007 | Exercise and Fluid Replacement Position Stand（Sawka et al.）|
| ISSN Protein | Protein and Exercise Position Stand（Jäger et al., 2017）|
| ISSN Diets | Diets and Body Composition（Aragon et al., 2017）|
| ISSN Timing | Nutrient Timing（Kerksick et al., 2017）|
| ISSN Creatine | Creatine Supplementation（Kreider et al., 2017）|
| ISSN Caffeine | Caffeine and Exercise Performance（Guest et al., 2021）|
| IOC 2018 | IOC consensus statement on sports nutrition（Maughan et al.）|
| IOC RED-S | RED-S consensus（Mountjoy et al., 2018）|
| 中国居民膳食指南 | 2022 版，用于一般餐盘与食物选择 |
| Walsh 2021 | Sleep and the athlete（共识综述）|
| WADA | Prohibited List，用于补剂风险提示 |

## 数值是怎么用的

知识库里的数字都是**区间**，引擎取区间中点做单点判断，区间上下限展示给用户：

- 蛋白：维持 1.6–2.2 g/kg，减脂 2.0–2.4 g/kg（按当前体重，不是去脂体重；去脂体重需体脂率，本版本未采集）
- 补液：每 1kg 体重缺口 1.25–1.5 L
- 减重速率：每周 0.5–1% 体重
- 睡眠：7–9 小时，<6.5 视为不足
- 咖啡因：3–6 mg/kg，赛前 60 分钟
- 肌酸：3–5 g/天，不需要冲击期

## 明确的取舍

1. **不走"精算 TDEE"路线。** 没有连续体成分和代谢车数据，任何 TDEE 都是估算。所以引擎用 Mifflin-St Jeor × 活动系数，并在界面标"粗估"，用它判断方向（盈余/缺口/持平），不用它给绝对热量配餐。
2. **不推补剂清单。** 只保留肌酸和咖啡因两个证据充分的，其余明确写"证据薄弱 + 反兴奋剂风险"。
3. **赛前脱水减重给的是风险提示，不是操作方案。** 实操必须有人现场盯着，代码不替代这个判断。
4. **每条建议都限制在"今天怎么调"，不给诊断。** 出现头晕、心悸、尿色异常等症状，文案统一指向就医。

## 新增条目的规矩

1. `id` 用 `分类-短词`，全局唯一，测试会检查。
2. 必须有 `source`，写得出具体文件；写不出就说明这条不该进库。
3. `tags` 至少一个，供规则引擎或提示逻辑匹配。
4. 正文 3–5 句，给"怎么吃/怎么补/多少量"，不写科普段子。
5. 加完跑 `bash scripts/sync-shared.sh && node scripts/test-rules.js`。
