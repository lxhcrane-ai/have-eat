# 跟进队列：把"全量指标"换成"今天要处理的 N 件事"

营养师后台原来的信息主体是一行 `coachSummary`（评分 · 晨重 · 脱水 · 蛋白…），看一眼知道"大概还行"，但驱动不了动作。现在改成：规则引擎判定需要人跟进的事才进队列，其余留在拳手端自己看。

- 纯逻辑：`miniprogram/utils/followup.js`（云函数、离线模式、测试共用）
- 云接口：`cloudfunctions/coachApi`（action: list / generate / confirm / dismiss / snooze / history）
- 页面：`pages/queue/queue`（跟进队列）、`pages/rules/rules`（规则库）
- 集合：`followups`（跟进项）、`reminders`（次日提醒）、`phase_history`（阶段变更）、`rule_reviews`（规则复核）
- 演示：`node scripts/demo-followup.js`　测试：`node scripts/test-followup.js`（35 项）

---

## 一、FollowUpItem 数据模型

```js
{
  id: 'a-li:2026-10-25:HYD-01',   // athleteId:date:ruleId，稳定可复现
  itemId: 'a-li:2026-10-25:HYD-01', // 落库字段（id 是微信云数据库保留字段）
  athleteId, athleteName,
  date: '2026-10-25',
  ruleId: 'HYD-01', ruleName: '训练脱水百分比',
  level: 'red' | 'amber',
  title: '脱水 3.4%：今天必须优先补液',
  evidence: '训练前 59kg → 训练后 57kg，掉 2kg，脱水 3.4%；饮水 700ml，缺口 1800ml',
  suggestedAction: '让拳王今晚按失重 ×1.25–1.5 补含钠液体，明早复称并记录尿色',
  status: 'pending' | 'confirmed' | 'dismissed' | 'snoozed',
  nutritionistNote: '内部备注',
  nextReminderDate: '2026-10-26',   // 确认后 = 次日
  consecutiveDays: 2,               // 连续未解决天数
  escalated: true,
  escalationReason: '连续 2 天未解决；晨脉偏离 ≥8 次/分',
  requiresFollowUp: true,
  code: 'hyd-critical',             // 旧 legacy code，兼容历史数据
  nutritionistId, createdAt, updatedAt
}
```

`reminders`（拳王端唯一可见的"提醒"）：

```js
{
  id: 'rem_a-li:2026-10-25:HYD-01_2026-10-26',
  fromItemId, athleteId, athleteName, ruleId,
  date: '2026-10-26',              // 拳王看到的日期 = 次日
  text: '营养师改写后的文案',
  sourceTitle: '原始告警标题',      // 仅后台回溯用，拳王端不展示
  nutritionistId, read: false, createdAt
}
```

---

## 二、队列生成与升级

```
当日 logs + profile.phase
  → rules.evaluate()（阶段决定规则集）
  → 只保留 requiresHumanFollowUp === true 且 level ∈ {red, amber} 的告警
  → 同一 ruleId 同日多条合并（REC-02 的"酸痛 8"与"计划冲突"合一条，保留更可执行的文案）
  → 回溯最近 8 天 followups：同 athlete+rule 且 status ∈ {pending, snoozed} 连续存在 → consecutiveDays++
  → 升级：consecutiveDays ≥ 2，或 rule ∈ {PHASE-01}（周降幅 >1%），或 REC-03 晨脉偏离 ≥8
        升级项 level 强制为 red，排最前
  → 分组（按拳手）：只显示 pending / snoozed，组头显示条数、升级数、最高级别
```

已 `confirmed` / `dismissed` 的项视为"已处理"，连续天数从 1 重新计——营养师确认过就不该继续升级。

关键取舍：
- **只有 red/amber 才入队**，info（如尿色提示、补剂未执行）不进人工队列。
- **同一项不重复造**：id 由 athlete+date+ruleId 决定，多次生成只更新不新增。
- **队列生成是幂等的**：营养师打开页面若当天还没有队列，自动生成一次；也可手动"重新生成"。

---

## 三、营养师后台页面结构

```
┌──────────────────────────────────────────────┐
│  11        件事需要处理       2026-10-25      │  ← 第一眼是数字，不是指标
│            4 项升级                            │
│  [重新生成队列]  [规则库]                      │
├──────────────────────────────────────────────┤
│  待处理  |  已确认 / 已忽略                    │
├──────────────────────────────────────────────┤
│  【阿力】 5 项 · 4 项需人工介入       [有红灯] │
│   ┌────────────────────────────────────────┐ │
│   │ HYD-01 [必须] [升级] [规则待复核]      │ │
│   │ 脱水 3.4%：今天必须优先补液            │ │
│   │ 证据：训练前 59kg → 57kg… 缺口 1800ml  │ │
│   │ 建议：按失重 ×1.25–1.5 补含钠液体      │ │
│   │ 连续 2 天未解决 / 升级原因：…          │ │
│   │ ┌────────────────────────────────────┐ │ │
│   │ │ 次日提醒文案（可改写）              │ │ │
│   │ └────────────────────────────────────┘ │ │
│   │ [营养师备注（内部可见）]               │ │
│   │ [确认发送次日提醒] [稍后] [忽略]       │ │
│   └────────────────────────────────────────┘ │
│  【小马】3 项 …                                │
│  【阿杰】3 项 …                                │
└──────────────────────────────────────────────┘
```

伪代码（页面 JS）：

```js
load()        → coachApi.getQueueForNutritionist(date) → groups + stats
refreshQueue()→ coachApi.generateFollowUpQueue(date)
confirm(e)    → coachApi.confirmFollowUp(id, reminderText, note) → 写 reminders + status=confirmed
snooze(e)     → coachApi.snoozeFollowUp(id, 1) → nextReminderDate = 明天，连续天数继续累计
dismiss(e)    → wx.showModal 确认 → coachApi.dismissFollowUp(id, note) → 重置连续天数
switchTab('history') → coachApi.getHistory()  // 已确认/已忽略，可按拳手与日期筛选（后端 orderBy date desc）
```

拳王端：`pages/index` 顶部只渲染 `reminders`（来自 `getFeed` 的 `reminders` 字段），显示营养师改写后的文案与来源规则，**不显示系统原始告警**。没填记录时也能看到提醒。

---

## 四、模拟数据集与预期结果

`scripts/fixtures/followup-demo.js`：3 名拳手 × 2 天。

| 拳手 | 阶段 | 第 1 天 | 第 2 天 |
|---|---|---|---|
| 阿力 | cut | 训练掉 2kg（3.4%）、蛋白 88g（下限 116）、晨脉 66（基线 58）、酸痛 4 | 同上 + 酸痛肩 8、次日速度课、睡眠 6.5h、蛋白 90g |
| 小马 | peak | 补液 2950/3000、GI 正常、睡眠 8h、补剂按计划 | 补液 2100/3000（70%）、恶心 3、睡眠 6.5h、咖啡因漏服 |
| 阿杰 | recover | 称重后补液 2200ml、碳水 520g、恢复感 4 | 补液 300ml、碳水 50g、恢复感 2、称重 54kg、晨重 54.6kg |

### 第 1 天（2026-10-24）队列

```
阿力（4 项）全部 pending
  REC-03 晨脉高于基线 8 次/分          red
  PRO-01 蛋白严重不足：88/116g（下限）  red
  ENE-01 缺口过深 988 kcal             red
  HYD-01 脱水 3.4%                     red
小马、阿杰：0 项（当天正常 → 不制造待办）
```

### 第 2 天（2026-10-25）队列：11 项，4 项升级

```
【阿力】5 项，升级 4 项
  [升级] PRO-01 蛋白严重不足 90/116g（连续 2 天）
  [升级] ENE-01 缺口过深 1037 kcal（连续 2 天）
  [升级] HYD-01 脱水 3.4%（连续 2 天）
  [升级] REC-03 晨脉 +8（连续 2 天；晨脉偏离 ≥8 次/分）
  [red]  REC-02 明日计划与恢复状态冲突（连续 1 天；当天新增）
【小马】3 项，升级 0 项
  [red]  GI-01 胃肠症状 3/4
  [amber] HYD-05 补液计划只执行了 70%
  [amber] SLE-01 睡眠 6.5h（peak 阈值 <7h）
【阿杰】3 项，升级 0 项
  [red]  HYD-04 称重后补液严重不足（300ml）
  [red]  REC-04 体重只回升了 15%
  [amber] REC-01 称重后碳水偏少（50g）
```

### 确认后

```
跟进项 HYD-05（小马）→ 营养师改写成：
"小马，昨天补液 2100/3000ml，差得有点多。今天每小时 300ml，分 5 次喝完，必须含钠。"
reminders 新增：{ athleteId: 'xiao-ma', date: '2026-10-26', ruleId: 'HYD-05', fromItemId: 'xiao-ma:2026-10-25:HYD-05' }
拳王端 2026-10-26 首页只看到这一段 + "来自 HYD-05"
```

### 对照：第 1 天就确认的情况

阿力 HYD-01 的 `consecutiveDays` 变回 1、`escalated=false` —— 连续天数只统计"未解决"。

---

## 五、边界与后续

- 队列生成依赖 `logs` 当天有记录；拳王没填 → 不进队列（但 `LOG-01` 会在拳王端提示）。
- 云端集合未创建时，页面自动退化：`getQueueForNutritionist` 返回空 + `offline: true`，不会白屏；`confirm` 会把提醒写本机（便于离线演示）。
- 跟进项不会自动删除：`dismissed` / `confirmed` 永久留在历史，供季度复盘（哪条规则最常触发人工介入）。
- 下一步可加：按规则统计"确认率 / 忽略率"，识别阈值过松的规则；以及把 `requiresHumanFollowUp` 做成阶段级覆盖（例如 peak 期 GI-01 一律升级）。
