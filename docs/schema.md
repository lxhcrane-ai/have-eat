# 数据契约 v2

## 顶层

```json
{
  "schemaVersion": 2,
  "id": "ab12cd-2026-05-16",
  "athleteId": "openid",
  "date": "2026-05-16",
  "tzOffset": 480,
  "createdAt": "2026-05-16T01:07:15.099Z",
  "updatedAt": "2026-05-16T01:07:15.099Z"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| schemaVersion | number | 固定 2。v1 由 `normalizeLog()` 自动升版 |
| id | string | 客户端或云端生成，唯一 |
| athleteId | string | 云端强制写 openid，不接受客户端传值 |
| date | string | 本地日期 `YYYY-MM-DD`（按 tzOffset 计算，不是 UTC 日期） |
| tzOffset | number | **UTC 以东分钟数**，北京 +480。注意不是 `getTimezoneOffset()` 的符号 |
| createdAt / updatedAt | string | ISO 8601 UTC |

复合目标相关字段（`profile.goals`、`profile.goalEffectiveDate`、`profile.goalSource`、`profile.bodyFatPct`、`profile.refeedDays`、`training.startTime`、`training.quality`、`health.illness`）是 v4.0 的**加法字段**：`schemaVersion` 仍为 2，缺失为 `null`，不改变旧日志解析。

## profile（账号档案）

`profile` 存在 `users.profile`，不随日志落库。复合目标相关字段如下（其余已有字段未展开）：

| 字段 | 类型 | 取值域 | 必填 | 写入方 | 说明 |
|---|---|---|---|---|---|
| `goals` | string[] | `goal-matrix.md` 的 15 个原子 ID；长度 0–4：≤3 个计入目标名额 + ≤1 个 `G-IMM` 监测；顺序即优先级（同层冲突时第一个优先，L0–L2 护栏可临时越级），不设 `goalPriority`；`G-MED` 不在可选集，不写入该数组 | 否，默认 `[]` | 营养师（`coachApi.setGoals`） | 拳王端只读；`saveProfile` 必须 LOCKED；`G-IMM` 不占 3 个名额、不任 lead |
| `goalEffectiveDate` | string | `YYYY-MM-DD` | `goals` 非空时必填 | 营养师 | 历史日志按此日期解释目标 |
| `goalSource` | string | 当前只允许 `'nutritionist'`；不预留 `'import'`/`'system'` | `goals` 非空时必填 | 营养师 | 审计用；与 `phaseSetBy` 同构 |
| `bodyFatPct` | number | 3–50（%） | 否，默认 `null` | 营养师（`coachApi.setGoals` 可选携带，或 `coachApi.setBodyComp` 单独更新） | 只存百分比；测量方法（DXA/BIA/皮褶）写 `profile.note`，不设 `bodyFatMethod`/`bodyFatMeasuredAt`；仅用于 EA/FFM 粗估；缺省时 EA 标“数据不足”，不判红。三态：**省略字段 = 保留原值；显式 `null` = 清除；非 number 或不在 3–50 = `E_GOAL_BODYFAT`** |
| `refeedDays` | number | 0–7 的整数 | 否，默认 `null` | 营养师（`coachApi.setRefeedPlan`，唯一写入方） | 当周计划 refeed 天数，复核页输入；`0` 或 `null` 视为本周无计划；运行时按 `event.refeedDays → profile.refeedDays → null` 取值；`saveProfile` 必须 LOCKED |

已有且只能由营养师写的字段：`phase`、`phaseEffectiveDate`、`phaseSetBy`、`phaseSetAt`、`maintainBandPct`、`coachOpenid`、`refeedDays`。这些字段与 `goals` 一样，拳王端保存档案时必须原样保留。

注意：`profile.goals` 是目标的持久化权威来源；`evaluate` 运行时若传入 `ctx.goals`，则以 `ctx.goals` 优先（用于未保存目标预览与复核），否则读 `profile.goals`。`log.goal` 仍然只表示“本次记录时的目标体重/称重日/阶段”，**不要把目标 ID 写进 `log.goal`**，避免每日记录与档案目标漂移。

## weights

```json
"weights": {
  "morning": { "kg": 58, "context": "morning_fasted", "at": "07:10" },
  "pre":     { "kg": 59, "context": "pre_train" },
  "post":    { "kg": 56.8, "context": "post_train" },
  "official": null
}
```

- 只有 `morning_fasted` 进入趋势、7 日移动平均、减重速率。
- `pre` − `post` 用于计算训练脱水：`pct = (pre − post) / pre × 100`，补液量 `= (pre − post) × 1.25~1.5 L`。
- `official` 是赛前官方称重，单独存，不与日常体重混。

## sleep / hydration / 主观

```json
"sleep": { "hours": 7.5, "quality": 4 },
"hydration": { "waterMl": 2200, "urineColor": 2 },
"restingHr": 56,
"sorenessByArea": { "shoulder": 8, "back": 6, "arm": 4, "leg": 2, "core": 0 },
"mood": { "fatigue": 2, "stress": 3, "appetite": 2 }
```

量表锚点（必须写进 UI 文案，否则数字没有可比性）：

| 字段 | 范围 | 锚点 |
|---|---|---|
| sleep.quality | 1–5 | 1 极差、3 一般、5 很好 |
| urineColor | 1–8 | 1 透明、3 淡黄（良好）、5 偏深（缺水）、7–8 茶色（就医） |
| sorenessByArea.* | 0–10 | 0 无、3 轻微、5 影响动作、7 影响训练、10 无法训练 |
| mood.* | 1–5 | 1 好、5 差 |

## training

```json
"training": {
  "sessionType": "sparring",
  "startTime": "18:30",
  "durationMin": 90,
  "rpe": 8,
  "rounds": 12,
  "quality": 4,
  "content": "实战对练 12 回合"
}
```

- `sessionType`: `rest | cardio | strength | technique | sparring | recovery`
- `sRPE = durationMin × rpe`，用于周负荷曲线。周环比 >15–20% 是伤病高发区。
- `startTime`（可选）：`HH:mm` 24 小时制，默认 `null`。只在 POW/SPD/END/SKL/HYP 目标激活时出现，用于判断训练前 1–3h、训练后 2h 的补给时机；缺失时跳过 `goalAdherence.fuelTiming`，**不输出该组件**，不判红、不记 `dataOk=false`。
- `quality`（可选）：1–5 主观质量，默认 `null`。锚点：1 极差、3 一般、5 很好。只在 SPD/POW/SKL 目标激活时出现，是 `goalAdherence` 三个新增评分组件之一（`fuelTiming / sessionQuality / refeedCadence`）；缺失时该项跳过，并对剩余组件重新归一。
- `startTime` / `quality` 是 v2 的加法字段，缺失为 `null`，不升 `schemaVersion`；`normalizeLog()` 必须接收这两个字段，否则云端会丢弃。

| 字段 | 类型 | 取值域 | 必填 | 写入方 | 说明 |
|---|---|---|---|---|---|
| `training.startTime` | string | `00:00–23:59` 的 `HH:mm` | 否，默认 `null` | 拳王 | 目标字段；缺失时 `fuelTiming` 不评分 |
| `training.quality` | number | 1–5 | 否，默认 `null` | 拳王 | 目标字段；缺失时 `sessionQuality` 不评分 |

## health（可选）

```json
"health": { "illness": 0 }
```

| 字段 | 类型 | 取值域 | 必填 | 写入方 | 说明 |
|---|---|---|---|---|---|
| `health.illness` | number | `0 / 1 / 2`，默认 `null` | 否 | 拳王 | 0 无、1 轻微上呼吸道症状、2 发热/就医。只在 `G-IMM` 监测激活时出现；弱证据，只监测，不产生新告警 |

`health` 是 v2 的加法对象，缺失时整体为 `null` 或 `{ "illness": null }`；`normalizeLog()` 不得用 `0` 代替“没填”。

## meals

```json
"meals": [
  {
    "slot": "lunch",
    "time": "12:30",
    "items": [
      { "id": "rice", "name": "米饭（熟）", "grams": 250, "kcal": 290, "protein": 6.5, "carbs": 64.8, "fat": 0.8 }
    ],
    "photoFileId": "cloud://...",
    "note": "",
    "source": "library",
    "kcal": 290, "protein": 6.5, "carbs": 64.8, "fat": 0.8
  }
]
```

- `slot`: `breakfast | lunch | dinner | snack`
- `source`: `library`（食物库）/ `vision`（照片识别，见 docs/vision-food.md）/ `text_only`（只有文字，不计热量）
- 每餐的 `kcal/protein/...` 是 items 的汇总，冗余存一份方便查询排序。
- **只有 `items` 非空的餐才计入"结构化餐数"**，餐数 <2 时引擎输出"数据不足"，不输出达标结论。

## nextPlan / goal

```json
"nextPlan": { "type": "speed", "areas": ["shoulder"], "intensity": "high", "note": "出拳速度强化" },
"goal": { "targetWeightKg": 56, "weighInDate": "2026-07-01", "phase": "cut" }
```

- `nextPlan.type`: `technique | speed | power | max_strength | conditioning | rest`
- 冲突规则：`type ∈ {speed, power, max_strength}` 且（酸痛峰 ≥7 或 睡眠 <6.5h）→ 输出 `plan-conflict` 红灯，建议改技术/恢复课。
- `goal.phase`: `maintain | cut | peak | recover`，决定蛋白系数（1.6–2.2 或 2.0–2.4）与能量判定方向。旧数据里的 `weighin` 由 `PHASE_ALIAS` 映射到 `peak`，不要写入新记录。

## 派生字段（ctx，不落库）

以下字段只属于 `evaluate(rawLog, ctx)` 的调用上下文，**不写入 `logs`、不写入 `profile`**；缺失时按表降级，不视为数据错误。

| 字段 | 类型 / 结构 | 产出方 | 来源与算法 | 缺失时 |
|---|---|---|---|---|
| `ctx.guardrailRed` | `string[]`，元素为 `G-SLE / G-GI / G-EA` | G4 `evaluate` | 基础规则 `emit` 后汇总红灯：`SLE-01`→`G-SLE`、`GI-01`→`G-GI`、`bodyFatPct` 已知且 `eaKcalKgFfm<30`→`G-EA`；去重，按 L2 优先级 `G-EA → G-GI → G-SLE` 排序。`G-IMM`（`role=monitor`）与 `G-MED`（人工标记）永远不进该数组 | `[]`；不触发护栏 lead 越级 |
| `ctx.refeed` | `{ rate?: 0–1; okDays?: int; totalDays?: int; ok?: boolean; plannedDays?: int; actualDays?: int; successRate?: 0–100; targetCarbsGPerKg?: number; targetCarbsG?: int }` | 周报/复核适配层（G6） | 取周报窗口 `weekly.fromDate/toDate`；`weekly.weight.weeklyRate/weeklyPct` 判断 cut 是否需要 refeed；计划天数按 `event.refeedDays → profile.refeedDays → null` 取值，`plannedDays = totalDays = min(计划天数, 窗口天数)`；`okDays` 为 `logs.meals[].carbs` 按日汇总达到 refeed 日目标（默认 6 g/kg，高于减脂常规 3–5）的天数；`rate=okDays/totalDays`，`actualDays=okDays`，`successRate=round(rate×100)`；消费端只用 `rate / okDays / totalDays`，`plannedDays / actualDays / successRate / targetCarbsGPerKg / targetCarbsG` 只作展示 | `goalAdherence.refeedCadence` 跳过并重归一；不判 unknown |
| `ctx.eaKcalKgFfm` | number，kcal/kg FFM | G4 `evaluate` | `FFM = 最近 7 日晨重均值 × (1 − bodyFatPct/100)`；`EA = (摄入 kcal − 训练课净消耗 kcal) / FFM`；摄入来自 `meals` 汇总，训练课净消耗按 `(MET − 1) × 3.5 × 体重(kg) / 200 × 时长(min)` 估算（课型表见 `goal-matrix.md` §7.6.1），不用 `energy.tdee`；该估算为工程近似、不作为处方 | `G-EA` 写 `blockerType='data_missing'`、`action='monitor'`；不判红、不给数值 |

`weekly.js` 已输出结构化 `refeed`（字段见 `goal-matrix.md` §7.2，结构见本节）；没有计划天数时 `goalAdherence.refeedCadence` 跳过并重归一。

## 云函数写入与 LOCKED 规则（复合目标字段）

| 云函数 | 行为 | 约束 |
|---|---|---|
| `saveProfile` | 只写 `ALLOW` 白名单；`goals / goalEffectiveDate / goalSource / bodyFatPct / refeedDays` **不在 ALLOW 里** | 必须把这五个字段加入 `LOCKED`，保存档案时原样保留；拳王端不能自改目标、体脂或 refeed 计划 |
| `coachApi.setGoals` | 营养师设置目标的唯一入口（G6） | 校验 `coachOpenid` 归属；拒绝未知 ID、重复 ID、计入名额 >3、`G-IMM` >1、`G-MED` 等不可选标记；**对当前阶段不合法的目标直接拒绝写入**，返回错误码（`E_GOAL_UNKNOWN/DUPLICATE/QUOTA/PHASE_ILLEGAL/CONFLICT/FORBIDDEN/EMPTY_DATE/BODYFAT/WRITE`）并整次不落库；可携带可选 `bodyFatPct`（3–50；省略 = 保留原值，显式 `null` = 清除，非法 = `E_GOAL_BODYFAT`）；`E_GOAL_EMPTY_DATE` 由 G6 校验，G2 不触发；初次保存只接受 `legality='legal'`，预检为 `partial` 时返回 `E_GOAL_CONFLICT`、整次不落库；`G-IMM` 不在末尾时先归一化到末尾；不自动改 `phase`；`setPhase` 后旧目标变不合法由 `GOAL-01` 提示 |
| `coachApi.setBodyComp` | 营养师写入 `bodyFatPct` | 校验 `coachOpenid` 归属；`bodyFatPct` 取 3–50；只存百分比，测量方法写 `profile.note`；只用于 EA/FFM 粗估，不参与 `score`；与 `setGoals` 可携带的 `bodyFatPct` 写同一字段、共存：只更新体脂时走本 action，不改目标；三态一致：省略 = 保留原值，显式 `null` = 清除，非法 = `E_GOAL_BODYFAT` |
| `coachApi.setRefeedPlan` | 营养师写入 `refeedDays` | `refeedDays` 唯一写入方；校验 `coachOpenid` 归属；取值 0–7 整数，非法返回 `E_GOAL_REFEED`，`null`/`0` 视为本周无计划；同时写 `refeedDaysSource='coach' / refeedDaysUpdatedAt / refeedDaysSetBy` 审计；只写 `profile` 下的 `refeedDays` 及上述审计字段，不改目标、不改阶段；运行时按 `event.refeedDays → profile.refeedDays → null` 取值 |
| `saveLog` | 通过 `normalizeLog()` 接收日志 | `training.startTime`、`training.quality`、`health.illness` 必须进入 `normalizeLog()`，否则云端会丢弃；`athleteId` 仍由服务端写 openid |
| `getFeed` / `advice` | 读取 `profile.goals` 生成目标计划/快照 | 只读；`advice` 快照存 `rulesVersion`、`goalMatrixVersion`、`goalPlan`、`goalAdherence`、`goalBlockers`、`goalEffectiveDate`、`goalSource` |

目标字段的通用约束：

1. 所有新字段都是**可选加法字段**，缺失为 `null`，不得用 `0` 或 `""` 代替“没填”。
2. 目标字段不进入 `fieldSchema.required`；`LOG-01` 不因目标字段缺失报警。
3. `goalAdherence` 只统计目标独有行为，不重复统计睡眠、酸痛、体重速率、蛋白总量、能量盈亏。
4. `goalBlockers` 不是告警，不进入 `alerts`；护栏否决只引用现有 owner 规则。

## 与 v1 的映射

| v1 | v2 |
|---|---|
| `morningWeight: "58"` | `weights.morning.kg: 58` |
| `preTrainWeight: "59"` | `weights.pre.kg: 59` |
| `postTrainWeight: "56.8"` | `weights.post.kg: 56.8` |
| `sleepQuality: "4"` | `sleep.quality: 4`（**v1 没有时长，迁移后 hours=null，界面会提示补**） |
| `soreness: "8"` | `sorenessByArea` 全部字段无法还原 → 迁移时记为 `overall=8`，只影响当天，不进趋势 |
| `trainingContent: "有氧，手臂肩背力量"` | `training.content`，无类型/时长/RPE（提示补） |
| `focusAreas: ["肩部","背部"]` | 保留（注意：这是"练了哪里"，不是"哪里酸"） |
| `meals[].note` | `meals[].note` + `source: "text_only"`，不计热量 |
| `photosCount` / `photoFilenames` | 删除 count，只留 `photoFileId` |
| `timestamp` | `createdAt`（UTC ISO） |

迁移脚本：`node scripts/migrate.js <v1.json> <out.json>`

## 不变式（写新代码时守住）

1. number 就是 number，缺失就 `null`，不要 `""`。
2. `date` 永远是本地日期，`createdAt` 永远是 UTC —— 两者不能互相推导，必须分别存。
3. 任何"体重"必须带 `context`，否则默认它不是晨重。
4. 任何告警必须能指到知识库 id（测试第 6 项会检查）。
5. 记录不完整时输出"数据不足"，不要用 0 当作"没吃"。
6. 目标字段是加法字段，缺失就是 `null`；不要用 `0`、`[]` 或 `""` 伪装"没填"。
7. `profile.goals` 只由营养师写，拳王端只读；`log.goal` 不承载目标 ID；数组顺序即优先级（同层冲突时第一个优先，L0–L2 护栏可临时越级），不设 `goalPriority`。
8. `goalAdherence` 不参与 `score`、`level`、`headline`，不进任何总分/综合分；同一现象只能由 owner 规则扣一次分。
9. 目标名额：`goals` 中最多 3 个计入名额，`G-IMM` 额外最多 1 个且不占名额；`G-MED` 不是可选目标，不写入 `goals`、不占名额、不担任 `goalPlan.lead`，医疗转诊信息写 `profile.note`。
10. `ctx.guardrailRed`、`ctx.refeed`、`ctx.eaKcalKgFfm` 是 `evaluate` 派生字段，不写入 `logs`/`profile`；缺失按降级处理，不判数据错误。
11. `legality='partial'` 只在阶段被改后的复核出现；初次 `setGoals` 只接受 `legal`，预检为 `partial` 时返回 `E_GOAL_CONFLICT`、整次不落库。
