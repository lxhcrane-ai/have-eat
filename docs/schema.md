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
  "durationMin": 90,
  "rpe": 8,
  "rounds": 12,
  "content": "实战对练 12 回合"
}
```

- `sessionType`: `rest | cardio | strength | technique | sparring | recovery`
- `sRPE = durationMin × rpe`，用于周负荷曲线。周环比 >15–20% 是伤病高发区。

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
- `source`: `library`（食物库）/ `vision`（拍照识别，预留）/ `text_only`（只有文字，不计热量）
- 每餐的 `kcal/protein/...` 是 items 的汇总，冗余存一份方便查询排序。
- **只有 `items` 非空的餐才计入"结构化餐数"**，餐数 <2 时引擎输出"数据不足"，不输出达标结论。

## nextPlan / goal

```json
"nextPlan": { "type": "speed", "areas": ["shoulder"], "intensity": "high", "note": "出拳速度强化" },
"goal": { "targetWeightKg": 56, "weighInDate": "2026-07-01", "phase": "cut" }
```

- `nextPlan.type`: `technique | speed | power | max_strength | conditioning | rest`
- 冲突规则：`type ∈ {speed, power, max_strength}` 且（酸痛峰 ≥7 或 睡眠 <6.5h）→ 输出 `plan-conflict` 红灯，建议改技术/恢复课。
- `goal.phase`: `maintain | cut | weighin | recover`，决定蛋白系数（1.6–2.2 或 2.0–2.4）与能量判定方向。

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
