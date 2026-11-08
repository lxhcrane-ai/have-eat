# 复合目标矩阵规格（G0 契约冻结）

> 状态：G0 已冻结，供 G1–G7 实施会话照着写代码。
> 范围：只定义数据、判定口径、矩阵内容、规则行为与兼容要求；本文档不包含 JS/WXML 实现。
> 上游代码：`miniprogram/utils/rules.js`（阶段模型、`fieldsFor`、`evaluate`、评分）、`miniprogram/data/ruleRegistry.js`（18 条规则）、`miniprogram/data/knowledge.js`（KB 与来源）、`docs/schema.md`（字段契约）。
> 下游：`goalMatrix.js`、`goals.js`、`ruleRegistry.js` 的 GOAL-01/02、首页/填写页/趋势页/营养师端/复核页、`advice` 快照。

---

## 0. 术语与边界

| 术语 | 含义 |
|---|---|
| 目标原子 | 一个可独立追求的目标方向，共 15 个，见第 1 节 |
| 复合目标 | 2–3 个目标原子的组合，共 27 个配方，见第 4 节 |
| 矩阵 | 行 = 15 个目标原子，列 = 现有 4 个阶段，共 60 格，见第 2 节 |
| 目标计划 | `evaluate` 输出的 `goalPlan`，是“目标如何叠加在阶段之上”的裁决结果 |
| 护栏 | SLE / GI / EA / IMM / MED；SLE/GI/EA 可目标化，IMM 只监测，MED 是安全标记 |
| owner 规则 | 某个现象的唯一负责规则；同一现象不允许被两个目标重复扣分 |
| 目标矩阵版本 | `goalMatrixVersion`，纯数据版本；与 `RULES_VERSION` 分开管理 |

**硬边界：**

1. 不改变现有 4 阶段模型，不改变 `suggestPhase()` 的建议逻辑。
2. 不改变现有 18 条规则的阈值、适用阶段、评分权重。
3. 不改变 `score`、`level`、`levelTone` 的计算方式。
4. 目标为空时，`evaluate` 输出必须与 v3.0 逐字段一致；新增字段只在目标非空时出现。
5. 目标不能绕过阶段抑制：阶段抑制的 owner 规则，目标层也不能借它出新告警。

---

## 1. 目标原子（15 个）

### 1.1 原子清单

| ID | 名称 | 归属维度 | 定义 / 确认信号 | 反证 / 冲突信号 | 合法阶段 |
|---|---|---|---|---|---|
| P-POW | 爆发/最大力量 | 表现 | `nextPlan.type ∈ {power,max_strength}`；`sessionType=strength` 且 `rpe≥8`、`durationMin≤90`；`nextPlan.intensity=high` | 酸痛≥7、睡眠<6、脱水≥3%、次日速度课冲突 | maintain / cut / peak |
| P-SPD | 速度/神经 | 表现 | `nextPlan.type=speed`；短时长、`rpe≥7`；晨脉接近基线 | 酸痛≥7、睡眠<7、晨脉+5、前一日大负荷 | maintain / cut / peak |
| P-HYP | 肌肥大 | 表现 | 近 7 日 `sessionType=strength` ≥2 次、`rpe 6–8`、体重斜率 +0.2~+0.5 kg/周、能量小幅盈余 | 减重速率>1%/周、睡眠<6.5、胃肠症状、距称重<12 周 | maintain / cut（仅保肌） |
| P-END | 耐力/体能 | 表现 | `sessionType ∈ {cardio,sparring}`，或 `nextPlan.type=conditioning`；`durationMin≥60`；`rounds≥6`；sRPE 高 | 晨脉+5、睡眠<6.5、酸痛≥7、周负荷陡增 | maintain / cut / peak（仅低容量） |
| P-SKL | 技术/战术 | 表现 | `sessionType=technique`；`rpe≤7`；`nextPlan.type=technique` | 空腹技术课、睡眠<6、脱水≥2% | maintain / cut / peak |
| B-CUT | 减脂 | 身体 | `phase=cut`；周斜率 -0.3~-1%；缺口 300–600；`gapPct>1.5` | 缺口>900、EA<30、睡眠<6.5、周斜率>1% | cut |
| B-HOLD | 控级别/维持 | 身体 | `phase=maintain`，或 cut 且 `gapPct≤1.5`；周斜率 ±0.2；`driftPct≤maintainBandPct` | `driftPct>band`、连续两周单向漂移 | maintain / cut（仅 gap≤1.5） |
| B-GAIN | 增肌/增重 | 身体 | `phase=maintain`；`weighInDate` 距今>84 天或无；周斜率 +0.2~+0.5；盈余 200–400 | 距称重<12 周、PHASE-02 漂移、睡眠/胃肠红灯 | 仅 maintain（非赛季） |
| B-PEAK | 赛前水盐微调 | 身体 | `phase=peak`；`daysToWeigh≤14`；`hydrationPlan` 有计划 | 任何热量缺口调整、赛前<1 周临时加新方案 | 仅 peak |
| B-REFUEL | 称重后恢复 | 身体 | `phase=recover`；`postWeighIn` 有补液/碳水记录 | 称重后 24h 内继续减重 | 仅 recover |
| G-SLE | 睡眠/恢复（含精力） | 护栏，可目标化 | `sleep.hours<6.5`（peak<7）、`quality≤2`、晨脉+5、酸痛≥7、`mood.fatigue≥4`（精力差是睡眠/恢复不足的下游表现） | 睡眠 7–9h、晨脉在基线内 | 全阶段 |
| G-GI | 胃肠耐受 | 护栏，可目标化 | `giSymptoms` 任一≥2 或呕吐；赛前高纤维/高脂 | 无症状、耐受良好 | 全阶段（maintain/cut 仅监测） |
| G-EA | 能量可用性 | 护栏 | `bodyFatPct` 已知 + 摄入/消耗 + FFM；EA<30 kcal/kg FFM | 数据不足时不许判红，只标“无法判断” | 全阶段 |
| G-IMM | 免疫（名额外监测，不任 lead） | 护栏（弱证据，`role=monitor`） | `health.illness≥1`、睡眠<6、sRPE 周环比>20%、缺口>900 | 无感染症状 | 全阶段 |
| G-MED | 医疗/女性/青少年 | 安全标记（否决，非可选目标，不任 lead；转诊信息写 `profile.note`） | 营养师标记、月经异常、反复骨伤、发热、青少年生长停滞 | — | 全阶段 |

**精力归属（定稿）**：精力不是独立原子，统一由 `G-SLE` 承接。`mood.fatigue` 是睡眠/恢复不足的下游表现；由能量可用性不足导致的疲劳由 `G-EA` 单独承接。C11/C12/C22/C24 中的“精力”一律写成 `G-SLE`，不得再把 `EN` 作为别名或第 16 个原子。入口若收到旧值 `EN`，只在归一化层映射为 `G-SLE`，不得进入 `goalPlan` / `composites` / `atoms`；数据层不得保留 `docAtoms` / `aliasNote` 形式的 `EN` 别名。

### 1.2 判定口径

1. **目标由营养师显式设定**：`profile.goals` 是权威来源，数组顺序即优先级（同层冲突时第一个优先；L0–L2 护栏红灯时可临时成为 lead；不另设 `goalPriority`）。**名额口径**：最多 3 个计入目标名额；健康监测型护栏 `G-IMM` 可额外追加 1 个（`role=monitor`），不占这 3 个名额，不参与冲突裁决，**也不担任 `goalPlan.lead`**；`G-MED` 是安全标记，不是可选目标，**不写入 `profile.goals`、不占名额、不担任 lead**。`evaluate` 不根据单日日志自动新增目标。
2. **日志只做确认/反证**：单日 `training`、`nextPlan`、`sleep`、`sorenessByArea`、`restingHr`、`giSymptoms`、`mood` 用于判断“今天是否适合执行该目标”，不用于推断“这两周在增肌还是减脂”。
3. **周频次来自周报/趋势**：`P-HYP` 的“近 7 日力量课≥2 次”、`P-END` 的周负荷、`B-CUT` 的 refeed 周期，均由周报或营养师端计算，不进入单日 `evaluate` 的必需输入。
4. **数据不足不判红**：任何目标缺少关键字段时，只能输出 `data_missing` blocker 或 `unknown`，不能输出“达标/不达标”。
5. **阶段仍由营养师设定**：`profile.phase` 只由 `coachApi.setPhase` 写；目标不改阶段。目标与阶段不匹配时由 `GOAL-01` 提示“改目标或改阶段”。

### 1.3 字段映射

| 判断对象 | 现有字段 | 所属 |
|---|---|---|
| 训练类型 | `training.sessionType`、`nextPlan.type` | log |
| 训练负荷 | `training.durationMin`、`training.rpe`、`training.rounds` | log |
| 体重趋势 | `weights.morning`、`ctx.recentMorningWeights`、`weeklyRate()` | log / ctx |
| 能量盈亏 | `meals`、`estimateTdee()`、`ENE-01`（该 TDEE 只服务 ENE-01 的盈亏方向判断，**不是 EA**；G-EA 的训练消耗按 §7.6.1 净 MET 估算） | log / 引擎 |
| 睡眠 | `sleep.hours`、`sleep.quality` | log |
| 酸痛 | `sorenessByArea` | log |
| 晨脉 | `restingHr`、`profile.restingHrBaseline` | log / profile |
| 胃肠 | `giSymptoms` | log |
| 水合 | `hydration`、`hydrationPlan`、`postWeighIn` | log |
| 能量可用性 | `profile.bodyFatPct`（新增）、`meals`、训练课净消耗估算（见 §7.6.1） | profile / 引擎 |
| 目标本身 | `profile.goals`、`profile.goalEffectiveDate`、`profile.goalSource` | profile |

---

## 2. 矩阵：4 阶段 × 15 原子 = 60 格

### 2.1 读法

- 单元格编号 `MX-{阶段}-{原子}`，例如 `MX-CUT-P-POW`。
- `✅` = 合法；`✅（条件）` = 满足附加条件才合法；`N/A` = 阶段定义禁止，触发 `GOAL-01`。
- 宏量单位：`P` 蛋白 g/kg 体重；`C` 碳水 g/kg 体重；`Fat` 脂肪 g/kg 体重；`E` 每日能量盈亏 kcal。
- “监测”只列 owner 规则；目标层不得为同一现象再发告警。
- “额外字段”列中的 `bodyFatPct` 属于 `profile`，不是每日 `logs` 字段；其余 `startTime / quality / illness` 属于 `logs`。
- `—` = 无额外字段或无监测项。
- `G-MED` / `G-IMM` 的矩阵行只表示护栏状态：`G-MED` 不是可选目标，`G-IMM` 是名额外监测原子；两者都不占 3 个主目标名额。
- `AS-05` 是知识库 `assessment` 锚点，不是规则 ID；`G-EA` 行不把它列为 owner 规则，`monitorKbIds` 可存 `AS-05` 但不等同于告警来源。

### 2.2 maintain（维持期）矩阵

| 原子 | 合法性 | 策略 | 宏量 | 时机 | 额外字段 | 监测 |
|---|---|---|---|---|---|---|
| P-POW | ✅ | 保强度、容量适中；不额外加有氧 | P 1.6–2.2；C 4–6；E ±350 | 前 1–3h C 1–2；后 P 25–40g | startTime, quality | PRO-01, ENE-01, REC-02, SLE-01 |
| P-SPD | ✅ | 神经新鲜优先；速度课前不安排大容量 | P 1.6–2.2；C 4–6；E ±350 | 前 2–3h C 1–2；咖啡因按需 | startTime, quality | SLE-01, REC-02, REC-03 |
| P-HYP | ✅ | 小幅盈余；力量日为主 | P 1.8–2.2；C 4–6；E +200~+400 | 后 P 25–40g；C 1.0–1.2/kg/h | startTime | PHASE-02, REC-02, SLE-01 |
| P-END | ✅ | 碳水优先；两练间隔≥6h | P 1.6–2.2；C 4–7；E ±350 | 后 C 1.0–1.2/kg/h | startTime | SLE-01, REC-03, REC-02 |
| P-SKL | ✅ | 不空腹；技术课为主 | —（weak，`macros=null`） | 前 1–2h 少量碳水，具体量由营养师确认 | quality | SLE-01, REC-02 |
| B-CUT | N/A | 阶段不符：维持期不主动减脂；先切 cut | — | — | — | GOAL-01 |
| B-HOLD | ✅ | 体重稳定；每周看斜率 | P 1.6–2.2；C 3–5；E ±350 | 正常三餐 | — | PHASE-02, ENE-01 |
| B-GAIN | ✅（条件） | 仅非赛季且距称重>84 天；小幅盈余 | P 1.8–2.2；C 4–6；E +200~+400 | 后 P 25–40g | — | PHASE-02, REC-02, SLE-01 |
| B-PEAK | N/A | 未到微调窗 | — | — | — | GOAL-01 |
| B-REFUEL | N/A | 未到恢复窗 | — | — | — | GOAL-01 |
| G-SLE | ✅ | 目标 7–9h；<6.5 amber，<6 red | — | 睡前 3h 不大量进食；咖啡因睡前 8h 避免 | — | SLE-01, REC-03 |
| G-GI | ✅（监测） | 平时不主动减纤维；症状≥2 只进目标横幅 | — | 训练前低纤维低脂 | — | GI-01（阶段抑制，仅横幅） |
| G-EA | ✅（护栏） | bodyFatPct 已知才计算；EA<30 置 blocker red（不进 alerts） | C≥3 | — | bodyFatPct（profile） | ENE-01（AS-05 只作锚点） |
| G-IMM | ✅（监测） | 弱证据；只监测 | — | — | illness | illness（无 owner 规则） |
| G-MED | ✅（否决） | 医疗意见优先 | — | — | — | 人工 |

### 2.3 cut（减脂期）矩阵

| 原子 | 合法性 | 策略 | 宏量 | 时机 | 额外字段 | 监测 |
|---|---|---|---|---|---|---|
| P-POW | ✅ | 强度不砍、辅助量-20~30% | P 2.0–2.4；C 3–5；E −300~−400 | 前 1–3h C 1–2；后 C 1.0–1.2/kg/h | startTime, quality | PHASE-01, PRO-01, HYD-01, REC-02 |
| P-SPD | ✅ | 速度日不加深缺口 | P 2.0–2.4；C 3–5；速度日 E≥−300 | 前 2–3h C 1–2 | startTime, quality | PHASE-01, SLE-01, REC-02 |
| P-HYP | ✅（保肌） | 只保肌不加量；力量维持 1–2 次/周 | P 2.0–2.4；C 3–5；E −300~−400 | 后 P 25–40g | startTime | PRO-01, PHASE-01, REC-02 |
| P-END | ✅ | 缺口≤400；大负荷日不加深 | P 2.0–2.4；C≥3；E −300~−400 | 后 C 1.0–1.2/kg/h | startTime | PHASE-01, ENE-01, SLE-01, REC-03 |
| P-SKL | ✅ | 技术日不加深缺口 | —（weak，`macros=null`） | 前 1–2h 少量碳水，具体量由营养师确认 | quality | PHASE-01, SLE-01 |
| B-CUT | ✅ | 缺口 300–600；每 2–3 周 refeed | P 2.0–2.4；C 3–5；Fat 0.5–1.0；E −300~−600 | 训练前后集中碳水 | — | PHASE-01, ENE-01, PRO-01, HYD-01 |
| B-HOLD | ✅（条件） | 仅 gap≤1.5%；只维持不再减 | P 2.0–2.4；C 3–5；E≤−300 | 正常三餐 | — | PHASE-02, PHASE-01, PRO-01 |
| B-GAIN | N/A | 减脂期禁止增重；GOAL-01 | — | — | — | GOAL-01 |
| B-PEAK | N/A | 微调窗未到 | — | — | — | GOAL-01 |
| B-REFUEL | N/A | 未到恢复窗 | — | — | — | GOAL-01 |
| G-SLE | ✅ | 缺口不加深；目标 7–9h | — | 咖啡因睡前 8h 避免 | — | SLE-01, PHASE-01 |
| G-GI | ✅（监测） | 高纤维/高脂餐后训练注意；只进目标横幅 | — | 训练前低纤维低脂 | — | GI-01（阶段抑制，仅横幅） |
| G-EA | ✅（护栏） | 缺口≤300–400；EA<30 用护栏动作 `veto` 否决加深（blocker red，不进 alerts） | C≥3 | — | bodyFatPct（profile） | ENE-01, PHASE-01（AS-05 只作锚点） |
| G-IMM | ✅（监测） | 只监测；感染时人工决定是否回补缺口 | — | — | illness | illness（无 owner 规则） |
| G-MED | ✅（否决） | 医疗意见优先 | — | — | — | 人工 |

### 2.4 peak（微调期）矩阵

| 原子 | 合法性 | 策略 | 宏量 | 时机 | 额外字段 | 监测 |
|---|---|---|---|---|---|---|
| P-POW | ✅ | 只保强度、不加量 | P 1.6–2.2；C 3–5；E 0 | 前 1–2h 小份 C | startTime, quality | HYD-05, GI-01, SLE-01, REC-02 |
| P-SPD | ✅ | 低容量保速度 | P 1.6–2.2；C 3–5；E 0 | 前 2–3h C 1–2 | startTime, quality | HYD-05, GI-01, SLE-01 |
| P-HYP | N/A | 微调期不动热量盈余 | — | — | — | GOAL-01 |
| P-END | ✅ | 只维持低容量，不新增负荷 | P 1.6–2.2；C 3–5；E 0 | 按计划补液 | startTime | HYD-05, GI-01, SLE-01 |
| P-SKL | ✅ | 低纤维低体积；技术课为主 | —（weak，`macros=null`） | 前 1–2h 少量碳水，具体量由营养师确认 | quality | GI-01, HYD-05 |
| B-CUT | N/A | 禁止再动热量缺口 | — | — | — | GOAL-01 |
| B-HOLD | N/A | 微调期按水盐计划，不做热量维持决策 | — | — | — | GOAL-01 |
| B-GAIN | N/A | 禁止增重 | — | — | — | GOAL-01 |
| B-PEAK | ✅ | 只动水、钠、纤维与胃肠内容物 | P 1.6–2.2；C 3–5；E 0 | 补液计划；快碳≤60 g/h | — | HYD-05, GI-01, SLE-01 |
| B-REFUEL | N/A | 称重前不做恢复 | — | — | — | GOAL-01 |
| G-SLE | ✅ | 目标 7–9h；<7 amber | — | 固定作息 | — | SLE-01, HYD-05 |
| G-GI | ✅ | 低纤维、低脂、小体积 | — | 快碳≤60 g/h | — | GI-01, HYD-05 |
| G-EA | ✅（护栏） | 不做能量缺口；EA 只监测 | — | — | bodyFatPct（profile） | —（无 owner；AS-05 只作锚点） |
| G-IMM | ✅（监测） | 只监测；人工提示赛前不试新食物/补剂 | — | — | illness | illness（无 owner 规则） |
| G-MED | ✅（否决） | 医疗意见优先 | — | — | — | 人工 |

### 2.5 recover（恢复期）矩阵

| 原子 | 合法性 | 策略 | 宏量 | 时机 | 额外字段 | 监测 |
|---|---|---|---|---|---|---|
| P-POW | N/A | 恢复期不安排爆发课 | — | — | — | GOAL-01 |
| P-SPD | N/A | 恢复期不安排速度课 | — | — | — | GOAL-01 |
| P-HYP | N/A | 先补液补糖，不安排增肌目标 | — | — | — | GOAL-01 |
| P-END | N/A | 恢复期不打训练课 | — | — | — | GOAL-01 |
| P-SKL | N/A | 恢复期不安排技术课 | — | — | — | GOAL-01 |
| B-CUT | N/A | 恢复期不做减脂决策 | — | — | — | GOAL-01 |
| B-HOLD | N/A | 恢复期不做控重决策 | — | — | — | GOAL-01 |
| B-GAIN | N/A | 恢复期不做增重决策 | — | — | — | GOAL-01 |
| B-PEAK | N/A | 称重已过 | — | — | — | GOAL-01 |
| B-REFUEL | ✅ | ORS + 快碳 + 蛋白；逐步加纤维 | P 1.6–2.0；C `[[4,7],[8,12]]`（两段独立；7–8 非法）；E 0 | 先补液再补糖；快碳≤60 g/h | — | HYD-04, REC-01, REC-04, GI-01 |
| G-SLE | ✅ | 恢复期优先睡眠 | — | — | — | SLE-01, REC-01, REC-04 |
| G-GI | ✅ | 逐步加回纤维 | — | 低纤维起步 | — | GI-01, REC-01 |
| G-EA | ✅（护栏） | 恢复期不判 EA | — | — | bodyFatPct（profile） | —（无 owner；AS-05 只作锚点） |
| G-IMM | ✅（监测） | 只监测；感染优先就医（人工提示） | — | — | illness | health.illness（无 owner 规则） |
| G-MED | ✅（否决） | 医疗意见优先 | — | — | — | 人工 |

### 2.6 三个详细策略卡示例

#### MX-CUT-P-POW（爆发 × 减脂）

- 策略：强度不砍，辅助量砍 20–30%；缺口封顶 400 kcal；蛋白 2.0–2.4 g/kg；碳水 3–5 g/kg 集中在训练前后；肌酸 3–5 g 维持；咖啡因只在强度日、赛前 60 min、睡前 8h 不用。
- 时机：训练前 1–3h 1–2 g/kg 碳水；训练后 1.0–1.2 g/kg/h 至 2h；睡前 30–40 g 缓释蛋白。
- 额外字段：`training.startTime`、`training.quality`。
- 监测：PHASE-01 周降≤1%；PRO-01 ≥2.0 g/kg；HYD-01 脱水<2%；REC-02 酸痛<7；SLE-01 ≥7h。
- 证据：强（ISSN 2025、ACSM 2016、ISSN 2017、ISSN Timing 2017、ISSN Creatine 2017）；“减重期保爆发”本身中等。
- 冲突：与 GAIN/END/PEAK；模式 `cap`。

#### MX-MAINTAIN-P-HYP（增肌 × 维持期）

- 策略：小幅盈余 200–400 kcal；蛋白 1.8–2.2 g/kg；碳水 4–6 g/kg；力量日训练后补 25–40 g 蛋白；不主动制造缺口；每 2–3 周看一次体重斜率。
- 时机：训练前 1–3h 1–2 g/kg 碳水；训练后 25–40 g 蛋白 + 1.0–1.2 g/kg/h 碳水。
- 额外字段：`training.startTime`。
- 监测：体重斜率 +0.2~+0.5 kg/周；PHASE-02 不超 `maintainBandPct`；SLE-01、REC-02。
- 证据：中（ISSN 2017、ISSN Diets 2017、ACSM 2016）；与 END 组合时中等。
- 冲突：与 CUT/PEAK；模式 `cap` / `block`。

#### MX-RECOVER-B-REFUEL（称重后恢复 × 恢复期）

- 策略：ORS 1–1.5 L/h、钠 50–90 mmol/L；糖原耗尽 8–12 g/kg（高糖原回补）或轻度限制 4–7 g/kg（低体积分阶段回补），两段独立，不得取 7–8 中间值；蛋白 20–40 g；逐步加回纤维；24h 体重回升≥50%。
- 时机：先补液再补糖；快碳 ≤60 g/h；蛋白与碳水同餐。
- 额外字段：无新增（复用 `postWeighIn`、`giSymptoms`）。
- 监测：HYD-04、REC-01、REC-04、GI-01。
- 证据：强（ISSN 2025 第 12–15 条、ACSM 2007、ACSM 2016）。
- 冲突：与 CUT；模式 `forbid`。

### 2.7 与现有 4 阶段共存

| 维度 | 阶段负责 | 目标负责 |
|---|---|---|
| 规则开关 | `activeRuleIds` / `suppressedRuleIds` | 不碰 |
| 必填字段 | `fieldSchema.required/critical` | 只追加可选字段 |
| 评分权重 | `metricWeights` | 不碰 |
| 主告警排序 | `primaryAlertTypes` | 不碰 |
| 基础分 | `score` | 不碰 |
| 目标合法性 | 列 = 阶段，决定格子 N/A | 目标组合与冲突 |
| 目标策略 | 格子按列不同 | 策略卡内容 |
| 目标评分 | 不参与 | `goalAdherence` 独立，不进 `score`、不进任何总分 |

补充规则：

1. `fieldsFor(phase, goals?)` 保持向后兼容；不传 `goals` 时输出与现在完全一样；传了只在 `optional` 里追加目标字段。
2. `suggestPhase()` 不变。目标与阶段不匹配时，由 `GOAL-01` 提示“改阶段或改目标”，不自动改阶段。
3. 阶段切换后目标计划重算；历史日志按 `phaseEffectiveDate` / `goalEffectiveDate` 解释，不回溯改标签。
4. 阶段抑制的 owner 规则不能被目标层“复活”。例如 maintain/cut 期 `GI-01` 被抑制，GI 目标只进“目标横幅”（由 `goalBlockers.phase_suppressed` 驱动），不进 `alerts`。
5. 营养师建议快照冻结时同时冻结 `goalPlan` 与 `goalMatrixVersion`。

---

## 3. 目标计划在引擎中的位置

### 3.1 四个选项的取舍

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A 新增规则集 | 每个复合目标一套 GOAL 规则 | 可审计 | 18 条会膨胀到 40+；与 HYD/PRO/SLE 重复；同一现象多处扣分 | 不推荐 |
| B 扩展 `evaluate` 输入并改阈值/权重 | 把目标权重乘进 `metricWeights` | 改动少 | `score` 漂移、历史建议不可比；权重无法表达 veto/cap 这类非线性冲突 | 不推荐 |
| C 阶段之上叠一层目标计划 | 新增纯数据 + 纯函数，`evaluate` 只消费 `goalPlan` | 不动 18 条规则与评分；可审计；可开关 | 多一个模块，需要同步多份云函数 lib | **推荐** |
| D 目标权重乘法 | 每个目标给指标加权 | 看起来直观 | 两个目标会重复放大同一指标；权重合计不再是 100；无法表达“禁止/封顶” | 不推荐 |

### 3.2 落点

- `data/goalMatrix.js`：15 个原子、27 个组合、60 格矩阵、冲突边、优先级、证据状态。纯数据，双端共用。
- `utils/goals.js`：`validateGoals()`、`resolveConflicts()`、`buildGoalPlan()`、`goalFields()`、`goalAdherence()`。纯函数，不依赖 `wx.*`。
- `evaluate(rawLog, ctx)`：
  - 输入新增 `ctx.goals`（存在时优先于 `profile.goals`，用于未保存目标预览与复核）或 `profile.goals`；二者都不传时 `goals=[]`；最多 3 个计入名额 + ≤1 个 `G-IMM` 监测。
  - 派生输入：`ctx.guardrailRed`（G4 从现有红灯汇总，见 §6.3）、`ctx.refeed`（周报/复核适配层计算，见 §7.6）、`ctx.eaKcalKgFfm`（G4 由 `bodyFatPct` + 体重 + 摄入计算，见 §7.6）。三者都不落库。
  - GOAL-02 只读 `log.training` + `log.nextPlan` + 生效目标（`ctx.goals` 优先，否则 `profile.goals`）；**不引入 `ctx.recentTraining`**，不判“本周负荷陡增”，周负荷留给周报。
  - 先 `buildGoalPlan()`，再走原有阶段逻辑。
  - 原有 `emit()`、`active` 映射、`metricWeights`、`score` 全部不动。
  - 新增 `emitGoal()` 只用于 `GOAL-01/02`。
  - `goalBlockers` 不是告警，而是“被护栏挡住”的结构，引用现有告警的 `ruleId` + `evidence`。
  - `buildCoachSummary()` 追加目标摘要，但不改变原有字段。
  - `goalAdherence` 是独立评分，**不进 `score`、不进 `level`、不进 `headline`、不进任何综合总分**；不存在“目标分 + 阶段分”的加权合计。

### 3.3 现象所有权与防重复扣分

| 现象 | 唯一 owner 规则 | 目标层能做什么 |
|---|---|---|
| 训练脱水/补液 | HYD-01/02/03/04/05 | 只读 |
| 蛋白总量/分配 | PRO-01/02 | 只读 |
| 能量盈亏 | ENE-01 | 只读 |
| 减重速率/维持偏离 | PHASE-01/02 | 只读 |
| 睡眠 | SLE-01 | 只读 + 写 `goalBlockers` |
| 酸痛/计划冲突 | REC-02 | 只读 + 写 `goalBlockers` |
| 晨脉 | REC-03 | 只读 |
| 胃肠 | GI-01 | 只读 |
| 补剂 | SUP-01 | 只读 |
| 记录不足 | LOG-01 | 只读 |
| 称重后恢复 | REC-01/04 | 只读 |
| 目标-阶段互斥 | GOAL-01（新增 owner） | 可 emit |
| 目标-目标执行冲突 | GOAL-02（新增 owner） | 可 emit |
| 目标被护栏否决 | 无新 owner | 只写 `goalBlockers`，不 emit |

三条硬规则：

1. 一个现象只能有一个 owner 规则；目标层不能为同一现象再 emit 一条。
2. `goalAdherence` 只统计阶段评分没覆盖的“目标独有行为”：训练前/后碳水时机、`training.quality`、refeed 周期、计划执行率。睡眠、酸痛、体重速率、蛋白总量这些已经在 `score` 里的，不得再进 `goalAdherence`；`goalAdherence` 独立展示，不并入任何总分。
3. 固定测试：睡眠 5.5h + END+SLE 目标 → 仍然只有 1 条 `SLE-01` 告警，`goalBlockers` 多 1 条引用，`alerts.length` 与无目标时一致；CUT+POW 且周降>1% → 只有 `PHASE-01`，`GOAL-02` 不因体重速率触发。

---

## 4. 复合目标配方 C01–C27

| 编号 | 组合 | 主导 | 让步方式 / 护栏动作 | 关键策略 | 证据 | 触发阶段 |
|---|---|---|---|---|---|---|
| C01 | 爆发+减重（POW+CUT） | B-CUT | cap | 缺口≤400；砍辅助量不砍强度；P 2.0–2.4；C 3–5 | 强 / 保爆发中等 | cut |
| C02 | 爆发+控级别（POW+HOLD） | P-POW | cap | HOLD 作边界 ±350；P 1.6–2.2；C 4–6 | 中强 | maintain / cut |
| C03 | 速度+控级别（SPD+HOLD） | P-SPD | cap | HOLD 作边界；速度课前碳水充足；睡眠≥7 | 中 | maintain / cut |
| C04 | 速度+减脂（SPD+CUT） | B-CUT | cap | 速度日不加深缺口；P 2.0–2.4；C 3–5 | 中 | cut |
| C05 | 增肌+耐力（HYP+END） | 阶段敏感 | sequence | 非赛季 HYP、赛前 END；两练间隔≥6h；C 4–7；P 1.8–2.2 | 中（组合间接） | maintain / cut |
| C06 | 增肌+控级别（HYP+HOLD） | HYP / HOLD | cap | 非赛季 HYP，赛前 HOLD；盈余≤400 | 中强 | maintain / cut |
| C07 | 增肌+睡眠（HYP+SLE） | SLE 红灯时 SLE | cap / sequence | 睡眠<6.5 不加量；P 1.8–2.2 | 中 | 全阶段 |
| C08 | 耐力+减脂（END+CUT） | B-CUT | cap | 缺口≤400；C≥3；大负荷日不加深 | 中 | cut |
| C09 | 耐力+控级别（END+HOLD） | P-END | cap | HOLD 作边界；C 4–7；两练间隔≥6h | 中 | maintain / cut |
| C10 | 大负荷+睡眠（END+SLE） | SLE 红灯时 SLE | cap | 睡眠<6 次日强度-20%；C 4–7；训练后补糖 | 强 | 全阶段 |
| C11 | 控重+精力（HOLD+SLE） | B-HOLD | monitor | 只监测 `mood.fatigue`/睡眠/晨脉；精力按 G-SLE 下游处理；不加深缺口 | 弱 | maintain / cut |
| C12 | 减脂+精力（CUT+SLE） | B-CUT | cap | 疲劳≥4 时缺口不加深；C≥3 | weak（`targets=null`） | cut |
| C13 | 减脂+胃肠（CUT+GI） | GI 红灯时 GI | cap | 低纤维、小体积、分餐；缺口不加深 | 中 | cut |
| C14 | 微调+胃肠（PEAK+GI） | B-PEAK | cap | GI 硬约束；低纤维低脂小体积；快碳≤60 g/h | 强 | peak |
| C15 | 微调+爆发（PEAK+POW） | B-PEAK | cap | 只保强度不加量；咖啡因按计划；补水按计划 | 强/中 | peak |
| C16 | 称重后恢复+控级别（REFUEL+HOLD） | B-REFUEL | sequence | 先 24h 补液补糖，再回维持 | 强 | recover |
| C17 | 称重后恢复+增肌（REFUEL+HYP） | B-REFUEL | sequence | 先恢复体液与糖原，再谈增肌 | 强 | recover |
| C18 | 减脂+能量可用性（CUT+EA） | G-EA | cap（护栏动作 `veto`，非第七种模式） | EA<30 否决加深缺口；缺口≤300–400 | 强 | cut |
| C19 | 大负荷+免疫（END+IMM） | P-END | monitor（G-IMM 只监测，无 `veto`） | P-END 是主目标；感染期不加大负荷（人工决定）；系统只提示，不出数值处方 | 弱 | 全阶段 |
| C20 | 增肌+耐力+控级别（HYP+END+HOLD） | B-HOLD | sequence / cap | 两练序贯；容量封顶；盈余≤400 | 组合弱 | maintain |
| C21 | 爆发+减重+睡眠（POW+CUT+SLE） | SLE 红灯时 SLE | cap | 缺口≤400；强度不砍；睡眠<6 不加量 | 组合弱 | cut |
| C22 | 控重+精力+胃肠（HOLD+SLE+GI） | GI 红灯时 GI | monitor / cap | 低纤维小体积；精力按 G-SLE 下游处理 | 弱 | maintain / cut |
| C23 | 增肌+控级别（青少年/级别迁移，GAIN+HOLD） | B-HOLD | block | 赛前禁止 GAIN；按生长曲线定盈余；`G-MED` 只作医疗转诊提示，写 `profile.note`，不写入 `profile.goals`、不占名额、不做 lead | 健康强 / 增肌弱 | maintain |
| C24 | 技术+精力（SKL+SLE） | P-SKL | monitor | 不空腹；技术日不加深缺口；精力按 G-SLE 下游处理 | 弱 | maintain / cut / peak |
| C25 | 微调+睡眠（PEAK+SLE） | B-PEAK | cap | 睡眠 7–9h 硬约束；固定作息 | 强 | peak |
| C26 | 减脂+保肌（CUT+HYP） | B-CUT | cap | 蛋白 2.0–2.4；力量维持不加量；缺口≤400 | 强 | cut |
| C27 | 增肌+耐力（GAIN+END） | B-GAIN | cap | 仅非赛季；碳水优先；盈余≤400 | 中 | maintain |

---

## 5. 冲突与优先级

### 5.1 冲突边

| 冲突对 | 冲突本质 | 处理方式（六种模式 / 护栏动作） |
|---|---|---|
| CUT ↔ GAIN | 能量赤字 vs 盈余 | forbid：同一时间窗只允许一个 |
| CUT ↔ HYP | 赤字 vs 合成 | cap：CUT 主导，HYP 只保肌不加量 |
| CUT ↔ END | 赤字/低糖 vs 高碳水/恢复 | cap：缺口≤400，碳水≥3 g/kg |
| CUT ↔ POW | 赤字/低糖原 vs 高强度 | cap：砍辅助量，不砍强度；缺口封顶 |
| PEAK ↔ CUT/GAIN/HYP/END | 微调期定义就是“不动热量缺口” | forbid：阶段直接禁止 |
| REFUEL ↔ CUT | 补液补糖 vs 继续减重 | forbid：恢复期不做减脂决策 |
| HOLD ↔ GAIN | 体重稳定 vs 增重 | block：赛前<12 周 GAIN 转 HOLD+力量维持 |
| SPD ↔ HYP/END | 神经新鲜 vs 高容量疲劳 | sequence：速度课排前、间隔≥6h |
| POW ↔ END | 高强度低容量 vs 高容量 | sequence / cap：不叠在同一天 |
| END ↔ SLE | 大负荷 vs 睡眠 | cap：睡眠<6 次日强度-20%；红灯时叠加护栏动作 `veto`（`veto` 不是让步模式） |
| GI ↔ END/GAIN/HYP | 高纤维/大体积 vs 耐受 | cap：低纤维、小体积、分餐 |
| EA ↔ CUT | 低能量可用性 vs 减脂 | cap + 护栏动作 `veto`：EA 红灯否决加深缺口；`veto` 不进 `concessions[].mode` |
| IMM ↔ END/CUT | 免疫 vs 高负荷/赤字 | monitor：只提示，由营养师人工决定，不 veto |
| MED ↔ 全部 | 医疗安全 | 护栏动作 `veto`：绝对优先；不产生 `concessions` |

### 5.2 优先级栈 L0–L6

- **L0 医疗安全（MED）**：绝对否决。
- **L1 比赛时间窗与资格（PEAK / REFUEL / HOLD 到级别）**：阶段合法性优先。
- **L2 健康护栏（EA > GI > SLE；IMM 只监测，不参与否决）**：红灯时否决“用加练/加深缺口换比赛”的做法，**不否决比赛本身**。
- **L3 神经表现（SPD > POW）**：赛前 2 周内优先保神经新鲜。
- **L4 结构/体能（HYP / END）**：非赛季 HYP 优先，赛前 END 维持优先。
- **L5 体型（CUT > GAIN）**：赛前 12 周内 CUT；GAIN 只允许非赛季。
- **L6 辅助（SKL / IMM）**：只做监测，不让步主目标；`G-IMM` 不占 3 个名额。精力不属于 L6，统一由 L2 的 `G-SLE` 承接。

关键取舍：**L2 是“限制手段”，不是“取消比赛”**。睡眠不足时不是不让拳王称重，而是不允许用“再加练、再加深缺口”去换称重。

### 5.3 六种让步模式

| 模式 | 含义 | 例子 |
|---|---|---|
| forbid | 同一时间窗不允许共存 | PEAK+CUT、REFUEL+CUT |
| cap | 允许共存但封顶 | CUT+POW 缺口≤400、辅助量-20~30% |
| sequence | 时间分离 | HYP+END 两练间隔≥6h；REFUEL 先 24h 再增肌 |
| block | 当前阶段禁止，转到下一个时间窗 | 赛前 GAIN → 非赛季 |
| substitute | 换成等效目标 | 赛前 GAIN → HOLD + 力量维持 |
| monitor | 证据弱或只是信号，只提示不让步 | SKL / IMM（精力归 `G-SLE`） |

### 5.3.1 护栏动作（不是第七种让步模式）

`veto` 是护栏对“某个具体动作/当天做法”的绝对否决，属于**护栏动作**，不是六种让步模式之一。

| 概念 | 允许出现的位置 | 禁止出现的位置 |
|---|---|---|
| 六种让步模式 `forbid / cap / sequence / block / substitute / monitor` | `goalPlan.concessions[].mode` | 不得写入 `veto` |
| 护栏动作 `veto` | 数据层格子的 `legality='veto'`、`goalBlockers.action='veto'`、C18 的 `guardrailAction='veto'` | 不得写入 `concessions[].mode` |

- `veto` 只否决“加深缺口/加练/加量”等具体动作，不取消比赛、不取消目标、不改阶段。
- `PRIORITY_STACK` 的 L0–L6 任何层都只用于排序与说明，**不携带 `action` 字段**；优先级栈中的否决语义只能通过上述三处落地，任何层都不得设 `PRIORITY_STACK[].action`（含 `'veto'`）。
- C18（CUT+EA）用 `mode='cap'` + `guardrailAction='veto'`：CUT 仍保留，但 EA 红灯时不允许再加深缺口。
- C19（END+IMM）用 `mode='monitor'`，不加 `veto`：`G-IMM` 是弱证据名额外监测，只提示，由营养师人工决定。
- 旧数据若出现 `concessions[].mode='veto'`，视为迁移错误，必须改成 `cap`/`monitor` + 独立的 `guardrailAction='veto'`。

### 5.4 裁决输出

`goalPlan.concessions` 每项必须包含：

- `goalId`：被让步的目标原子。
- `mode`：只取六种之一（`forbid / cap / sequence / block / substitute / monitor`），**不得写 `veto`**。
- `guardrailAction`：可选，仅 `'veto'`；表示在让步之外护栏还要否决某个具体动作（如 C18 的“不得再加深缺口”）。该字段不是 `mode`，不参与六种模式统计。
- `reason`：为什么让步，必须引用优先级层级或冲突边。
- `ruleRefs`：引用的 owner 规则或 GOAL 规则 ID。
- `phaseWindow`：该裁决生效的阶段/时间窗。

名额外监测原子（当前仅 `G-IMM`）不参与冲突裁决，不产生 `concessions`，只写 `goalBlockers` / 目标横幅的 monitor 记录；其名额不计入 3 个主目标。

---

## 6. GOAL 规则与兼容要求

### 6.1 GOAL-01 目标与阶段互斥

| 字段 | 值 |
|---|---|
| ruleId | `GOAL-01` |
| name | 目标与阶段互斥 |
| logicSummary | 当生效目标（`ctx.goals` 优先，否则 `profile.goals`）中存在与当前阶段不合法（矩阵 N/A）的原子，或复合配方要求的时间窗与当前阶段不符，emit。典型：B-GAIN 在 cut/peak/recover；B-GAIN 在 maintain 但距称重<84 天；B-CUT 在 maintain/peak/recover；B-PEAK 不在 peak；B-REFUEL 不在 recover；B-HOLD 在 peak/recover；B-HOLD 在 cut 但 `gapPct>1.5`；P-POW/P-SPD/P-END/P-SKL 在 recover；P-HYP 在 peak/recover。 |
| thresholds | **red**：目标要求的能量方向与当前阶段直接相反、且无法在当前窗口执行（`B-GAIN` 在 cut；`B-CUT` 在 maintain/peak/recover；`B-HOLD` 在 cut 但 `gapPct>1.5`）。**amber**：当前阶段窗口未到、可延后（`B-GAIN` 在 maintain 但距称重<84 天、`B-GAIN` 在 peak/recover、`B-HOLD` 在 peak/recover、`B-PEAK` 不在 peak、`B-REFUEL` 不在 recover、`P-POW/P-SPD/P-END/P-SKL` 在 recover、`P-HYP` 在 peak/recover）。`goals=[]` → 不 emit |
| 拦截行为 | 不自动改阶段或目标；red 进入 `alerts` 并按现有 red 排序，提示营养师二选一：改目标或改阶段；amber 只提示，不阻断当天执行 |
| applicablePhases | maintain / cut / peak / recover |
| requiresHumanFollowUp | true |
| sources | ISSN 2025（阶段定义与水盐操作）；ACSM 2016（能量与体重管理方向） |
| kbIds | `wc-phases`, `wc-rate` |
| reviewStatus | active |
| notes | 只提示，不自动改阶段；给出两个选项：改目标或改阶段。`setGoals` 已按当前阶段拒绝不合法目标，因此本规则的实际触发场景主要是“目标设定后阶段被 `setPhase` 改掉”；`setPhase` 不自动清理目标。 |

`GOAL-01` 分级判定表（穷举本文所有 N/A 情形）：

| 非法情形 | 级别 | 判定口径 |
|---|---|---|
| `B-GAIN` 在 cut | red | 赤字与盈余方向相反，当前窗口不可执行 |
| `B-CUT` 在 maintain / peak / recover | red | 当前窗口不制造缺口；引入缺口会改变能量方向 |
| `B-HOLD` 在 cut 但 `gapPct>1.5` | red | 继续维持会停止缺口、危及达标；当前窗口应继续 cut |
| `B-GAIN` 在 maintain 但距称重<84 天 | amber | 增重窗口未到，可延后到赛后/非赛季 |
| `B-GAIN` 在 peak / recover | amber | 增重窗口未到，可延后到非赛季 maintain |
| `B-HOLD` 在 peak / recover | amber | 微调/恢复期不做热量维持决策，可延后 |
| `B-PEAK` 不在 peak | amber | 水盐微调窗口未到或已过，可延后/不再执行 |
| `B-REFUEL` 不在 recover | amber | 称重后恢复窗口未到，可延后 |
| `P-POW` / `P-SPD` / `P-SKL` 在 recover | amber | 恢复期不排训练课，可延后 |
| `P-END` 在 recover | amber | 恢复期不排耐力/体能课，可延后 |
| `P-HYP` 在 peak / recover | amber | 微调/恢复期不安排增肌，可延后 |

判定顺序：先看是否 `legality=illegal`；再看“是否要求当前窗口立即改变能量方向”——是则 red，否则 amber。red/amber 只影响告警级别与是否阻断当天执行，**都不自动改阶段、不自动删目标**。red 进入 `alerts` 并按现有 red 排序；amber 只提示，不阻断当天执行。

### 6.2 GOAL-02 目标执行冲突

| 字段 | 值 |
|---|---|
| ruleId | `GOAL-02` |
| name | 目标执行冲突 |
| logicSummary | 当两个原子在同一日/相邻日产生不可同时执行的负荷或时机冲突，且冲突未由现有规则覆盖：POW+END 同日高容量；HYP+END 同日两练总量超上限；SPD 前一日大负荷；PEAK+POW 赛前 24h 加量；HYP+END+HOLD 三目标同时要求盈余与控重。判定依据仅 `log.training` + `log.nextPlan` + 生效目标（`ctx.goals` 优先，否则 `profile.goals`）；**本轮不引入 `ctx.recentTraining`**，不判“本周负荷陡增”，周负荷留给周报/趋势页。 |
| thresholds | 同一日两个计入名额的高强度目标 → amber；三个计入名额的目标且时间窗<14 天 → red；仅相邻日 → info；`G-IMM` 不计入“三个目标” |
| 拦截行为 | 不自动改训练计划；amber 建议重排/降量；red 进入 `alerts` 并 `requiresHumanFollowUp=true`；`goalPlan.concessions` 写 `sequence` 或 `cap` |
| applicablePhases | maintain / cut / peak / recover |
| requiresHumanFollowUp | true |
| sources | ACSM 2016（能量与训练前后营养安排）；Meeusen 2013（负荷与恢复不足的累积风险） |
| kbIds | `rec-load`, `rec-soreness`, `carb-training` |
| reviewStatus | active |
| notes | 不判体重速率、蛋白、睡眠、脱水；这些有 owner 规则。 |

### 6.3 不新增 GOAL-03 护栏否决

护栏红灯不新增规则，而是：

**输入契约**：`ctx.guardrailRed` 由 G4 在基础规则 `emit` 之后汇总，类型 `string[]`，只含红灯护栏原子 `G-SLE / G-GI / G-EA`，去重、按 L2 优先级 `G-EA → G-GI → G-SLE` 顺序；`G-IMM` 是 `role=monitor`，永远不进该数组；`G-MED` 是人工标记，也不进该数组。映射：`SLE-01` red→`G-SLE`，`GI-01` red→`G-GI`，`bodyFatPct` 已知且 `eaKcalKgFfm<30`→`G-EA`。缺失时为 `[]`。该字段是 `evaluate` 的派生输入，不落库、不进 `logs`。

1. 复用现有 owner 告警（如 `SLE-01`、`GI-01`、`ENE-01`、`REC-03`）。
2. 在 `goalBlockers` 里写一条引用，`blockerType='guardrail'`，`ruleId` 指向 owner 规则。
3. UI 只显示一条“今日目标被护栏否决/降级”横幅，不重复出告警。
4. 如果 owner 规则被阶段抑制，`goalBlockers` 仍可记录 `suppressedByPhase=true`，但不得 emit 新告警。
5. maintain/cut 期的 `G-GI` 目标只通过“目标横幅”展示（`blockerType='phase_suppressed'`，`action='monitor'`），不进 `alerts`；这是本阶段唯一允许的 GI 目标提示方式。
6. `G-IMM` 是名额外监测原子，没有 owner 规则：只写 `blockerType='evidence_weak'` 或 `data_missing`、`ruleId=null`、`action='monitor'`，不产生 guardrail veto。
7. `G-MED` 是人工安全标记，不是可选目标，不进入自动 `goalBlockers`；由营养师在复核页人工处理，`goalPlan.notes` 可提示。
8. `G-EA` 没有 owner 规则：`EA<30` 只写 `goalBlockers`（`blockerType='guardrail'`、`ruleId=null`、`action='veto'` 或 `'cap'`），不进 `alerts`；`AS-05` 是 KB 锚点，不是规则 ID。`action='veto'` 是护栏动作，不进入 `concessions[].mode`。

### 6.4 对现有 18 条规则和评分的影响

| 项目 | 影响 |
|---|---|
| 现有 18 条规则 | 全部保留；阈值、`applicablePhases`、`requiresHumanFollowUp` 不变 |
| 新增规则 | 只新增 `GOAL-01/02`，总数 18→20 |
| 规则开关 | `PHASE_PROFILES.activeRuleIds` 四个阶段都追加 `GOAL-01/02`；`suppressedRuleIds` 不变 |
| `score` | 不变；`metricWeights`、`numSum/denSum`、`level/levelTone` 不动 |
| `alerts` 排序 | 不变；GOAL 告警作为普通告警参与现有 `LEVEL_W` 排序 |
| `primaryAlertTypes` | 不变；GOAL 告警不抢阶段主告警位置 |
| `goalAdherence` | 独立 0–100 或 `null`；**不参与** `score`、`level`、`headline`，**不进任何总分/综合分** |
| `tips` | 基础 tips 不变；目标 tips 只在有空位时追加，最多仍为 3 条 |
| `coachSummary` | 目标为空时不变；目标非空时追加目标摘要 |
| `RULES_VERSION` | v3.0 → v4.0 |
| 结果结构 `version` | 保持 3；`RULES_VERSION` 是模块常量，不是结果字段 |

### 6.5 无目标时的严格向后兼容

`goals=[]` 时必须满足：

1. 输出对象**不包含** `goalPlan`、`goalAdherence`、`goalBlockers`、`goalMatrixVersion` 四个键。
2. `activeRuleIds` 过滤掉 `GOAL-01/02`，与 v3.0 的 18 条完全一致。
3. `suppressedRuleIds`、`suppressed`、`missingRequired`、`score`、`level`、`levelTone`、`headline`、`alerts`、`tips`、`coachSummary` 与 v3.0 对同一 fixture 逐字段一致；`deepStrictEqual` 必须覆盖这些字段及完整内容，不能只比键序或 `score`。
4. `version` 仍为 3。
5. 用 `deepStrictEqual` 对无目标完整输出与 v3.0 基线 fixture 做深比较；除 `RULES_VERSION` 常量外不做任何断言豁免。仅比较键序、`score` 或 `alerts` 不算通过。

`goals` 非空时才追加：

- `goalPlan`
- `goalAdherence`
- `goalBlockers`
- `goalMatrixVersion`
- `activeRuleIds` 中包含 `GOAL-01/02`
- `coachSummary` 追加目标摘要
- `tips` 在空位追加目标提示

### 6.6 建议快照

`advice` 快照新增（加法字段，不改旧字段）：

- `rulesVersion`：`v4.0`
- `goalMatrixVersion`
- `goalPlan`
- `goalAdherence`
- `goalBlockers`
- `goalEffectiveDate` / `goalSource`（从 profile 复制，便于审计）

旧快照缺这些字段时显示“未设目标”，不做迁移。

### 6.7 云函数同步注意

- `rules.js` 新增 `require('../data/goalMatrix.js')`，同步到云函数时要改成 `require('./goalMatrix.js')`。
- `sync-shared.sh` 目前只同步 `saveLog`、`getFeed`、`coachApi`，并额外处理 `visionFood`；**`advice` 目前不在同步列表**，但 `advice/lib/rules.js` 存在并调用 `evaluate`。G4 必须把 `advice` 加入同步循环，并在 `preflight.js` 的同步检查列表中加入 `advice`。
- `goalMatrix.js`、`goals.js` 必须一起复制到各云函数 `lib/`，否则云端目标计划与小程序端不一致。

---

## 7. 输出字段契约

### 7.1 `goalPlan`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `goals` | array | 是 | 每项 `{ id, name, dimension, role, source, countsTowardQuota }`；`role` = `lead / concede / monitor`；`source` 当前固定 `'nutritionist'`（不预留其他枚举）；最多 4 项（≤3 个计入名额 + ≤1 个 `G-IMM` 监测） |
| `atoms` | string[] | 是 | 去重后的目标原子 ID：最多 3 个计入名额 + 至多 1 个 `G-IMM` 监测（总长度 ≤4） |
| `composites` | string[] | 是 | 命中的 C01–C27 编号 |
| `phase` | string | 是 | 当前生效阶段（`profile.phase` 或 `ctx.phase`），不是目标自己推导的阶段 |
| `legality` | string | 是 | `legal / partial / illegal`；`partial` 只在“阶段被改后”的复审场景出现（见下）；`illegal` 表示当前阶段有目标 N/A，`resolveGoalPlan` 直接拒绝、`goalPlan=null` |
| `lead` | string|null | 是 | 主导目标原子 ID，必须是 `atoms` 中 `occupiesSlot=true` 的主目标；`G-IMM`（monitor）与 `G-MED`（不可选标记）不能做 lead；无主目标时为 `null` |
| `concessions` | array | 是 | 每项 `{ goalId, mode, reason, ruleRefs, phaseWindow, guardrailAction? }`；`mode` 只取六种，`guardrailAction` 仅 `'veto'` |
| `targets` | object|null | 是 | `protein / carb / fat / energyBalance / hydration / sleepHours`；弱证据目标可为 `null` |
| `cells` | array | 是 | 每项 `{ goalId, phase, cellId, legal, evidenceStatus, reviewStatus }` |
| `evidenceStatus` | string | 是 | `strong / moderate / weak / mixed` |
| `notes` | string[] | 是 | 人类可读提示，最多 5 条 |

名额核算：`goals.filter(g => g.countsTowardQuota)` 长度 ≤3；`countsTowardQuota=false` 的项只能是 `G-IMM`，且 ≤1，其 `role` 固定为 `monitor`。`atoms` 顺序与 `profile.goals` 一致（`G-IMM` 排最后）；不设 `goalPriority`，数组顺序即优先级（同层冲突时第一个优先，L0–L2 护栏可临时越级）。历史数据若 `G-IMM` 不在末尾，`buildGoalPlan` 将其归一化到末尾，不改变主目标的相对顺序。

**`legality` 三态判定（定稿）**：

- `legal`：`profile.goals` 全部在当前阶段合法，且没有目标被 `forbid` 冲突边裁掉。
- `partial`：目标集合本身仍合法，但 `forbid` 冲突边裁掉至少一个目标。**只在“阶段被改后”的复审场景出现**：`setPhase` 成功后，复核页用旧 `profile.goals` 对新阶段调用 `resolveGoalPlan`，若有目标被裁掉，返回 `legality='partial'`。初次 `setGoals` 只接受 `legal` 组合；若预检为 `partial`，整次不落库，返回 `E_GOAL_CONFLICT`，由营养师先改目标（G6 负责）。
- `illegal`：当前阶段至少一个目标在矩阵里是 `N/A`；`resolveGoalPlan` 直接拒绝，`goalPlan=null`，`GOAL-01` 提示“改目标或改阶段”。

前端表现：复核页出现 `partial` 时显示 amber 横幅“部分目标被阶段冲突裁剪”，列出“保留 / 裁剪”两组目标，**不自动删除 `profile.goals`**；营养师确认后，`setGoals` 只写入保留目标，裁剪目标需重新选择。拳王端只显示最终保留的目标，不显示裁剪过程。

`targets` 每项结构：

`{ min, max, unit, sourceType, sourceId, advisory }`；B-REFUEL 的 `carb` 是例外，为 `[[4,7],[8,12]]` 区间数组（见下）。

- `sourceType`：`rule` / `kb` / `source`
- `sourceId`：如 `PRO-01`、`carb-training`、`issn2025`
- `advisory`：`true` 表示只是建议区间，不是告警阈值；弱证据目标必须 `advisory=true` 或 `targets=null`

`targets` 子字段：

| key | 单位 | 典型来源 |
|---|---|---|
| `protein` | g/kg | PRO-01、ISSN 2017 |
| `carb` | g/kg | `carb-training`、ACSM 2016；B-REFUEL 为双区间，见下 |
| `fat` | g/kg | `acsm2016`（脂肪下限） |
| `energyBalance` | kcal/天 | ENE-01、PHASE-01 |
| `hydration` | ml 或 % | HYD-01/04/05、`hydrationPlan` |
| `sleepHours` | h | SLE-01、Walsh 2021 |

**B-REFUEL 的 `carb` 编码（定稿）**：`targets.carb` 必须是区间数组 `[[4,7],[8,12]]`（单位 g/kg），不能写成 `{ min: 4, max: 12 }` 的连续区间，也不得生成 `7 < C < 8` 的值。`4–7` 对应轻度限制/低体积分阶段回补，`8–12` 对应糖原耗尽后的高糖原回补；两段是不同执行协议，合并会制造没有证据支持的中间值。选择依据是 `postWeighIn` 记录的称重消耗与 `giSymptoms` 耐受，不取中间值。

### 7.2 `goalAdherence`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `score` | number|null | 是 | 0–100；无数据时 `null` |
| `level` | string | 是 | `ok / amber / red / unknown` |
| `components` | array | 是 | 每项 `{ id, label, value, weight, dataOk, sourceFields, evidenceStatus }` |
| `unavailableReason` | string | 否 | `no_goals / weak_evidence / no_startTime / no_meal_time / no_quality / bad_quality / not_weekly / no_data` |

`components` 只允许以下三类，且只从“强证据、占名额”的原子触发；弱证据目标不产生组件：

| id | 数据来源 | 适用目标 | 分值口径 |
|---|---|---|---|
| `fuelTiming` | `training.startTime` + `meals` | POW / SPD / END / SKL / HYP | 训练开始前 180 分钟至开始后 120 分钟内，有任一带时间且碳水>0 的餐 → 100；否则 0。缺 `startTime` 或无带时间碳水餐 → 跳过 |
| `sessionQuality` | `training.quality` | POW / SPD / SKL | `quality × 20`，取值 20–100；缺失或超出 1–5 → 跳过 |
| `refeedCadence` | `ctx.refeed`（周报/复核派生） | B-CUT | `rate×100` 或 `okDays/totalDays×100` 或 `ok?100:0`，取值 0–100；缺失 → 跳过 |

`ctx.refeed` 的完整输出为 `{ rate, okDays, totalDays, ok, plannedDays, actualDays, successRate, targetCarbsGPerKg, targetCarbsG }`；其中 `plannedDays / actualDays / successRate` 只作展示别名，`refeedCadence` 评分只消费 `rate / okDays / totalDays`（或 `ok`）；`targetCarbsGPerKg / targetCarbsG` 只用于展示目标碳水。

**权重与总分（定稿）**：

1. **可用组件等权**：1 个组件权重 1.0；2 个各 0.5；3 个按 0.34 / 0.33 / 0.33，`components[].weight` 合计必须为 1.0。
2. **缺失处理**：单个组件缺数据时**跳过该组件并对剩余组件重新归一**，不把整项判 `unknown`。例如 POW 目标缺 `quality` 但 `startTime` 可用，只按 `fuelTiming` 计。
3. **最少组件数**：至少 1 个可用组件即可评分；0 个可用组件才返回 `score=null / level='unknown'`，`unavailableReason` 取第一个缺失原因（如 `no_startTime`、`no_quality`、`not_weekly`）。
4. **弱证据整项**：以格子证据状态为准——`plan.atoms` 中没有任何“`cell.evidenceStatus !== 'weak'` 且 `occupiesSlot=true`”的原子时，直接 `score=null / unavailableReason='weak_evidence'`，不进入组件计算；不得改用原子级 `evidenceDefault` 做过滤。
5. **取整**：组件值按各自口径取整（`fuelTiming` 0/100；`sessionQuality = quality×20`；`refeed` 先 `Math.round(rate×100)` 或 `Math.round(okDays/totalDays×100)`）；总分只对加权和做**一次** `Math.round`，输出 0–100 整数。
6. **分级**：≥85 `ok`，70–84 `amber`，<70 `red`；`score=null` 时 `level='unknown'`。
7. `components[].dataOk` 对进入计算的组件固定 `true`；`sourceFields` 必须写明上表来源；`refeedCadence.sourceFields` 固定为 `['weekly.refeed']`，`ctx.refeed` 只是周报/复核适配层的运行时载体，不是入库字段；`evidenceStatus` 取该计划强证据原子的综合证据级（全 strong 则 strong，否则 moderate）。

硬约束：

- 不得包含睡眠、酸痛、体重速率、蛋白总量、能量盈亏；这些已由 `score` 负责。
- `score=null` 时 `level='unknown'`，不得判红。
- `goalAdherence` 不参与 `score`、`level`、`headline`，不进入任何总分/综合分，不产生新告警。

### 7.3 `goalBlockers`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `goalId` | string | 是 | 被挡住的目标原子 |
| `blockerType` | string | 是 | `guardrail / phase_suppressed / evidence_weak / data_missing / goal_illegal / goal_conflict` |
| `ruleId` | string\|null | 是 | owner 规则或 `GOAL-01/02`；`evidence_weak` / `data_missing` 允许为 `null` |
| `level` | string | 是 | `red / amber / info` |
| `action` | string | 是 | `veto / cap / sequence / monitor` |
| `message` | string | 是 | 给营养师/拳王的一句话 |
| `suppressedByPhase` | boolean | 是 | owner 规则是否被阶段抑制 |

硬约束：

- `goalBlockers` 不是告警，不进入 `alerts`。
- `guardrail` 类型必须引用已存在的 owner 告警；没有 owner 告警时不能凭空造。
- `phase_suppressed` 类型只记录并驱动目标横幅，不 emit 告警。

### 7.4 `goalMatrixVersion`

- 类型：string，当前 `v1.0`。
- 变更范围：15 个原子、27 个配方、60 格矩阵、冲突边、优先级、证据状态任一变化都要升版。
- 与 `RULES_VERSION` 分开：`RULES_VERSION` 管引擎/规则集，`goalMatrixVersion` 管目标数据。
- `advice` 快照必须同时存两个版本号。

### 7.5 结构示例（数据，不是实现代码）

```json
{
  "goalMatrixVersion": "v1.0",
  "goalPlan": {
    "goals": [
      { "id": "B-CUT", "name": "减脂", "dimension": "body", "role": "lead", "source": "nutritionist", "countsTowardQuota": true },
      { "id": "P-POW", "name": "爆发/最大力量", "dimension": "performance", "role": "concede", "source": "nutritionist", "countsTowardQuota": true }
    ],
    "atoms": ["B-CUT", "P-POW"],
    "composites": ["C01"],
    "phase": "cut",
    "legality": "legal",
    "lead": "B-CUT",
    "concessions": [
      { "goalId": "P-POW", "mode": "cap", "reason": "L5 体型优先；缺口封顶 400", "ruleRefs": ["PHASE-01", "PRO-01"], "phaseWindow": "cut" }
    ],
    "targets": {
      "protein": { "min": 2.0, "max": 2.4, "unit": "g/kg", "sourceType": "rule", "sourceId": "PRO-01", "advisory": true },
      "carb": { "min": 3, "max": 5, "unit": "g/kg", "sourceType": "kb", "sourceId": "carb-training", "advisory": true },
      "energyBalance": { "min": -400, "max": -300, "unit": "kcal", "sourceType": "rule", "sourceId": "ENE-01", "advisory": true }
    },
    "cells": [
      { "goalId": "P-POW", "phase": "cut", "cellId": "MX-CUT-P-POW", "legal": true, "evidenceStatus": "strong", "reviewStatus": "active" }
    ],
    "evidenceStatus": "strong",
    "notes": ["强度不砍，砍辅助量", "缺口封顶 400 kcal"]
  },
  "goalAdherence": {
    "score": null,
    "level": "unknown",
    "components": [],
    "unavailableReason": "no_startTime"
  },
  "goalBlockers": []
}
```

### 7.6 `ctx` 派生字段（不落库）

以下三个字段只存在于 `evaluate` 的调用上下文，**不写入 `logs`，不写入 `profile`**；缺失时按表内降级，不报“数据错误”。

| 字段 | 类型 / 结构 | 由谁产出 | 来源与算法 | 缺失时 |
|---|---|---|---|---|
| `ctx.guardrailRed` | `string[]`，元素为 `G-SLE / G-GI / G-EA` | G4 `evaluate` | 基础规则 `emit` 后汇总红灯：`SLE-01`→`G-SLE`、`GI-01`→`G-GI`、`bodyFatPct` 已知且 EA<30→`G-EA`；去重，按 L2 优先级 `G-EA → G-GI → G-SLE` | `[]`；不参与 lead 越级 |
| `ctx.refeed` | `{ rate?: 0–1; okDays?: int; totalDays?: int; ok?: boolean; plannedDays?: int; actualDays?: int; successRate?: 0–100; targetCarbsGPerKg?: number; targetCarbsG?: int }` | 周报/复核适配层（G6） | 取周报窗口 `weekly.fromDate/toDate`；`weekly.weight.weeklyRate/weeklyPct` 判断 cut 是否需要 refeed；计划天数按 `event.refeedDays → profile.refeedDays → null` 取值，`plannedDays = totalDays = min(计划天数, 窗口天数)`；`okDays` 为 `logs.meals[].carbs` 按日汇总达到 refeed 日目标（默认 6 g/kg，高于减脂常规 3–5）的天数；`rate=okDays/totalDays`，`actualDays=okDays`，`successRate=round(rate×100)`；消费端只用 `rate / okDays / totalDays` | 组件 `refeedCadence` 跳过并重归一；不判 unknown |
| `ctx.eaKcalKgFfm` | number（kcal/kg FFM） | G4 `evaluate` | `FFM = 最近 7 日晨重均值 × (1 − bodyFatPct/100)`；`EA = (摄入 kcal − 训练课净消耗 kcal) / FFM`；摄入来自 `meals` 汇总，训练课净消耗按 §7.6.1 估算，不用 `energy.tdee` | `G-EA` 写 `blockerType='data_missing'`、`action='monitor'`；不判红、不给数值 |

`weekly.js` 已输出结构化 `refeed`（字段见 §7.2，结构见本节），`ctx.refeed` 为其运行时载体；没有计划天数时 `goalAdherence.refeedCadence` 跳过并重归一，不阻断其他目标。

#### 7.6.1 训练课净消耗估算（EA 用）

训练课净消耗表 `TRAINING_MET`（存课型总 MET；任务口径中的 `TRAINING_NET_MET` 即这张表）按 `training.sessionType` 取值：

| sessionType | cardio | strength | technique | sparring | recovery | rest / 未知 |
|---|---|---|---|---|---|---|
| MET | 7.0 | 4.0 | 3.0 | 8.5 | 2.0 | 不估 |

`netKcal = (MET − 1) × 3.5 × 体重(kg) / 200 × 时长(min)`，体重取最近 7 日晨重均值。必须扣 1 MET：MET 表含静息代谢，EA 的分子要的是“训练额外消耗”；不扣会把静息重复计入运动消耗、系统性低估 EA。缺 `durationMin`、课型为 `rest`/未知或体重缺失时返回 `null`，`G-EA` 只写 `data_missing / monitor`。

该估算是**工程近似、不作为处方**：只服务 `G-EA` 的“数据不足/是否红灯”判断，不用于决定能量缺口、训练量或任何宏量处方。

---

## 8. 证据分级与使用约束

### 8.1 分级定义

| 状态 | 判定标准 | 输出限制 |
|---|---|---|
| strong | 至少 1 个一级来源（立场声明/共识/系统综述）且 anchor 具体，能挂到现有 rule/KB | 可给数值区间与时机 |
| moderate | 来源是相邻领域/间接证据，或强来源但组合是推断 | 可给方向与区间，文案标“间接证据” |
| weak | 现有 KB/规则没有直接锚点 | 只给监测与“请营养师确认”，禁止给数值处方 |
| mixed | 组合内既有 strong 也有 weak 分量 | 整体显示 mixed，每个 cell 保留自身状态 |

人工覆盖规则：营养师署名建议可以覆盖系统的“无数值处方”，但**不改变 `evidenceStatus`**；weak/mixed 徽标在拳王端继续保留，文案用“证据偏弱，已由营养师调整”。

### 8.2 每个格子的证据要求

1. `monitor` 必须引用现有 `ruleId` 或 KB id。
2. `strategy` 至少引用一个 `SRC` key 或 KB id。
3. `preflight` 校验 anchor 是否真实存在，防止文档写不存在的条目。
4. `weak` 格子的 `targets` 必须为 `null`，或所有 target `advisory=true` 且不出现具体克数。
5. 锚到 `PRO-01` / `PHASE-02` 的格子，`reviewStatus` 必须继承 `needs_review`，UI 显示“待复核”。
6. 人工覆盖不改 `evidenceStatus`；weak/mixed 徽标在拳王端始终保留。

### 8.3 明确标“证据偏弱（weak/mixed）”的目标

| 目标/组合 | 为什么弱 | 处理 |
|---|---|---|
| HOLD+SLE（控重+精力） | “精力”没有独立一级来源，按 `G-SLE` 的睡眠/恢复下游处理；若由低能量可用性导致，转 `G-EA` | 组合级弱；只监测，不改主食/热量，不给独立数值处方 |
| P-SKL / SKL+SLE / CUT+SKL（技术/战术、技术+精力、减脂+技术） | 没有“营养直接提升技术质量”的一级来源 | 弱；`macros=null`，时机与克数由营养师确认；只给“不空腹、补水、别在技术日加深缺口” |
| END+IMM（大负荷+免疫） | 当前 KB 没有免疫专项锚点 | 弱；只监测 `health.illness`，不承诺“吃某物防感冒” |
| 三目标组合 C20/C21/C22 | 单项目标有证据，组合级没有 | 标“组合证据偏弱”，只给策略与监测 |
| GAIN+HOLD（青少年/级别迁移） | 增肌与控重在青少年身上高度个体化 | 健康护栏强、增肌弱；必须营养师/医生共同确认 |
| PEAK+CUT、PEAK+GAIN | 阶段定义本身禁止 | 非法组合：`setGoals` 直接拒绝；历史/阶段变更后由 `GOAL-01` 拦 |
| “减重期保爆发” | 减重文献强，但“保爆发”的直接证据中等 | 标 moderate，不写成“一定不掉力量” |

### 8.4 不编造出处

- 需要但现有 KB 没有的来源（如免疫、concurrent training 营养），先标 `weak`。
- 后续要升级证据，必须先把来源加进 `knowledge.js` 的 `SRC`，写清 `verificationStatus`，再改 `goalMatrix`。
- 不得把“待复核阈值”（`PRO-01`、`PHASE-02`）包装成确定结论。

---

## 9. 数据与界面摘要

### 9.1 profile 新增字段

| 字段 | 类型 | 写入方 | 说明 |
|---|---|---|---|
| `goals` | string[]，有序；≤3 个计入名额 + ≤1 个 `G-IMM` 监测（总长度 ≤4） | 营养师 | 数组顺序即优先级，同层冲突时第一个优先；L0–L2 护栏红灯时可临时成为 lead；不设 `goalPriority`；`G-IMM` 不占名额、不任 lead；`G-MED` 不在可选集、不写入该数组 |
| `goalEffectiveDate` | `YYYY-MM-DD` | 营养师 | 目标生效日，历史解释用 |
| `goalSource` | `'nutritionist'` | 营养师 | 审计；与 `phaseSetBy` 同构；枚举不预留 `'import'`/`'system'` |
| `bodyFatPct` | number（3–50），可选 | 营养师 | 只存百分比；测量方法（DXA/BIA/皮褶）写进 `profile.note`，不设 `bodyFatMethod`/`bodyFatMeasuredAt`；只有它存在时才计算 EA。三态：**省略字段 = 保留原值；显式 `null` = 清除；非 number 或不在 3–50 = `E_GOAL_BODYFAT`** |
| `refeedDays` | number（0–7 整数），可选 | 营养师（`coachApi.setRefeedPlan`） | 当周计划 refeed 天数，复核页输入；唯一写入方是 `setRefeedPlan`；`0` 或 `null` 视为本周无计划；运行时按 `event.refeedDays → profile.refeedDays → null` 取值 |

治理：`saveProfile` 的 `ALLOW` 不加入这些字段；`LOCKED` 加入 `goals/goalEffectiveDate/goalSource/bodyFatPct/refeedDays`。`coachApi.setGoals` 是目标唯一写入入口，权限与归属校验同 `setPhase`；**对当前阶段不合法的目标直接拒绝写入**，返回错误码与提示，不做“写入后警告”；不自动改 `phase`。允许的名额是“≤3 个计入名额 + ≤1 个 `G-IMM` 监测”；若 `G-IMM` 不在数组末尾，`setGoals` 先归一化到末尾再校验，不改变主目标相对顺序。初次保存只接受 `legality='legal'`；预检为 `partial` 时整次拒绝、返回 `E_GOAL_CONFLICT`。`setPhase` 不自动清理目标；阶段改变后若旧目标变不合法，由 `GOAL-01` 提示营养师改目标或改阶段。`bodyFatPct` 有两条写入路径：`coachApi.setGoals` 在写目标时可携带可选 `bodyFatPct`；`coachApi.setBodyComp` 只更新体脂、不改目标。二者写同一字段，均按 3–50 校验，三态一致：**省略字段 = 保留原值；显式 `null` = 清除；非法值 = `E_GOAL_BODYFAT`**。`refeedDays` 的唯一写入方是 `coachApi.setRefeedPlan`；复核页输入，运行时按 `event.refeedDays → profile.refeedDays → null` 取值。

`setGoals` / `setRefeedPlan` 错误码：

| 错误码 | 触发条件 | 提示 |
|---|---|---|
| `E_GOAL_UNKNOWN` | 原子 ID 不在 15 个定义内 | “未知目标 ID：{id}” |
| `E_GOAL_DUPLICATE` | 同一原子重复 | “目标重复：{id}” |
| `E_GOAL_QUOTA` | 计入名额的原子 >3，或 `G-IMM` >1 | “最多 3 个主目标 + 1 个 IMM 监测” |
| `E_GOAL_PHASE_ILLEGAL` | 目标在 `profile.phase` 下为 N/A，或未满足矩阵附加条件（如 GAIN 距称重<84 天、HOLD 在 cut 但 gap>1.5） | “{goal} 在{阶段}不合法或未满足附加条件” |
| `E_GOAL_CONFLICT` | 初次 `setGoals` 预检为 `legality='partial'`（目标在阶段内合法，但被 `forbid` 冲突边裁剪） | “目标组合在当前阶段不可共存，请先调整目标” |
| `E_GOAL_FORBIDDEN` | `G-MED` 等不可选标记 | “{id} 不是可选目标” |
| `E_GOAL_BODYFAT` | `bodyFatPct` 非 number 或不在 3–50 | “体脂率应在 3–50% 之间” |
| `E_GOAL_REFEED` | `refeedDays` 非 0–7 整数 | “refeed 天数应为 0–7 的整数” |
| `E_GOAL_WRITE` | 校验通过后单次写库失败 | “目标写入失败，未修改任何字段” |
| `E_GOAL_EMPTY_DATE` | `goals` 非空但缺或非法 `goalEffectiveDate` | “目标生效日必填且须为 YYYY-MM-DD” |

拒绝时整次请求不落库，`profile.goals` 保持原值。

> 实现落点（G6）：`cloudfunctions/coachApi/index.js` 的 `action='setGoals'`，校验统一调用 `utils/goals.js` 的 `validateGoalWrite`（内部先 `validateGoals` 读矩阵 `legal/condition`，再 `resolveGoalPlan` 判定 `partial`）。通过后只做一次 `users.profile` update，写入 `goals / goalEffectiveDate / goalSource`（固定 `'nutritionist'`）与可选 `bodyFatPct`（三态：省略 = 保留原值，显式 `null` = 清除，非法 = `E_GOAL_BODYFAT`；只更新体脂可走 `setBodyComp`）；`saveProfile` 已把这五个字段（含 `refeedDays`）列入 `LOCKED`，不能覆盖。`refeedDays` 由 `action='setRefeedPlan'` 单独写入，复核页使用。另：单次写库失败返回 `E_GOAL_WRITE`，不落半成品。

### 9.2 logs 新增字段

| 字段 | 类型 | 何时出现 | 说明 |
|---|---|---|---|
| `training.startTime` | `HH:mm` | POW/SPD/END/SKL/HYP 目标激活时 | 判断训练前 1–3h、训练后 2h 的补给时机 |
| `training.quality` | 1–5 | SPD/POW/SKL 目标激活时 | 速度/爆发/技术课主观质量；`goalAdherence` 三个组件之一（`fuelTiming / sessionQuality / refeedCadence`） |
| `health.illness` | 0/1/2 | 仅 `G-IMM` 监测激活时 | 0 无、1 轻微上呼吸道、2 发热/就医 |

全部可选；`normalizeLog()` 缺失时返回 `null`；`schemaVersion` 仍为 2（加法字段，不升版）。

### 9.3 两端界面

- 拳王端：首页“今日目标”卡，主导 + 让步 + 2 个关键数字；目标为空时隐藏；仅有 `G-IMM` 监测时只显示监测条，不显示目标卡；填写页“目标补充（选填）”最多 2 项；趋势页加目标参考线；不新建 tab。弱证据目标即使被营养师人工调整，仍保留“证据偏弱”徽标；maintain/cut 期 GI 目标只在目标横幅提示。
- 营养师端：列表目标 chips + `goalAdherence`（独立分，不并入综合分）+ 冲突标记；详情/复核页完整矩阵卡；提供“调整目标”（≤3 个主目标 + 可选 1 个 `G-IMM` 监测，上移/下移排序，顺序即优先级）；复核显示“评估时目标快照”；`legality='partial'` 时显示 amber“部分目标被阶段冲突裁剪”横幅，列出保留/裁剪两组目标，不自动删除 `profile.goals`，确认后才由 `setGoals` 写回保留项；规则库显示 `GOAL-01/02` 与“证据偏弱”徽标。
- 拳王端不参与目标选择，不看到冲突争论，只看裁决后的执行方案。

> 实现落点（G6）：营养师看板 `pages/coach/*` 用 `goals.goalChips` 渲染目标 chips（主导/让步/监测/证据等级，无目标整块不渲染）与独立 `goalAdherence`、冲突标记；跟进队列 `pages/queue/*` 的目标 chips 由 `coachApi` 按 `users.profile` 附到 group。复核页 `pages/review/*` 读 `advice` 快照的 `goal` 块（`matrixVersion / plan / adherence / blockers / requested / effectiveDate / source`）渲染矩阵卡，并提供“带入建议开头”（只前置，不覆盖已写正文）；同时提供当周 `refeedDays` 输入，提交走 `coachApi.setRefeedPlan`，不回写目标。云端不可用时页面明确提示，不留本地假数据。

> 实现落点（G8）：营养师看板每位拳王的卡片内提供“设置目标 / 调整目标 ›”入口，进入 `pages/goals/*`。页面从 `getFeed` 读当前 `profile.phase/goals/goalEffectiveDate/bodyFatPct/weighInDate/weightKg/targetWeightKg`，用 `utils/goalDraft.js`（纯函数，依赖 `goals.atomLegality`）渲染 15 个原子的实时状态：阶段 N/A 格与 `G-MED` 置灰并给出原因，条件类目标显示“需满足：…”（如 `B-HOLD` 的 `gapPct≤1.5%`、`B-GAIN` 的距称重 >84 天）；名额实时显示“主目标 x/3 · 监测 y/1”，主目标满 3 个后其余主目标置灰、`G-IMM` 仍可单独选。已选目标支持增删与上移/下移，回填保留原顺序并剔除不可选项。提交只走 `coachApi.setGoals` → 云函数 `setGoals`；失败按 `ERROR_LABELS` 显示错误码中文含义，离线明确提示且不落本地。

### 9.4 避免一次问太多

1. 目标只在入组/复核时由营养师选，拳王端不出现目标问卷。
2. 每日最多 2 个新问题，且全部可选；不选不影响评分。
3. 只有目标激活且阶段合法时才显示对应字段。
4. 目标字段永远不进 `fieldSchema.required`，`LOG-01` 不因目标字段缺失报警。
5. 周维度只问 1 个问题：“本周目标是否仍然正确？”由营养师在周报/复核里确认。

---

## 10. 实施拆分

| 步骤 | 内容 | 主要文件 | 依赖 | 验证 | 并行 |
|---|---|---|---|---|---|
| G0 | 本文档：契约冻结 | `docs/goal-matrix.md`、`docs/schema.md` | — | 评审通过 | 必须先做 |
| G1 | 目标字典与矩阵数据；preflight 校验 ID/格子/证据/anchor | `miniprogram/data/goalMatrix.js`、`scripts/preflight.js`、`scripts/dump-docs.js` | G0 | `node scripts/preflight.js` | 必须先做 |
| G2 | 纯函数解析层：校验、冲突、`buildGoalPlan`、`goalFields`、`goalAdherence` | `miniprogram/utils/goals.js`、`scripts/test-goals.js`、`scripts/fixtures/goals-demo.js` | G1 | `node scripts/test-goals.js` | 可与 G3 并行（先冻结 `goalFields` 返回结构） |
| G3 | 字段与表单：`fieldsFor(phase, goals?)`、`normalizeLog` 新字段、填写页折叠块 | `rules.js`（仅 `fieldsFor`/`normalizeLog`/`FIELD_LABELS`）、`pages/log/log.js`、`log.wxml`、`docs/schema.md` | G1 | `node --check`、`node scripts/lint-pages.js` | 可与 G2 并行 |
| G4 | 引擎叠加：`evaluate` 消费 `goalPlan`；GOAL-01/02 登记；云函数同步 | `rules.js`（`evaluate`）、`ruleRegistry.js`、`sync-shared.sh`、`cloudfunctions/{saveLog,getFeed,coachApi,advice}/lib/*`、`advice/lib/core.js` | G2、G3 | `test-phases`、`test-rules`、`test-goals`、`preflight` | 串行；必须先于 G5/G6 |
| G5 | 拳王端：首页目标卡、趋势参考线、填写页展示 | `pages/index/*`、`pages/trend/*`、`pages/log/*` | G4 | `lint-pages` + 微信开发者工具手测 | 与 G6 并行 |
| G6 | 营养师端：列表 chips、复核矩阵卡、`setGoals`（阶段不合法拒绝 + 错误码，含 `E_GOAL_EMPTY_DATE`；初次 `partial` 返回 `E_GOAL_CONFLICT`；本轮 G2 不触发）、`saveProfile` LOCKED | `pages/coach/*`、`pages/review/*`、`cloudfunctions/coachApi/index.js`、`cloudfunctions/saveProfile/index.js`、`pages/me/*` | G4 | `node --check` + 本地逻辑验证；云函数部署状态标“未验证” | 与 G5 并行 |
| G7 | 证据治理与文档收口：全量测试、生成文档、弱证据清单 | `docs/rule-registry.md`、`docs/knowledge.md`、`docs/phase-matrix.md`、`docs/rule-source-table.md`、`scripts/dump-docs.js` | G1、G4、G5、G6 | 全量测试 + 人工验收 | 最后 |

**必须先做：** G0 → G1 → G2 → G4。  
**可并行：** G2 与 G3（接口冻结后）；G5 与 G6（G4 完成后）。  
**收口：** G7 最后。

### 10.1 验证命令

- `node scripts/preflight.js`
- `node scripts/test-rules.js`
- `node scripts/test-phases.js`
- `node scripts/test-goals.js`（新增）
- `node scripts/test-advice-core.js`
- `node scripts/test-followup.js`
- `node scripts/lint-pages.js`
- 对改动 JS 执行 `node --check`
- `bash scripts/sync-shared.sh`（Windows 用 Git Bash）
- 微信开发者工具手测填写页/首页/趋势页/营养师端；云函数未部署时明确标“未验证”。

---

## 11. 验收清单

1. 15 个目标原子 ID、名称、维度、合法阶段与本文一致；60 格矩阵齐全，N/A 格有原因。
   - 实际状态：**通过**（60/60 格合法性与 N/A 原因一致）
   - 验证命令：`node scripts/preflight.js`、`node scripts/check-goal-matrix-doc.js`
2. 27 个配方 C01–C27 齐全，主导/让步模式/证据/触发阶段可查。
   - 实际状态：**通过**
   - 验证命令：`node scripts/preflight.js`
3. 18 条现有规则阈值、适用阶段、`requiresHumanFollowUp` 未变；只新增 `GOAL-01/02`。
   - 实际状态：**通过**（test-rules 124、test-phases 47、preflight 0 阻塞；EA/FFM 与 `ctx.goals` 优先级、`ctx.refeed` 均已覆盖）
   - 验证命令：`node scripts/test-rules.js`、`node scripts/test-phases.js`、`node scripts/preflight.js`
4. `goals=[]` 时 `evaluate` 输出与 v3.0 逐字段一致；`activeRuleIds` 不含 GOAL 规则；`score` 不变。
   - 实际状态：**通过**（v3.0 冻结 fixture `scripts/fixtures/rules-v3-no-goals.json` 对完整输出 `deepStrictEqual`，唯一豁免 `RULES_VERSION`；覆盖 `suppressed / missingRequired / tips / coachSummary`）
   - 验证命令：`node scripts/test-rules.js`、`node scripts/preflight.js`
5. 同一现象只扣一次分：睡眠 5.5h + END+SLE 只有 `SLE-01` 告警；CUT+POW 周降>1% 只有 `PHASE-01`。
   - 实际状态：**通过**（固定用例已覆盖，`alerts.length` 与无目标时一致；C06 cut 主导 `B-HOLD`、maintain 主导 `P-HYP` 两条用例通过）
   - 验证命令：`node scripts/test-goals.js`
6. 每个合法格子有 `evidenceStatus` 与 anchor；弱证据格子 `targets=null` 或无具体数值处方；人工调整后 `evidenceStatus` 不升级，拳王端仍显示“证据偏弱”徽标。
   - 实际状态：**通过（代码/静态）**；证据过滤统一读 `cell.evidenceStatus`，C12 为 `weak` 且 `targets=null`；营养师人工调整后的弱证据徽标需真机走查
   - 验证命令：`node scripts/preflight.js`、`node scripts/lint-pages.js`、`node scripts/test-goals.js`
7. `goalPlan / goalAdherence / goalBlockers / goalMatrixVersion` 字段结构与本文一致；`goalAdherence` 不参与 `score`、不进任何总分/综合分。
   - 实际状态：**通过**；`ctx.goals` 存在时优先于 `profile.goals`；`weekly.js` 输出结构化 `refeed`（计划天数/实际完成/成功率），`getFeed` 与 `advice` 已传入 `ctx.refeed`，缺失时组件跳过重归一
   - 验证命令：`node scripts/test-goals.js`、`node scripts/test-rules.js`、`node scripts/test-weekly.js`
8. `profile.goals/goalEffectiveDate/goalSource/bodyFatPct/refeedDays` 与 `training.startTime/training.quality/health.illness` 的契约已写入 `docs/schema.md`，`saveProfile` LOCKED 规则、`goals` 名额口径与 `setGoals` 错误码明确。
   - 实际状态：**通过（代码/测试）**；`setGoals` 保留可选 `bodyFatPct`，另提供 `coachApi.setBodyComp` 单独更新体脂；`coachApi.setRefeedPlan` 是 `refeedDays` 唯一写入方；云端部署后需再核验 `saveProfile` 实际拦截
   - 验证命令：`node scripts/test-goals.js`、`node scripts/preflight.js`
9. 拳王端目标卡在无目标时隐藏；每日目标字段≤2 且可选；营养师端可调整目标并看到冲突/证据徽标；名额 ≤3 + `G-IMM` 不占名额；maintain/cut 期 GI 目标只在横幅、不进 `alerts`；`setGoals` 对阶段不合法目标返回错误码并整次拒绝。
   - 实际状态：**通过（代码/测试）**。隐藏/名额/GI 横幅/`setGoals` 拒绝均有代码与断言；营养师端“调整目标”页（`pages/goals/*`）已实现：15 原子可选、阶段 N/A 与 `G-MED` 当场置灰并给出原因、条件类目标显示“需满足”、名额实时显示、增删与调序、错误码中文映射；真机与云端写入未验
   - 验证命令：`node scripts/test-goals.js`（含第 14 节 28 项 UI 纯函数断言）、`node scripts/lint-pages.js`、`node scripts/preflight.js`；真机手测待部署
10. `advice` 快照存 `rulesVersion`（v4.0）+ `goalMatrixVersion` + `goalPlan/goalAdherence/goalBlockers` + `goalEffectiveDate/goalSource`；旧快照显示“未设目标”；云函数/真机状态标“未验证”。
    - 实际状态：**依赖云端/真机**。快照写入代码已落地，复核页已对无目标快照显示“未设目标”；需部署 `advice` 后发布一条建议并在控制台核对快照字段
    - 验证命令：部署后 `coachApi`/`advice` 控制台测试；本地 `node scripts/test-advice-core.js`

---

## 12. 已定稿结论（G1 直接执行）

以下 10 条已定稿，G1–G7 按此实现。

| 编号 | 结论 | 落点 |
|---|---|---|
| 1 | `bodyFatPct` 只存百分比；测量方法（DXA/BIA/皮褶）写进 `profile.note`，不设 `bodyFatMethod`/`bodyFatMeasuredAt` | §9.1、`schema.md` profile |
| 2 | `goalSource` 当前只允许 `'nutritionist'`；枚举不预留 `'import'`/`'system'` | §7.1、§9.1、`schema.md` |
| 3 | GOAL-02 只判单日与 `nextPlan`；不引入 `ctx.recentTraining`，不判“本周负荷陡增”，周负荷留给周报/趋势页 | §3.2、§6.2 |
| 4 | `goalAdherence` 独立评分，不进 `score`、`level`、`headline`，不进任何总分/综合分 | §2.7、§3.2、§3.3、§6.4、§7.2、§9.3 |
| 5 | 目标上限 3 个；`G-IMM` 等健康监测型护栏只监测，额外 1 个，不占 3 个名额，不参与冲突裁决；`G-MED` 不是可选目标 | §1.1、§1.2、§5.2、§5.4、§7.1、§9.1、§9.3、`schema.md` |
| 6 | `profile.goals` 数组顺序即优先级（同层冲突时第一个优先，L0–L2 护栏可临时越级）；不设 `goalPriority` | §1.2、§7.1、§9.1 |
| 7 | 弱证据目标经营养师人工调整后，`evidenceStatus` 不升级，拳王端仍保留“证据偏弱”徽标 | §8.1、§8.2、§9.3、§11 |
| 8 | GOAL-01 分级：要求当前窗口立即改变能量方向 → red；窗口未到、可延后 → amber；全部 N/A 情形按 §6.1 判定表穷举 | §6.1 |
| 9 | maintain/cut 期 GI 目标只进目标横幅（`phase_suppressed` + `monitor`），不进 `alerts` | §2.7、§6.3、§9.3、§11 |
| 10 | `setGoals` 对当前阶段不合法目标直接拒绝写入，返回错误码与提示，整次请求不落库；不做“写入后警告” | §6.1、§9.1、`schema.md` |

**定稿后的两条联动规则：**

1. 由于 `setGoals` 已拒绝写入阶段不合法目标，`GOAL-01` 的实际触发场景是“目标设定后阶段被 `setPhase` 改掉”；`setPhase` 不自动清理目标，GOAL-01 提示营养师二选一。
2. 名额统计口径统一为：`countsTowardQuota=true` 的原子 ≤3，`countsTowardQuota=false` 仅允许 `G-IMM` 且 ≤1；`profile.goals` 总长度 ≤4，顺序即优先级（`G-IMM` 固定排最后）。
