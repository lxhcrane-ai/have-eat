# 脑震荡 / 打击累积：字段与营养护栏规则规格

> **产品边界（先读）**：本项目只做**营养支持**与**康复期辅助营养**。
> 不做医学诊断，不判定「是否脑震荡」，不替队医决定停训或复训，不替医生决定是否送医，不给处置、用药或时间表。
> 规则命中后只输出**营养侧降级动作**；「建议按队医/医生流程评估」只作一句提示，不附带步骤、不分级、不给时间表。
> 本文里出现的「停训」「复训」「送医」「分级重返」等词，只用于说明**系统不做什么**；任何实现不得把它们写进规则文案或出参。

---

## 0. 六条验收标准的正面回答

### 0.1 填写负担：实际要点几下、花几秒

采用「一道闸门 + 一张症状多选页」的两段式，不做十几道独立题。

| 场景 | 操作 | 点击数 | 估计耗时 |
|---|---|---|---|
| 普通训练日（无头部受击） | 闸门问题选「否」，症状页不展开 | **1 下** | **约 3 秒** |
| 有头部受击、无任何症状 | 闸门「是」+「是否被击倒/裁判计数」否 +「是否中止」否 | **3 下** | **约 8 秒** |
| 受击 + 2 个轻度症状 | 3 下事件项 + 2 个症状勾选 + 2 个强度（默认 1，可不点） | **5–7 下** | **约 20–25 秒** |
| 极端：7 个症状全勾 | 3 下事件项 + 7 个勾选 + 7 个强度 | 17 下 | 约 40 秒（不常见） |

压缩手段：

1. **闸门**：只问「今天头部/面部是否被重击？」选否就收起整块，症状页不出现。
2. **症状是一张多选页**：7 个症状在同一屏勾选，不是 7 道题；勾中后才出现 0–3 强度，强度默认 1，愿意细化才点。
3. **二值项只做开关**：记忆空白、平衡异常、被击倒、中止训练、意识丧失、症状加重都是二值，不做量表。
4. **恶心/呕吐复用 `giSymptoms`**：不再新增两个字段，避免同一件事填两遍。
5. **医生侧字段不进拳王表单**：意识丧失、症状加重由教练/队医录入，拳王端 0 次点击。
6. **全部选填**：不填就是 `null`，不进入 `fieldSchema.required`，`LOG-01` 不因缺这些字段报警。

**结论**：普通日 1 下/3 秒；最常见的受击场景 3–7 下/8–25 秒。可以接受，不再压缩，因为再压就会丢掉「有没有受击」和「症状强度」这两个决定营养动作的关键输入。

### 0.2 红旗症状由谁填

**不让刚受击的拳王自评「有没有意识丧失」**。受击后记忆与判断本身可能受影响，自评不可靠；系统也不做医疗判断，所以不做「是否脑震荡」的提问。

| 项目 | 谁填 | 形式 | 理由 |
|---|---|---|---|
| 头痛、眩晕、畏光、耳鸣、反应变慢 | 拳王 | 0–3 强度 | 可自评，用于决定营养降级程度 |
| 恶心、呕吐 | 拳王 | 复用 `giSymptoms.nausea` / `.vomiting` | 已有字段，避免重复填写 |
| 记忆空白、平衡异常 | 拳王 | 二值（是/否/未填） | 可事后回忆；阳性只触发营养降级+转介提示，不作诊断 |
| 头部受击、被击倒/裁判计数、训练/比赛中止 | 拳王 | 二值 | 可观察事实，不需要医学判断 |
| **意识丧失** | **仅教练/队医** | 二值，写 `health.concussion.staff` | 刚受击者不可靠；且属于医疗事实，不该由拳王自评 |
| **症状是否加重** | **仅教练/队医** | 二值，写 `health.concussion.staff` | 需要连续观察，拳王自评不可靠 |

- 拳王端表单**不出现**「意识丧失」「是否加重」。
- 这两个字段由 `coachApi` 的教练/队医入口写入；未填就是 `null`，规则不推断。
- 教练未填时，系统最高只到「营养降级 + 提示按队医/医生流程评估」，不会输出任何「可以继续」「必须送医」的判定。

### 0.3 三条线改成「营养动作三档」

| 档位 | 触发条件（任一） | 营养动作 | 转介提示 | 不做什么 |
|---|---|---|---|---|
| **正常** | 无受击、无症状、近 7 天无相关记录 | 无额外动作，按原计划 | 无 | — |
| **营养降级** | 仅有轻度症状（全部 1 分）；或近 7 天有轻度症状、今天仍≥1；无受击、无中止、无记忆空白/平衡异常 | ① 当天不制造/不加深减脂缺口；② 能量与水分给够；③ 不饮酒；④ 暂停非必需补剂；⑤ 少量多餐、低纤维低脂、优先易消化；⑥ 不执行高容量补碳/高纤维/大份正餐 | 无（或仅一句「如症状持续，可按队医流程评估」） | 不输出停训/复训/送医判定 |
| **营养降级 + 转介提示** | 任一症状≥2；或≥2 个症状≥1；或有头部受击；或被击倒/裁判计数；或训练/比赛中止；或记忆空白；或平衡异常；或教练/队医录入意识丧失/症状加重；或近 30 天累积暴露达标 | 同上的六项全部执行，并按「恢复期」口径把能量与蛋白给足、优先易消化 | **一句**：「建议按队医/医生流程评估」 | 不写「必须停训 N 天」「达到 X 即脑震荡」「必须送医」「分级重返步骤」 |

三档是**营养动作强度**，不是医疗分级；`red` 只表示「营养优先 + 转介提示」，不表示「医疗紧急」。

### 0.4 与 `REC-02`、`G-MED` 的分工（不重复报警、不重复扣分）

| 规则/标记 | 管什么 | 数据 | 是否影响评分 | 与 `G-CONC` 的边界 |
|---|---|---|---|---|
| `REC-02` | 肌肉酸痛与高强度课冲突 | `sorenessByArea` | **是**，进 `recFrac` | 只读酸痛，不读 `health.concussion`；同一天两者都红，评分只由 `REC-02` 扣一次 |
| `G-MED` | 营养师标记的医疗/女性/青少年转诊标记 | `profile.note` 等档案 | 否（矩阵护栏） | 只在档案层；`G-CONC` 只在当日日志层，不写 `goalBlockers`，不重复「转介」文案 |
| `G-CONC` | 打击后**营养护栏** | `health.concussion` + `giSymptoms` + 历史 | **否**，不进 `score`、不进 `goalAdherence` | 不读酸痛；不产生 `goalBlockers`；不改变 `goalPlan` |
| `GI-01` | 胃肠症状 | `giSymptoms` | 是（`recFrac`） | 只有恶心/呕吐、无受击、无其他神经症状时，归 `GI-01`，`G-CONC` 不触发 |

去重规则：

1. 同一天 `REC-02` 与 `G-CONC` 同时命中：只出两条独立告警，评分只由 `REC-02` 扣；`G-CONC` 不参与 `recFrac`。
2. 同一天 `G-MED` 已激活：`G-CONC` 的转介提示在 UI 合并到「医疗护栏」横幅，只显示一次；`G-CONC` 的六项营养动作仍单独列出。
3. 同一 `ruleId` 同一天只出一条告警、一个跟进项（`followup.js` 按 `athleteId+date+ruleId` 合并）。
4. `G-CONC` 不写 `goalBlockers`，避免和 `G-MED` 的 `veto` 重复。

### 0.5 症状未清零就复训：系统不拦，只做营养降级与提示

**结论：不拦截记录、不拦截保存、不拦截训练计划、不推进/不阻止复训阶段。**

| 场景 | 系统行为 |
|---|---|
| 保存日志 | 正常保存；即使症状未清零也不阻断 |
| 训练计划 | 不改 `goalPlan`、不改 `goalAdherence`；只在页面顶部显示营养横幅 |
| 复训 | 不复刻分级重返，不设 `stage`，不要求教练确认，不自动升级/降级 |
| 营养 | 近 7 天有症状且今天仍有症状 → 继续执行「营养降级」六项；症状未清零期间不回到减脂缺口 |
| 转介 | 只显示一句「建议按队医/医生流程评估」，不写步骤与时间表 |

**「未清零」的判断口径**：近 7 天内任一天 `maxSeverity ≥ 1`，且今天 `maxSeverity ≥ 1`，即视为「仍在恢复期」，营养降级继续。是否复训由队医/教练决定，系统不参与。

### 0.6 历史对照：「累积」靠什么发现

**查询口径**（三处调用方一致：`saveLog`、`getFeed`、`coachApi`）：

```
logs.where({ athleteId }).orderBy('date', 'desc').limit(31)
  取近 30 天（含今天）的：
  date
  payload.health.concussion
  payload.giSymptoms.nausea / vomiting
```

派生出 `recentConcussions`：

```
{
  date,
  maxSeverity,        // 0–3：取 headache/dizziness/photophobia/tinnitus/slowedReaction 的最大值；
                      // 只有 impact/knockdown 为 true 或已存在其他神经症状时，才把 giSymptoms.nausea/vomiting 计入
  symptomCount,       // 当天 ≥1 的神经症状个数；恶心/呕吐按同一条件计入，孤立胃肠症状不计
  impact,             // 二值
  knockdown,          // 二值
  stoppedTraining,    // 二值
  eventDay            // impact || knockdown || maxSeverity >= 2
}
```

**判断条件**（只用于决定营养档位，不用于医疗判断）：

| 条件 | 窗口 | 输出档位 |
|---|---|---|
| 今天无症状，近 7 天无记录 | — | 正常 |
| 近 7 天有 ≥1 天 `maxSeverity ≥ 1`，今天仍 ≥1 | 7 天 | 营养降级（不回到减脂缺口） |
| 近 7 天 `eventDay ≥ 2` | 7 天 | 营养降级 + 转介提示 |
| 近 30 天 `eventDay ≥ 3` | 30 天 | 营养降级 + 转介提示 |
| 近 30 天 `knockdown ≥ 2` | 30 天 | 营养降级 + 转介提示 |
| 近 7 天有 `maxSeverity ≥ 2`，今天仍有 ≥1 症状 | 7 天 | 营养降级 + 转介提示（视为未恢复） |
| 查询失败 / 无历史 | — | 只按今天判断，标 `data_missing`，不推断 |

- `eventDay` 定义：`impact===true` 或 `knockdown===true` 或 `maxSeverity>=2`。单独一天轻度头痛不算「事件」。
- 不做「单日症状 → 脑震荡」的推断；累积只用于「营养保守程度」和「转介提示」。
- 历史读取只读 `logs`，不新增集合、不跨用户读取。

---

## 1. 字段设计（`logs.health.concussion`）

### 1.1 JSON 形态

```json
"health": {
  "illness": null,
  "concussion": {
    "headache": null,
    "dizziness": null,
    "photophobia": null,
    "tinnitus": null,
    "slowedReaction": null,
    "memoryGap": null,
    "balanceIssue": null,
    "impact": null,
    "knockdown": null,
    "stoppedTraining": null,
    "staff": {
      "lossOfConsciousness": null,
      "worsening": null,
      "enteredBy": null,
      "enteredAt": null
    }
  }
}
```

### 1.2 字段表

| 字段 | 类型 | 取值域 | 必填 | 缺失 | 写入方 | 用途（只服务营养动作） |
|---|---|---|---|---|---|---|
| `health.concussion.headache` | number | `0 / 1 / 2 / 3` | 否 | `null` | 拳王 | 头痛强度；≥1 触发营养降级 |
| `health.concussion.dizziness` | number | `0 / 1 / 2 / 3` | 否 | `null` | 拳王 | 眩晕强度 |
| `health.concussion.photophobia` | number | `0 / 1 / 2 / 3` | 否 | `null` | 拳王 | 畏光强度 |
| `health.concussion.tinnitus` | number | `0 / 1 / 2 / 3` | 否 | `null` | 拳王 | 耳鸣强度 |
| `health.concussion.slowedReaction` | number | `0 / 1 / 2 / 3` | 否 | `null` | 拳王 | 反应变慢强度 |
| `health.concussion.memoryGap` | boolean | `true / false` | 否 | `null` | 拳王 | 记忆空白；阳性直接进「营养降级+转介提示」 |
| `health.concussion.balanceIssue` | boolean | `true / false` | 否 | `null` | 拳王 | 平衡异常；同上 |
| `health.concussion.impact` | boolean | `true / false` | 否 | `null` | 拳王 | 头部/面部被重击 |
| `health.concussion.knockdown` | boolean | `true / false` | 否 | `null` | 拳王 | 被击倒/裁判计数 |
| `health.concussion.stoppedTraining` | boolean | `true / false` | 否 | `null` | 拳王 | 训练/比赛是否中止 |
| `health.concussion.staff.lossOfConsciousness` | boolean | `true / false` | 否 | `null` | **仅教练/队医** | 只用于确认「营养降级+转介提示」；系统不据此诊断 |
| `health.concussion.staff.worsening` | boolean | `true / false` | 否 | `null` | **仅教练/队医** | 只用于确认「营养降级+转介提示」 |
| `health.concussion.staff.enteredBy` | string | 角色/姓名，≤32 字 | 否 | `null` | 教练/队医 | 留痕 |
| `health.concussion.staff.enteredAt` | string | ISO 8601 | 否 | `null` | 教练/队医 | 留痕 |

**恶心/呕吐不新增字段**：复用 `giSymptoms.nausea`（0–4）与 `giSymptoms.vomiting`（boolean）。只有同时存在受击或其他神经症状时，`G-CONC` 才读取它们；孤立恶心/呕吐归 `GI-01`。

### 1.3 归一化与缺失

- `health.concussion` 是**加法对象**：整体缺失为 `null`；不全填时只把已填字段写值，未填字段保持 `null`，不得用 `0` 或 `false` 代替「没填」。
- 强度字段：非整数、越界、空字符串统一归一为 `null`（沿用现有 `intInRange(v, 0, 3)` 口径）。
- 二值字段：只接受 `true / false`；缺失、字符串、`0/1` 一律归一为 `null`。建议新增 `boolOrNull(v)`，不要复用 `num()` 再转布尔。
- `staff` 子对象：拳王提交时服务端必须**丢弃**；只接受 `coachApi` 写入，防止拳王自改。
- 旧日志没有 `concussion` 时，`normalizeLog` 输出 `null`，不改变旧日志解析。

### 1.4 为什么这些字段够用而不臃肿

- **症状域覆盖**：头痛、眩晕、畏光、耳鸣（躯体）+ 反应变慢、记忆空白（认知）+ 平衡异常（前庭）+ 恶心/呕吐（复用 GI），覆盖共识里最常见的症状域，但不复刻 SCAT6 评分表，也不计算总分。
- **事件上下文**：受击、被击倒、中止训练三项是「今天该不该把营养切到恢复模式」的最便宜信号。
- **医生侧两项**：意识丧失、症状加重只用于提高营养保守程度和转介提示，不由拳王自评。
- **不收集**：瞳孔、血压、影像、用药、诊断名称、复训阶段、SCAT 子测试。这些属于医疗评估，系统不碰。
- **不是量表**：0–3 只是「不影响 / 轻微影响 / 明显影响 / 严重到影响站立或说话」的填写锚点，不是医学分级，不作为诊断阈值。

---

## 2. 规则设计：`G-CONC`（营养护栏）

### 2.1 编号与定位

- `ruleId: 'G-CONC'`，登记在 `ruleRegistry.js`；**不是**目标原子，**不进入** `goalMatrix.js` 的 `ATOMS`。
- 名称：`打击后营养护栏`。
- 四个阶段全部启用（`applicablePhases: ['maintain','cut','peak','recover']`）。
- `reviewStatus: 'needs_review'`：营养降级幅度是产品保守策略，不是文献剂量；等营养师确认后再改 `active`。
- `requiresHumanFollowUp: true`：进营养师跟进队列，但跟进动作只关于营养。
- `kbIds: ['RC-06','RF-06','RH-08']`。

### 2.2 判定逻辑（只产出营养档位）

```
输入：今天的 concussion、giSymptoms、近 7/30 天 recentConcussions
输出：nutritionGuardrail = null | { level, action, flags, referralPrompt, reasons }

1) 先判断今天是否有「神经相关症状」：
   neuroSymptom = headache/dizziness/photophobia/tinnitus/slowedReaction 任一 >=1
                  或 memoryGap/balanceIssue 为 true
                  或（impact/knockdown 为 true 且 giSymptoms.nausea>=1 或 vomiting=true）
   孤立恶心/呕吐且无 impact、无其他神经症状 → 不归 G-CONC，归 GI-01

2) 正常：
   无 impact、无 neuroSymptom、无 eventDay 历史 → 不输出

3) 营养降级（amber）：
   仅 neuroSymptom 且 maxSeverity == 1，且 impact/knockdown/stoppedTraining 均非 true，
   且 memoryGap/balanceIssue 均非 true，且 staff 两项均非 true；
   或近 7 天有症状、今天仍 >=1 但今天不满足上一档红条件

4) 营养降级 + 转介提示（red）：
   任一症状 >=2
   或 >=2 个症状 >=1
   或 impact === true
   或 knockdown === true
   或 stoppedTraining === true
   或 memoryGap === true
   或 balanceIssue === true
   或 staff.lossOfConsciousness === true
   或 staff.worsening === true
   或近 7 天 eventDay >= 2
   或近 30 天 eventDay >= 3
   或近 30 天 knockdown >= 2
   或近 7 天有 maxSeverity >=2 且今天仍有 >=1 症状

5) 所有档位都只是营养动作；不输出停训、复训、送医、分级、时间表。
```

**注意**：`impact === true` 即使没有任何症状，也进「营养降级 + 转介提示」——这是营养保守策略，不是医学判断。

### 2.3 出参结构

```js
nutritionGuardrail: {
  ruleId: 'G-CONC',
  level: 'amber' | 'red',
  action: 'nutrition_downgrade' | 'nutrition_downgrade_refer',
  flags: [
    'noDeficit',        // 不制造/不加深减脂缺口
    'energyFluid',      // 能量与水分给够
    'noAlcohol',        // 不饮酒
    'supplementsPause', // 暂停非必需补剂
    'easyDigest',       // 少量多餐、低纤维低脂、易消化
    'carbConservative'  // 不执行高容量补碳/高纤维/大份正餐
  ],
  referralPrompt: true, // 仅 red 为 true；只是一句提示
  reasons: ['headache=2', 'impact=true'], // 可读原因
  text: '...',
  reviewStatus: 'needs_review',
  requiresFollowUp: true
}
```

同时产出一条普通告警，进 `alerts`：

```js
{
  code: 'concussion-nutrition',
  ruleId: 'G-CONC',
  ruleName: '打击后营养护栏',
  level: 'amber' | 'red',
  title: '今天按恢复期营养处理',
  text: '...六项营养动作 + （red 时）建议按队医/医生流程评估...',
  evidence: '头痛 2/3；头部受击；未中止训练',
  kb: ['RC-06', 'RF-06', 'RH-08'],
  sources: [patricios2023, turnagol2022],
  reviewStatus: 'needs_review',
  requiresFollowUp: true
}
```

### 2.4 文案模板（不得越界）

**amber**

> 今天记录到轻度头痛（1/3）。营养侧按恢复期处理：今天不压减脂缺口，能量和水分给够，不饮酒，暂停非必需补剂，少量多餐、优先易消化；不执行高容量补碳或大份正餐。是否训练由教练/队医决定。

**red**

> 今天记录到头痛 2/3，并有头部受击。营养侧按恢复期处理：不压缺口、能量水分给够、不饮酒、暂停非必需补剂、优先易消化；同时建议按队医/医生流程评估。App 不做诊断，也不决定能否训练或复训。

**禁止出现的句子**：

- 「必须停训 N 天」「必须复训」「必须送医」「达到 X 分即脑震荡」「按分级重返第 N 步」
- 「可以继续训练」「已排除脑震荡」「休息几天就好」
- 任何用药、止痛、冰敷、影像检查、观察时长的建议

**UI 措辞约束**：`level='red'` 只表示「营养优先 + 转介提示」，页面不得显示「紧急」「危险」「医疗警报」等字样；统一显示「恢复期营养」。

---

## 3. 与矩阵的关系

| 项目 | 结论 | 说明 |
|---|---|---|
| 优先级栈 `PRIORITY_STACK` | **不进入** | `G-CONC` 是规则，不是目标原子，没有 L0–L6 归属 |
| `goalPlan` | **不影响** | 不增删目标、不改 lead、不改 composites |
| `goalBlockers` | **不写入** | 避免和 `G-MED` 的 `veto` 重复 |
| `goalAdherence` | **不影响** | 不新增组件，不改三组件权重 |
| `score` | **不影响** | 不进 `recFrac`；同日 `REC-02` 仍按原逻辑扣分 |
| `profile.goals` | **不新增** | 拳王不能把 `G-CONC` 当目标选 |
| `G-MED` | **分工** | `G-MED` 是档案层不可选转诊标记；`G-CONC` 是当日营养护栏 |
| `docs/goal-matrix.md` | **只加注** | 在 `G-MED` 行注明：`G-CONC` 是日志层营养护栏，不占名额、不进矩阵 |

---

## 4. 影响面清单（实施端照单改）

### 4.1 规则与引擎

| 文件 | 改什么 | 写死项/注意 |
|---|---|---|
| `miniprogram/data/ruleRegistry.js` | 新增 `G-CONC` 条目 | 规则数 18 → 19（不含 GOAL-01/02）；来源 `patricios2023` / `turnagol2022`；`applicablePhases` 四阶段；`reviewStatus='needs_review'` |
| `miniprogram/utils/rules.js` | ① `FIELD_LABELS.health_concussion`；② 四阶段 `fieldSchema.optional` 加 `health_concussion`；③ `normalizeLog` 的 `health` 加 `concussion`；④ 新增 `boolOrNull`；⑤ `evaluate` 增加 `nutritionGuardrail` 计算与 `emit('G-CONC', 'concussion-nutrition', ...)`；⑥ 出参加 `nutritionGuardrail`；⑦ `RULES_VERSION` `v4.0` → `v4.1` | **不改** `recFrac`、`score`、`goalPlan`、`goalAdherence`、`goalBlockers`；四阶段 `activeRuleIds` 都要加 `G-CONC`，`primaryAlertTypes` 也加，保证排序靠前 |
| `miniprogram/utils/followup.js` | `ACTIONS['G-CONC']` 写营养动作；`ESCALATE_IMMEDIATE` 加 `G-CONC` | 跟进动作只能是「营养侧降级」，不得写停训/复训 |
| `miniprogram/utils/goals.js` | **不改** | 不新增原子/配方/组件 |
| `miniprogram/data/goalMatrix.js` | **不改** | `G-CONC` 不进 ATOMS/MATRIX/COMPOSITES |

### 4.2 数据与云函数

| 文件 | 改什么 | 写死项/注意 |
|---|---|---|
| `normalizeLog`（`rules.js`） | `health.<...>` 增 `concussion`，`staff` 子对象只读保留 | 缺失 `null`，不用 `0/false` 代替；旧日志不变 |
| `saveLog/index.js` | 透传 `normalizeLog`；`feedback` 增 `nutritionGuardrail`；`feedback.version` 3 → 4 | 拳王提交的 `staff` 必须丢弃；红/amber 已走 `inbox`，无需新订阅模板 |
| `getFeed/index.js` | 读取近 30 天 `logs`，组装 `recentConcussions` 传给 `evaluate` | 查询失败按空历史处理，不推断 |
| `coachApi/index.js` | ① `generate` 组装 `recentConcussions`；② 新增 `action:'setConcussionStaff'` 写 `staff` 子对象；③ `listRules` 自动包含新规则 | 只允许 `role='coach'`；只能写自己绑定的拳王；写 `enteredBy/enteredAt` |
| `advice/lib/core.js` | `snapshotFromFeedback` 增 `nutritionGuardrail`（compact） | 只存 `level/action/flags/referralPrompt/reasons`，不存自由文本长句；哈希随字段变化 |
| 4 份 `lib` | `saveLog / getFeed / coachApi / advice` 同步 `rules.js`、`ruleRegistry.js`、`followup.js`、`knowledge.js` | `bash scripts/sync-shared.sh`；`saveProfile` 无 lib |

### 4.3 页面

| 文件 | 改什么 |
|---|---|
| `miniprogram/pages/log/log.js` | 草稿默认加 `health.concussion`；载入映射；提交透传；`staff` 不出现在表单 |
| `miniprogram/pages/log/log.wxml` / `.wxss` | 闸门「今天头部/面部是否被重击？」；展开后 7 个症状多选 + 强度；3 个事件二值；折叠态一行摘要 |
| `miniprogram/pages/index/index.js` | 顶部营养横幅：amber 黄、red 红；文案只用 §2.4 模板；不与 `G-MED` 横幅重复 |
| `miniprogram/pages/coach/coach.js` / `.wxml` | 教练可录 `lossOfConsciousness` / `worsening`；跟进项显示营养动作 |
| `miniprogram/pages/rules/rules.js` | 自动读登记表，无需改；确认 `G-CONC` 显示为「营养护栏」而非「医疗规则」 |

### 4.4 自检、测试、文档

| 文件 | 改什么 |
|---|---|
| `scripts/preflight.js` | 无需新增数量断言；会自动校验 `applicablePhases` 与四阶段 `activeRuleIds` 一致；补一条「`G-CONC` 不在 `goalMatrix.ATOMS`」断言 |
| `scripts/test-phases.js` | 新增：正常不告警、amber、red、孤立恶心归 `GI-01`、`score` 不变、`goalPlan`/`goalAdherence` 不变 |
| `scripts/test-rules.js` | 新增：`normalizeLog` 的 `null`/`false`/`0` 区分；`staff` 拳王提交被丢弃；历史累积条件 |
| `scripts/test-followup.js` | 新增 `G-CONC` 跟进项文案只含营养动作 |
| `scripts/dump-docs.js` | 改了规则后重新生成 `docs/rule-source-table.md`、`docs/phase-matrix.md` |
| `docs/rule-registry.md` | 规则数 18 → 19；新增 `G-CONC` 条目；编号段位表加注「`G-CONC` 为营养护栏规则，不是目标原子」 |
| `docs/schema.md` | `health.concussion` 字段表、`staff` 写入方、`feedback.nutritionGuardrail` |
| `docs/goal-matrix.md` | `G-MED` 行加注；§7.2 注明 `G-CONC` 不产生 `goalAdherence` 组件 |
| `docs/NEXT-STEPS.md` | 加一条实施项与验收命令 |
| `docs/knowledge.md` | 按 §5 的软化清单改 `RC-06`/`RF-06`/`RH-08`/`PF-01`/`PF-05` |

---

## 5. 需要软化措辞的句子清单（交知识库改）

> 判定标准：读起来像医疗指令、替队医做决定、或给出处置步骤。**营养动作**保留，**医疗指令**改成「按队医/医生流程评估」或删除。

### 5.1 `RC-06`（打击累积与脑震荡：先停训，再谈恢复）

| 现句 | 问题 | 建议改法 |
|---|---|---|
| 标题「先停训，再谈恢复」 | 直接下停训结论 | 「打击后不适：营养先配合，训练按队医流程」 |
| 「出现头痛、眩晕、恶心、反应变慢、记忆空白或平衡异常，立即停训并转医生。」 | 「立即停训」是医疗/训练指令 | 「出现这些症状时不要为了补恢复硬吃；营养侧按恢复期处理，并建议按队医/医生流程评估。」 |
| 「重返训练要按医生的分级流程逐步加量，不能凭感觉当天回到实战。」 | 复训分级属于队医 | 「能否复训、怎么加量按队医/医生流程；营养侧只保证能量、水分和蛋白。」 |
| 「教练发现队员被击中后表现异常，应先停练而不是问能不能继续。」 | 替教练做停训决定 | 「教练发现异常时按队医/医生流程处理；App 只做记录和营养提示。」 |

保留：不限能量、规律三餐、充足饮水、不脱水、不饮酒、不用「修复脑损伤」补剂。

### 5.2 `RF-06`（打击累积与脑震荡的饮食落点）

| 现句 | 问题 | 建议改法 |
|---|---|---|
| 「呕吐、无法正常进食或头痛加重时就医。」 | 「就医」是医疗指令；营养条目应只做转介提示 | 「呕吐、无法正常进食或头痛加重时，建议按队医/医生流程评估；营养侧先保证液体与易消化碳水。」 |

保留：少量多次、清淡碳水、症状稳定后再加蛋白、不用「修复脑损伤」补剂、不用脱水发汗「排毒」。

### 5.3 `RH-08`（脑震荡：能量和水分不能少，酒精不要）

| 现句 | 问题 | 建议改法 |
|---|---|---|
| 「症状持续、头痛加重或无法正常进食时，按医生安排处理，营养只做配合。」 | 已经是「按医生安排」，越界程度低 | 保留；可把「处理」改为「评估」：按医生流程评估，营养只做配合 |
| 标题「脑震荡：…」 | 把「脑震荡」当成已确定状态 | 「头部受击后：能量和水分不能少，酒精不要」 |

保留：不限能量、规律三餐、充足饮水、避免酒精、咖啡因不突然加量、不宣称修复脑损伤。

### 5.4 `PF-01`（终场 0–2h）

| 现句 | 问题 | 建议改法 |
|---|---|---|
| 「有脑震荡可疑症状（头痛加重、眩晕、呕吐）时不要为了『补恢复』硬吃，先按 RC-06 就医。」 | 「脑震荡可疑」「就医」像筛查结论 | 「有头痛加重、眩晕或呕吐时不要为了补恢复硬吃；营养侧只保证水分与易消化碳水，并建议按队医/医生流程评估。」 |

保留：补液量、钠浓度、碳水节奏、蛋白量、口腔/下颌受伤时小口液体。

### 5.5 `PF-05`（次日晨起三项自查）

| 现句 | 问题 | 建议改法 |
|---|---|---|
| 「食欲明显下降、恶心或头痛时先排除脑震荡和感染。」 | 「排除脑震荡」是诊断动作 | 「食欲明显下降、恶心或头痛时不硬顶进食，建议按队医/医生流程评估；营养侧改少量多次易消化。」 |
| 「出现呕吐、意识改变或持续头痛时直接就医。」 | 「直接就医」是处置指令 | 「出现这些情况只提示按队医/医生流程评估，本条不写处置步骤。」 |
| 「三项里有两项不对，当天训练改成恢复课或休息。」 | 排课是教练/队医决定 | 「三项里两项不对时，训练安排由教练/队医决定；本条只把当天能量与水分给够。」 |

保留：尿色 1–3/4+、酸痛 7/10 引用、赛后第一次晨尿偏深常见但次日中午仍深不正常。

### 5.6 一并检查的相邻条目

| 条目 | 句子 | 建议 |
|---|---|---|
| `PF-03` 赛后当晚 | 「确实无法避免时……把量压在 0.5 g/kg 以下」 | 改为「不设推荐量；0.5 g/kg 只是文献中的上限参考，不是允许量」 |
| `PF-04` 次日晨起 | 「必要时就医」 | 改为「需要医疗判断时只提示按队医/医生流程评估」 |
| `PF-06` 次日训练 | 「不排速度、爆发和最大力量」 | 改为「训练安排由教练/队医决定；营养侧按恢复期给足能量与水分」 |
| `PF-07` 回合间（已移出本时间窗） | 「停止比赛并就医」 | 改为「是否继续由裁判/队医决定；本条只做补液提示」；分类改 `fightday` |
| `RC-09` 主动恢复 | 「低强度活动，不要变成第二次训练」 | 保留；可加「训练安排由教练/队医定」 |
| `RH-09` 复训渐进 | 「先恢复食欲和消化，再加训练量」 | 把「训练量」改为「营养耐受」；训练加量按队医 |

---

## 6. 实施顺序与验收

1. 先改知识库措辞（§5），不动代码。
2. 再改 `ruleRegistry.js` + `rules.js` + `normalizeLog`，跑 `test-rules`。
3. 加 `recentConcussions` 读取，跑 `test-phases`。
4. 加填写页与教练录入，跑 `lint-pages`。
5. `bash scripts/sync-shared.sh`，`node scripts/preflight.js`，`node scripts/dump-docs.js`。

**验收标准**

- [ ] `G-CONC` 告警文案里没有「停训」「复训」「送医」「分级」「N 天」。
- [ ] `G-CONC` 不影响 `score`、`goalPlan`、`goalAdherence`、`goalBlockers`。
- [ ] 普通日填写 ≤1 下/3 秒；受击无症 ≤3 下/8 秒。
- [ ] 拳王表单没有「意识丧失」「症状加重」；`staff` 由 `coachApi` 写入。
- [ ] 孤立恶心/呕吐不触发 `G-CONC`，归 `GI-01`。
- [ ] 同日 `REC-02` 与 `G-CONC` 同时命中，评分只扣一次。
- [ ] 近 7/30 天查询失败时只按今天判断，不推断。
- [ ] 知识库 5 条已按 §5 软化，且保留营养动作。

**待核实**

- `patricios2023` 的具体症状域章节锚点（只用于「建议按队医流程评估」一句）。
- `turnagol2022` 的康复期营养章节与页码。
- `cscn6`、`sport_nutrition4` 的章节/页码仍为 `chapter_pending` / `pages_pending`。
- 「营养降级」的保守程度是否符合队医/营养师口径，标 `needs_review`，不由工程单方面定稿。
