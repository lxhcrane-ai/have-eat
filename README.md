# 拳王备赛营养教练（微信小程序 + 云开发）

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

### 3. 建 5 个集合
云开发控制台 → 数据库 → 新建集合，权限全部选 **仅创建者可读写**：

```
users      logs      messages      inbox      settings
```

然后在 `settings` 里手动加一条：`{ "key": "coachCode", "value": "COACH-8888" }`
（不建也能跑，代码里有默认码兜底。）

### 4. 上传云函数
云函数目录里 7 个函数，逐个右键 → **上传并部署：云端安装依赖**（不要选"上传"）：

```
whoami   saveLog   getFeed   chat   bind   saveProfile   inbox
```

`saveLog` 与 `getFeed` 依赖 `lib/` 下的共享规则引擎。改过
`miniprogram/utils/rules.js` 或 `data/knowledge.js` 后，先跑一次：

```bash
bash scripts/sync-shared.sh
```

再重新上传这两个函数，否则服务端还是旧规则。

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
node scripts/preflight.js     # 编译前自检：页面声明/跳转目标/事件函数/标签配对/require/云函数/规则同步
node scripts/test-rules.js    # 36 项规则回归（含真实老数据、崩盘日、BD 速率、引用完整性）
node scripts/lint-pages.js    # WXML 引用字段 vs 页面 data 一致性
bash scripts/sync-shared.sh   # 同步规则引擎到云函数
for f in $(find miniprogram cloudfunctions -name '*.js'); do node --check $f; done
```

当前状态：preflight 0 阻塞（只剩 AppID / 环境 ID 两条待填提醒），36/36 通过，字段一致性 0 冲突。

---

## 七、已知边界（先说清楚，别踩坑）

1. **没有后台推送。** 小程序切后台就停，做不到"忘记录入自动催"。教练端的通知只在拳王保存记录时产生（红/黄灯或当天首条）。想要微信服务通知，需要配订阅消息模板：在 `config.js` 填 `tplCoachLog`，并把模板 ID 写进 `saveLog` 云函数的环境变量 `TPL_COACH_LOG`；注意订阅消息是**一次性**的，教练每授权一次只能收一条。
2. **拍照识别热量没接视觉模型。** 当前拍照只做存档 + 关联，热量来自食物库手工选择。要自动识别，在 `config.js` 填 `visionApi`/`visionKey` 后自行在云函数里调用（接口留了位置，没写死供应商）。照片估算误差通常 ±20–30%，放个参照物能提高准确度。
3. **聊天是 4 秒轮询**，不是 WebSocket。对"教练和拳王沟通"够用，但会更耗一点流量。要真实时就按上面第 5 步改成 `watch`。
4. **一对一。** 一个教练带多个拳王可以，一个拳王只能绑一个教练。多人团队需要给 `users` 加教练数组。
5. **不是医嘱。** 所有数值区间来自公开共识（ACSM / ISSN / IOC / 中国居民膳食指南），个体差异需要教练或注册营养师调。出现头晕、心悸、尿色异常要停止减重并就医。

---

## 八、下一步值得做的

- 称重日倒计时联动自动切换阶段（现在要手工改 `phase`）。
- 教练端加"批量下发本周计划"，拳王端 nextPlan 自动带入。
- 餐食拍照接多模态模型，把 `items` 的 `source` 从 `library` 改成 `vision`，规则引擎无需改动。
- 周报：把 7 天 sRPE、蛋白达标率、体重斜率导成一张图发给教练（教练端分享）。

---

## 目录

```
boxer-coach/
  miniprogram/
    config.js              唯一要改的配置
    app.js                 云初始化、openid/角色缓存、种子导入
    utils/rules.js         规则引擎（双端共用）
    utils/food.js          食物库 42 种
    utils/store.js         本地存储 + 待同步队列
    utils/api.js           云函数调用封装
    data/knowledge.js      运动营养知识库 33 条（带出处）
    data/seed.js           种子数据（空）
    pages/index            今日：评分 + 指标 + 要点 + 知识库提示
    pages/log              填写：体重/水合/训练/酸痛/餐食/明日计划
    pages/trend            趋势：晨重折线、周速率、sRPE、达标率
    pages/kb               知识库浏览与搜索
    pages/me               档案、绑定、导出、同步
    pages/coach            教练看板
    pages/chat             一对一沟通
    pages/bind             邀请码绑定
  cloudfunctions/
    whoami saveLog getFeed chat bind saveProfile inbox
  scripts/
    test-rules.js  lint-pages.js  migrate.js  sync-shared.sh
  docs/
    schema.md  knowledge.md  migrated_example.json
```
