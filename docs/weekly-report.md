# 周报与阶段建议

两个能力都是为了回答同一个问题：**"这一周到底怎么样，下一步改什么"**。周报给结论，阶段建议给时机。

- 周报逻辑：`miniprogram/utils/weekly.js`（纯函数）
- 周报页面：`pages/report/report`（拳王看自己；教练从后台按拳王进入）
- 阶段建议：`miniprogram/utils/rules.js` 的 `suggestPhase(profile, { today })`
- 演示数据：`node scripts/gen-seed.js 2026-10-25` → 写入 `miniprogram/data/seed.js`（14 天）
- 测试：`node scripts/test-weekly.js`（59 项，含阶段边界与周报口径）

---

## 一、周报口径

`buildWeekly({ logs, profile, phase, endDate, days })` 输出：

| 字段 | 说明 |
|---|---|
| `weight` | 首末晨重、周内变化、7 日回归斜率（kg/周）、占体重百分比、有效点数 |
| `protein` | 达标率（按"区间下限"判定）、达标天数/可判定天数、日均克数、目标下限 |
| `energy` | 日均摄入、日均盈亏（只统计数据完整的 days） |
| `load` | 总 sRPE、日均、课次、峰值日期 |
| `sleep` | 均值、低于本阶段阈值的天数（peak 用 7h，其余 6.5h） |
| `hydration` | 脱水 ≥2% 天数 / 可测天数；peak 期改成"计划执行率均值" |
| `recovery` | 酸痛峰值、酸痛 ≥7 天数、胃肠症状 ≥2 天数 |
| `ruleHits` | 按红灯数排序的规则触发统计（规则 ID + 天数） |
| `conclusions` | 3–6 条结论，每条都带数字 |
| `nextWeek` | 1–4 条下周动作，按阶段 + 最弱项生成 |
| `text` | 可直接复制发教练的纯文本（约 7 行） |

关键取舍：

- **只统计有记录的天**，缺记录不算"做得差"，但会单独提示"完整记录 N 天"。
- 微调期周报**不出现脱水百分比**（HYD-01 被阶段抑制），改统计计划执行率；测试里断言了"微调期周报里不出现 HYD-01"。
- 规则触发统计的每个 `ruleId` 都必须存在于登记表，且必须是本阶段启用的规则（测试断言），防止周报和阶段机脱钩。

### 示例输出（演示数据，cut 期）

```
【2026-10-19 ~ 2026-10-25 周报】减脂期
晨重 60.1 → 59.7kg（-0.5kg/周，0.8%）
蛋白 86%（6/7 天）
训练 2940 sRPE / 7 课 · 睡眠 7.1h
脱水≥2% 1/7 天
主要问题：PRO-01 蛋白总量×1；ENE-01 能量盈余 / 缺口×1；SLE-01 睡眠时长×1
下周：保持当前节奏：减脂期的目标是「每周降 0.5–1% 体重，蛋白上调保肌，缺口 300–600 kcal」，下周同一时间再看趋势
```

---

## 二、阶段建议（只建议，不自动改）

```
距称重 > 84 天        → maintain（还没到减脂窗口）
距称重 15–84 天        → cut（但若体重已接近目标，差 ≤1.5% → maintain）
距称重 ≤ 14 天         → peak
称重已过 0–2 天        → recover
称重已过 > 2 天        → maintain
未设称重日            → maintain（并在理由里说明）
```

返回 `{ current, phase, phaseLabel, reason, daysToWeigh, gapPct, changed, urgency }`。

- `changed=true` 才在界面上提示；`urgency=amber` 表示 21 天内要动。
- 教练端每个拳王卡片显示"系统建议：切到 X（理由）"+"采纳建议"，点一下走 `setAthletePhase`（写 `phase_history`）。
- 拳王端「我的」只读展示："按称重日推算，系统建议是 X……实际切换由营养师操作"。
- **不自动改阶段**：阶段影响评分权重与告警集合，自动切换会让历史记录的解释口径突变，必须有人确认。

---

## 三、演示数据

```bash
node scripts/gen-seed.js 2026-10-25   # 生成 14 天，权重数据在脚本顶部常量里
```

- 14 天，体重 60.6 → 59.7kg（约 0.83%/周，落在安全区间）
- 其中 2 天是"没做好"的日子：蛋白 59g（下限 120）、脱水 3%、睡眠 5.6h、酸痛 8 且次日速度课
- 首次启动且本机无记录时自动导入（`app.js` 的 `importSeed`），所以打开就能看到趋势折线、周报、今日评分
- 正式使用前把 `miniprogram/data/seed.js` 改回 `module.exports = []`（`preflight` 会在有演示数据时给出提醒）

---

## 四、验证

```bash
node scripts/test-weekly.js   # 59 项：阶段建议 10 个边界 + 周报 cut/peak/空数据/稀疏数据
node scripts/gen-seed.js      # 重新生成种子（改日期即可）
node scripts/preflight.js     # 会检查 report 页面存在、seed 是否含演示数据
```
