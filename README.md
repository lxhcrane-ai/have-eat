# 拳王备赛营养教练（微信小程序 + 云开发）

> **下次开工先读 `docs/NEXT-STEPS.md`**：部署验收 7 步、待办优先级、需要你拍板的两件事、一键自检命令。
> 项目目录已从 `E:\AI\运动营养` 改名为 `E:\AI\冠军运动营养`，WSL 路径 `/mnt/e/AI/冠军运动营养/boxer-coach`。

拳王每天填 30 秒，立刻拿到基于运动营养共识的反馈；教练端实时看到评分、红灯项和趋势，并能直接留言沟通。
没有服务器、没有 ICP 备案，全部跑在微信云开发上，两个人用不需要第三台服务器。

---

## 一、这套东西解决什么

原版那种记录（`boxer_logs_2026-05-16.json`）只留下"我今天做了什么"，看完还是不知道该改什么。这里补了四层：

1. **数据结构修好**：数值是 number、有 id/athleteId/schemaVersion、时区统一（tzOffset 是 UTC 以东分钟数）、去掉冗余 count 字段、每次称重带称重条件（空腹/训练前/训练后/官方）。
2. **补齐核心维度**：餐食结构化（食物库 + 克数 → 热量/蛋白/碳水/脂肪）、睡眠时长、训练时长 × RPE（sRPE）、分部位酸痛、目标体重与称重日、阶段（维持/减脂/微调/恢复）。
3. **规则引擎 + 知识库**：33 条带出处的运动营养条目，规则引擎只给出能被条目解释的结论，每条告警都挂着知识库引用。
4. **双端实时**：拳王保存 → 云函数算完 → 教练端红点与摘要；教练留言 → 拳王端 4 秒内看到。

---

## 二、5 分钟部署

### 1. 导入项目
微信开发者工具 → 导入项目 → 选择 `boxer-coach` 目录 → 填自己的 AppID（个人主体也能开云开发）。

`project.config.json` 里 appid 是 `touristappid`，导入时改成自己的即可。

### 2. 开云开发、填环境 ID
工具栏「云开发」→ 开通 → 复制环境 ID → 填进 `miniprogram/config.js` 的 `env`。

```js
env: 'cloud1-xxxxxxxxxxxx',
coachCode: 'COACH-8888',   // 邀请码，改成你自己的
```

### 3. 建 9 个集合
云开发控制台 → 数据库 → 新建集合，权限全部选 **仅创建者可读写**：

```
users      logs      messages      inbox      settings
followups  reminders phase_history rule_reviews
```

- `followups`：营养师跟进项（status / consecutiveDays / escalated）
- `reminders`：营养师确认后的次日提醒（拳王端只读这一张）
- `phase_history`：阶段变更审计（谁、何时、从什么阶段切到什么阶段）
- `rule_reviews`：规则复核状态（needs_review 等），没建就按登记表默认值跑

然后在 `settings` 里手动加一条：`{ "key": "coachCode", "value": "COACH-8888" }`
（不建也能跑，代码里有默认码兜底。）

### 4. 上传云函数
云函数目录里 9 个函数，逐个右键 → **上传并部署：云端安装依赖**（不要选"上传"）：

```
whoami   saveLog   getFeed   chat   bind   saveProfile   inbox   coachApi   visionFood
```

`coachApi` 是营养师后台的唯一入口：阶段设置、跟进队列、规则复核。
`visionFood` 负责餐食照片识别，需要单独配三个环境变量（不配也能跑，识别按钮会提示未配置）：

```
VISION_BASE_URL   例如 https://dashscope.aliyuncs.com/compatible-mode/v1
VISION_MODEL      例如 qwen-vl-max / glm-4v / doubao-vision-pro
VISION_API_KEY    供应商 key（只放云函数，不要写进小程序）
```

`saveLog` / `getFeed` / `coachApi` 都依赖 `lib/` 下的共享代码（规则引擎、知识库、规则登记表、跟进队列），`visionFood` 依赖 `lib/vision.js`。改过
`miniprogram/utils/rules.js`、`miniprogram/utils/followup.js`、`miniprogram/utils/vision.js`、`miniprogram/data/knowledge.js` 或
`miniprogram/data/ruleRegistry.js` 后，先跑一次：

```bash
bash scripts/sync-shared.sh
```

再重新上传对应函数，否则服务端还是旧逻辑。

### 5. 给 messages 配安全规则（要 watch 时用）
本项目聊天走云函数 + 4 秒轮询，**默认不需要**改安全规则。
如果你想要真正的实时推送而不是轮询，把 `messages` 集合权限改成「自定义安全规则」：

```json
{
  "read": "doc._openid == auth.openid || doc.readerOpenid == auth.openid",
  "write": false
}
```

然后在 `pages/chat/chat.js` 里把轮询换成 `db.collection('messages').where({chatId}).watch()`。
保持 `write: false`，所有写入仍由云函数完成。

### 6. 编译
点编译就能用。没配云环境时会自动进入**离线模式**：所有记录存本机、反馈照常计算，联网后在「我的 → 待同步」里补传。

---

## 三、两个人怎么用

### 拳王
1. 「我的」→ 填身高、年龄、性别、当前体重、目标体重、称重日、阶段（这几项决定蛋白和热量目标是否精准）。
2. 「填写」→ 晨重 / 训练前 / 训练后 → 睡眠 → 饮水 → 训练类型时长 RPE → 五个部位酸痛 → 三餐（食物库选 + 克数，或直接拍照）→ 明日计划 → 保存。
3. 保存后「今日」立刻出评分、指标和按级别排序的要点，每条要点可展开看依据。

### 教练
1. 「我的」→「教练：开启教练端」→ 输入同一个邀请码 → 自动接管所有用该码登记的拳王。
2. 进入「教练看板」：每个拳王一张卡，显示最近一天的评分、摘要、红灯项、距称重天数，可展开最近 14 天。
3. 点「发消息」直接留言；拳王端首页会出现"N 条教练消息"红点。

### 邀请码机制
一个码 = 一对人。拳王先输码会进入等待，教练输同一个码时自动回填绑定。
码存在 `settings.coachCode`，改这里即可换码（README 顶部也写着，不要发给第三个人）。

---

## 四、反馈是怎么算出来的

规则引擎 `miniprogram/utils/rules.js` 是纯 JS，小程序端和云函数端跑同一份（`scripts/sync-shared.sh` 负责同步）。

### 评分（0–100）
| 维度 | 权重 | 判定 |
|---|---|---|
| 水合 | 25 | 脱水 ≤1% 满分，>3% 只给 3 分 |
| 蛋白 | 25 | 达目标 100% 满分，<60% 给 5 分 |
| 能量 | 20 | 阶段内合理区间满分 |
| 恢复 | 20 | 酸痛 ≥7 扣 9，睡眠 <6.5h 扣 8 |
| 记录完整 | 10 | 3 餐满分，1 餐 2 分 |

### 触发的告警（每条都带知识库 id）
| 代码 | 条件 | 建议 |
|---|---|---|
| hyd-critical | 训练脱水 ≥3% | 补 loss×1.25–1.5L 含钠液体 |
| hyd-high | 脱水 2–3% | 分次补液 |
| protein-low | 蛋白 <60% 目标 | 加一份 150g 鸡胸或 30g 乳清 |
| energy-over | 减脂期盈余 >200 kcal | 收紧 300–600 kcal 缺口 |
| energy-under | 缺口 >900 kcal 或 <30 kcal/kg FFM | 红灯，防低能量可用性 |
| rate-fast | 周降幅 >1% 体重 | 放慢，保肌 |
| sleep-short | 睡眠 <6h | 今晚优先补觉，强度课减量 20% |
| sore-red | 任一部位酸痛 ≥8 | 取消速度/爆发课 |
| plan-conflict | 明日是速度/爆发/最大力量，且酸痛 ≥7 或睡眠 <6h | 改技术课或恢复课 |
| log-insufficient | 结构化餐食 <2 餐 | 只给"数据不足"，不假装达标 |
| hr-up | 晨脉高于基线 ≥5 次/分 | 减量 10–20% |

### 蛋白/热量目标
- 蛋白：维持期 1.6–2.2 g/kg，减脂期 2.0–2.4 g/kg（按当前体重）。
- 碳水参考 4–7 g/kg（仅作提示，当前版本按训练类型给建议文案）。
- 消耗：填了身高 + 年龄 + 性别用 Mifflin-St Jeor × 活动系数（1.375 休息 / 1.55 训练 / 1.725 实战）；没填就用体重 × 33（休息）或 × 40（训练日）粗估，界面标注"粗估"。

---

## 四·五、阶段状态机：阶段决定规则集

阶段不再只是一个标签，而是规则引擎的开关（`PHASE_PROFILES`，见 `miniprogram/utils/rules.js`）：

| 阶段 | 谁设置 | 水合怎么判 | 能量规则 | 主指标 |
|---|---|---|---|---|
| 维持期 maintain | 营养师后台 | 脱水百分比（HYD-01） | 开（ENE-01） | 睡眠、酸痛、晨脉、蛋白 |
| 减脂期 cut | 营养师后台 | 脱水百分比（HYD-01） | 开，缺口 300–600 | 蛋白、能量缺口、减重速率 |
| 微调期 peak | 营养师后台 | **补液计划执行率（HYD-05）**，HYD-01 被抑制 | **关** | 执行率、胃肠症状、睡眠 |
| 恢复期 recover | 营养师后台 | 称重后补液（HYD-04） | **关** | 补液、碳水、体重回升 |

- 拳王端阶段只读：`saveProfile` 的白名单里已经没有 `phase`，只有 `coachApi.setPhase` 能改，并写 `phase_history`。
- 被抑制的规则不是删掉，而是记进 `feedback.suppressed`，教练端能审计"本阶段没看什么、为什么"。
- 字段随阶段收缩/展开：`maintain` 只要晨重+睡眠+三餐；`cut` 加酸痛/晨脉/尿色；`peak` 加补液计划、胃肠症状、补剂执行；`recover` 加称重后补液/碳水/主观恢复感。
- 必填缺失时只说"数据不足"（`LOG-01`），不判达标，评分也不给这部分分。
- 完整矩阵：`docs/phase-matrix.md`（由 `node scripts/dump-docs.js` 从代码生成）。

对照验证（同一份记录：脱水 3.7%、蛋白 96g、酸痛 8、次日速度课、睡眠 6h）：

```
cut  → HYD-01 红灯、PRO-01 "差 20g 到下限"、ENE-01、REC-02、SLE-01 … 评分 38
peak → 不报 HYD-01/PRO-01/ENE-01；改报 HYD-05（缺计划数据）+ LOG-01 … 评分 48
```

`node scripts/test-phases.js` 47 项断言覆盖这个对照，并验证"peak 期计划内脱水（执行率 97%）不报警"。

---

## 四·六、跟进队列：营养师只看今天要处理的事

教练端首页第一眼是"今天需要你处理 N 件事"，不是一个评分摘要：

- 只看规则登记表里 `requiresHumanFollowUp: true` 且 red/amber 的项；info 不进队列。
- 同一拳手同一规则连续未解决 → 合并 `consecutiveDays`；≥2 天自动升级为"需人工介入"并置顶。
- 减重速率 >1%/周（PHASE-01）单次即升级；晨脉偏离 ≥8 次/分也升级。
- 每项给：规则 ID、标题、**触发证据**（"饮水缺口 1800ml"）、系统建议动作、三个按钮（确认发送次日提醒 / 稍后 / 忽略）+ 备注。
- 确认后可改写文案 → 写入 `reminders`，拳王次日首页只看到营养师写的这一段，看不到系统原始告警。
- 已确认/已忽略进历史，可按拳手与日期查。

模型、升级规则、页面结构、模拟数据集（3 名拳手 × 2 天，第二天 11 项 4 项升级）：`docs/followup-queue.md`。
演示：`node scripts/demo-followup.js`；测试：`node scripts/test-followup.js`（35 项）。

---

## 四·七、规则库：每条告警都能追到文献锚点

- 登记表：`miniprogram/data/ruleRegistry.js`，18 条规则、34 个来源锚点，每条含 ruleId、判定逻辑、阈值、适用阶段、`requiresHumanFollowUp`、复核状态、方法学警告。
- 告警展开"依据"不再只显示知识库标题，而是：`规则 HYD-01 · 训练脱水百分比` + 触发数据 + `[立场声明 2007] ACSM Position Stand 正文"Dehydration and performance"段：≥2% 即损害表现 doi:10.1249/mss.0b013e31802ca597`。
- 营养师在「规则库」页可把某条标为"待复核"（写 `rule_reviews`，**不改代码**），此后该规则触发的告警会带"该规则待复核"徽标。
- 已标待复核的两处真实冲突（阈值与 2025 年新版立场声明不一致）：PRO-01 蛋白口径（BM vs FFM）、PHASE-02 维持期带宽（+3–5% vs ISSN 2025 的 +12–15%）。细节见 `docs/rule-registry.md`。
- 对照表：`docs/rule-source-table.md`（生成式，勿手改）。

> 引用说明：IOC 2018 只有"补剂"共识（BJSM 2018;52:439-455），本项目只把它锚在 SUP-01；称重后恢复锚 ISSN 2025 与 ACSM 2016，不虚构"2018 综合运动营养共识"。

---

## 四·八、周报与阶段建议

**周报**（`utils/weekly.js` + `pages/report`）：7 天窗口，输出晨重斜率、蛋白达标率、能量、sRPE、睡眠、脱水天数、规则触发统计、3–6 条带数字的结论、1–4 条下周动作，外加一段可直接复制发教练的文本。

- 微调期口径不同：不统计脱水百分比，改统计补液计划执行率（与阶段机一致，测试有断言）。
- 只统计有记录的天，缺记录不会算成"做得差"，但会单独提示完整记录天数。
- 教练端每个拳王卡片有「周报」入口，可看下属的周报。

**阶段建议**（`rules.suggestPhase(profile, {today})`）：按距称重天数给出建议阶段与文字理由。

```
距称重 > 84 天 → 维持期     15–84 天 → 减脂期（体重已接近目标则仍维持）
≤ 14 天 → 微调期            称重后 0–2 天 → 恢复期      更久 → 维持期
```

只建议不自动改：教练端显示"建议切到 X（理由）+ 采纳建议"，拳王端「我的」只读展示推算结果。理由是不让人事后无法解释历史评分口径。

**演示数据**：`node scripts/gen-seed.js 2026-10-25` 生成 14 天（60.6 → 59.7kg，约 0.83%/周；其中 2 天蛋白 59g、脱水 3%、睡眠 5.6h、酸痛 8 且次日速度课）。首次启动本机无记录时自动导入，打开就能看到趋势折线、周报和今日评分。

细节与示例文本：`docs/weekly-report.md`；测试：`node scripts/test-weekly.js`（59 项）。

---

## 四·九、餐食拍照识别

`pages/log` 每餐的「拍照 → 识别」走云函数 `visionFood`，兼容 OpenAI `/chat/completions` 的视觉接口（通义 qwen-vl、智谱 glm-4v、豆包等都能用）：

```
拍照 → 上传云存储 → 云函数取图 → 多模态模型 → 解析/校验 → 候选条目
     → 用户勾选、改克数 → 加入这餐（items.source='vision'）→ saveLog
```

- key 只在云函数环境变量（`VISION_BASE_URL` / `VISION_MODEL` / `VISION_API_KEY`），小程序端拿不到。
- 模型输出必须过校验：JSON 兜底提取、字段别名、负数归零、克数 0–1500、单条热量上限 2500、条目上限 12、**4/4/9 自洽**（偏差 >35% 按宏量重算并告警）。
- 失败即失败：未配置 / 限流 / 超时 / 没识别出食物都返回明确 `reason`，前端给可读提示并引导手工记录，不假装成功。
- 每日 30 次上限（`users.visionCalls`），防 key 被刷。
- 误差固定声明：±20–30%，有参照物更准；整餐含识别条目时 `meal.source='vision'`，周报与教练端能区分"估的"和"选的"。

细节：`docs/vision-food.md`；测试：`node scripts/test-vision.js`（44 项）。

---

## 五、数据契约

见 `docs/schema.md`。要点：

- `schemaVersion: 2`，`athleteId` + `date` 唯一决定一条记录，重复提交是更新不是新增。
- 所有数值是 number；缺失为 `null`，不要用 `""` 或 `"0"`。
- `tzOffset` 是 UTC 以东分钟数（北京 +480）。
- 体重必须带 `context`：`morning_fasted | pre_train | post_train | official`。
- 只有 `morning_fasted` 会进入趋势与减重速率，其余三个只用于当天水合与展示。

老数据迁移：

```bash
node scripts/migrate.js "/mnt/e/AI/运动营养/boxer_logs_2026-05-16.json" docs/migrated_example.json
```

输出里的 `logs` 数组粘到 `miniprogram/data/seed.js`，首次启动自动导入本机。

---

## 六、自检命令

```bash
node scripts/preflight.js     # 编译前自检：页面/跳转/事件/标签/require/云函数/规则同步/登记表一致性
node scripts/test-rules.js    # 36 项规则回归（真实老数据、崩盘日、速率、引用完整性）
node scripts/test-phases.js   # 47 项阶段对照（同数据在 cut/peak 下告警与评分必须不同）
node scripts/test-followup.js # 35 项跟进队列（合并、升级、确认、提醒、id 唯一）
node scripts/test-weekly.js   # 59 项周报与阶段建议（10 个阶段边界 + cut/peak/空数据）
node scripts/test-vision.js   # 44 项照片识别解析（别名/垃圾输出/4-4-9 校验/失败路径/引擎接缝）
node scripts/lint-pages.js    # WXML 引用字段 vs 页面 data 一致性
node scripts/dump-docs.js     # 从代码生成 docs/phase-matrix.md 与 docs/rule-source-table.md
node scripts/gen-seed.js      # 重新生成 14 天演示数据（首次启动导入）
bash scripts/sync-shared.sh   # 同步规则引擎/登记表/队列/识别解析层到云函数
for f in $(find miniprogram cloudfunctions -name '*.js'); do node --check $f; done
```

当前状态：preflight 0 阻塞（3 条提示：AppID / 环境 ID / 演示种子），规则 36/36、阶段 47/47、队列 35/35、周报 59/59、识别 44/44 通过，字段一致性 0 冲突。

---

## 七、已知边界（先说清楚，别踩坑）

1. **没有后台推送。** 小程序切后台就停，做不到"忘记录入自动催"。教练端的通知只在拳王保存记录时产生（红/黄灯或当天首条）。想要微信服务通知，需要配订阅消息模板：在 `config.js` 填 `tplCoachLog`，并把模板 ID 写进 `saveLog` 云函数的环境变量 `TPL_COACH_LOG`；注意订阅消息是**一次性**的，教练每授权一次只能收一条。
2. **照片识别是估算，不是称重。** 已接多模态模型（`visionFood` 云函数，OpenAI 兼容接口），但结果只作为候选：必须勾选/改克数后才进记录，误差通常 ±20–30%，放参照物（手、勺子、身份证）能压到 ±15%。未配置 key 或离线时不识别，明确提示走手工记录，绝不假装成功。细节见 `docs/vision-food.md`。
3. **聊天是 4 秒轮询**，不是 WebSocket。对"教练和拳王沟通"够用，但会更耗一点流量。要真实时就按上面第 5 步改成 `watch`。
4. **一对一。** 一个教练带多个拳王可以，一个拳王只能绑一个教练。多人团队需要给 `users` 加教练数组。
5. **不是医嘱。** 所有数值区间来自公开共识（ACSM / ISSN / IOC / 中国居民膳食指南），个体差异需要教练或注册营养师调。出现头晕、心悸、尿色异常要停止减重并就医。

---

## 八、下一步值得做的

已落地（不再是待办）：

- ~~称重日倒计时联动自动切换阶段~~ → `PHASE_PROFILES` + `coachApi.setPhase`，阶段由营养师后台设置，写 `phase_history`。
- ~~教练端只有一行摘要~~ → 跟进队列（`pages/queue`），连续未解决自动合并升级，确认后生成次日提醒。
- ~~告警依据只有知识库标题~~ → 规则登记表 + 文献锚点（`pages/rules`），支持"待复核"不改代码。
- ~~周报~~ → `utils/weekly.js` + `pages/report`，7 天结论 + 下周动作 + 可复制文本。
- ~~阶段靠人记~~ → `suggestPhase` 按距称重天数给建议，教练端一键采纳（不自动改）。
- ~~拍照识别热量没接视觉模型~~ → `visionFood` 云函数 + 审核式确认，`items.source='vision'`。

还没做的：

- 周报导出长图（现在只能复制文本；要图得接 canvas 或后端绘图，真机验证后再做）。
- 跟进项的规则级统计（确认率/忽略率），用来识别阈值过松的规则。
- **真机验证**：8 个旧页面 + 3 个新页面还没在微信开发者工具里跑过，WXML 渲染与云函数写库是唯一的空白。

---

## 目录

```
boxer-coach/
  miniprogram/
    config.js              唯一要改的配置
    app.js                 云初始化、openid/角色缓存、种子导入
    utils/rules.js         规则引擎（阶段状态机 + 规则开关 + 评分权重，双端共用）
    utils/followup.js      跟进队列逻辑（合并连续天数、升级、生成次日提醒，纯函数）
    utils/coachApi.js      营养师后台 API 封装（离线退化为本机存储）
    utils/weekly.js        周报计算（7 天指标、规则触发统计、结论与分享文本）
    utils/vision.js        照片识别提示词 + JSON 提取 + 4/4/9 校验（双端共用）
    utils/food.js          食物库 42 种
    utils/store.js         本地存储 + 待同步队列
    utils/api.js           云函数调用封装
    data/knowledge.js      运动营养知识库 33 条（带出处）
    data/ruleRegistry.js   规则登记表 18 条 / 34 个文献锚点
    data/seed.js           种子数据（空）
    pages/index            今日：营养师提醒 + 评分 + 指标 + 要点（依据 = 规则 ID + 锚点）
    pages/log              填写：字段随阶段收缩/展开（peak 补液计划、recover 称重后恢复…）
    pages/trend            趋势：晨重折线、周速率、sRPE、达标率
    pages/kb               知识库浏览与搜索
    pages/me               档案、绑定、导出、同步（阶段只读）
    pages/coach            营养师后台：待处理数 + 拳王列表 + 阶段切换
    pages/queue            跟进队列：分组、证据、确认发送次日提醒/稍后/忽略
    pages/rules            规则库：判定逻辑、阈值、来源锚点、复核状态
    pages/report           周报：7 天结论 + 规则触发统计 + 下周动作 + 复制文本
    pages/chat             一对一沟通
    pages/bind             邀请码绑定
  cloudfunctions/
    whoami saveLog getFeed chat bind saveProfile inbox coachApi visionFood
  scripts/
    preflight.js  test-rules.js  test-phases.js  test-followup.js  test-weekly.js  test-vision.js
    demo-followup.js  dump-docs.js  gen-seed.js  lint-pages.js  migrate.js  sync-shared.sh
    fixtures/followup-demo.js
  docs/
    schema.md  knowledge.md  migrated_example.json
    phase-matrix.md        阶段–规则矩阵（生成式）
    rule-registry.md       规则登记与复核流程、两处阈值冲突
    rule-source-table.md   规则–来源对照表（生成式）
    followup-queue.md      跟进队列模型/页面/模拟数据集
    weekly-report.md       周报口径、阶段建议、演示数据
    vision-food.md         照片识别：环境变量、校验、失败路径、误差声明
```
