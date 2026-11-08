# 下次开工清单（按顺序做）

> 每次新开会话，先读这份文件，把「一」原样念给用户，再问要不要直接进「二」。
> 最后更新：2026-11-08（复合目标矩阵 G1–G7 代码完成）。
> 项目根：`E:\AI\冠军运动营养\boxer-coach`（注意目录名已从「运动营养」改为「冠军运动营养」）

---

## 零、现在到哪一步了（30 秒）

代码侧已完成：阶段状态机（18 条规则 / 4 阶段开关）、跟进队列、规则登记表（34 个文献锚点）、周报、阶段建议、照片识别、14 天演示数据、**复合目标矩阵（15 原子 / 60 格 / 27 配方 / GOAL-01、GOAL-02 / 拳王端与营养师端展示 / `setGoals` 写入）**。
验证：preflight 0 阻塞；8 套测试共 530 项断言全过；lint-pages 0 冲突。
**剩余只有两件事：云端部署 + 真机。** 页面尚未在微信开发者工具真机走查，`coachApi.setGoals`/`advice` 快照也尚未在真实云环境写库验证。

---

## 一、必须先做的部署验收（只能你在微信开发者工具里点，约 20 分钟）

按这个顺序，每步做完就能看到对应效果；出错就停在一步，不要往下叠。

1. **导入项目**
   微信开发者工具 → 导入 → 选 `E:\AI\冠军运动营养\boxer-coach` → AppID 填你自己的（个人主体也能开云开发）。
   先不填环境 ID，编译一次，确认能进小程序（会自动进离线模式，种子数据会导入 14 天）。

2. **看离线效果（不需要云环境）**
   - 今日页：有评分、指标、要点，点开要点能看到"规则 HYD-01 + 来源锚点"
   - 趋势页：有折线、周速率、sRPE，点「看本周报告」
   - 我 → 阶段只读、按称重日推算的建议
   这一步只要有任何白屏/报错，先截图给我，直接改，不要继续部署。

3. **开云开发、填环境 ID**
   工具栏「云开发」→ 开通 → 复制环境 ID → 填进 `miniprogram/config.js` 的 `env`。

4. **建 9 个集合**（权限全选「所有用户不可读写」，小程序端只通过云函数访问）
   ```
   users  logs  messages  inbox  settings
   followups  reminders  phase_history  rule_reviews
   ```
   再在 `settings` 手动加两条：`{ "key": "coachCode", "value": "COACH-8888" }`（旧版拳王邀请码，不改也能跑，有默认码）和 `{ "key": "coachActivationCode", "value": "改成你自己的教练激活码" }`（教练角色唯一入口，必须与 coachCode 不同）。

5. **上传 9 个云函数**（逐个右键 → 上传并部署：**云端安装依赖**）
   ```
   whoami  saveLog  getFeed  chat  bind  saveProfile  inbox  coachApi  visionFood
   ```

6. **（可选）配视觉模型**
   云开发控制台 → 云函数 → visionFood → 配置 → 环境变量：
   ```
   VISION_BASE_URL = https://dashscope.aliyuncs.com/compatible-mode/v1   # 换成你用的供应商
   VISION_MODEL    = qwen-vl-max
   VISION_API_KEY  = sk-...
   ```
   配完重新部署一次，否则变量不生效。不配也能用，识别按钮会提示"未配置"。

7. **走通两人流程（关键验收）**
   - 手机 A 当拳王：我的 → 填档案（身高/年龄/体重/目标体重/称重日）→ 保存
   - 手机 B 当教练：我的 → 教练：开启教练端 → 输同一个邀请码 → 教练看板应出现 A
   - B 把 A 的阶段切到「减脂期」→ A 端「我的」阶段变成减脂期（只读）
   - A 填今天：晨重 / 三餐 / 酸痛 / 晨脉 / 尿色 → 保存 → 今日页出评分
   - B 刷新 → 顶部应显示"N 件事待处理"→ 点进跟进队列 → 改一条提醒文案 → 确认发送
   - 第二天 A 打开首页 → 顶部应出现「营养师今日提醒」，只有 B 写的那段

   这七步全过，才算这个项目真的跑起来了。

---

## 二、验完之后我能继续做的（按优先级，每条都有验收标准）

1. **跟进项的规则级统计**
   做什么：在 `coachApi` 加 `action:'ruleStats'`，统计每条规则的触发次数、确认率、忽略率，在规则库页顶部显示。
   为什么：阈值过松的规则会天天刷屏，营养师会开始无视队列。
   验收：`node scripts/test-followup.js` 增加统计断言；规则库页能看到"最近 30 天：PRO-01 触发 12 次，确认 9 次 / 忽略 3 次"。

2. **周报导出长图**
   做什么：`pages/report` 用 canvas 生成一张 750×1200 的图（标题、四个数字、结论、下周动作），`wx.canvasToTempFilePath` 存相册/发微信。
   为什么：现在只能复制文本，教练要的是能转发的图。
   注意：canvas 在不同机型上有坑，必须真机验证，先把文本路径保留。
   验收：真机上生成图片，文字不模糊、不截断。

3. **称重日临近的对话式提醒**
   做什么：`suggestPhase` 已有；在 index 页加一条"距称重 3 天，营养师已进入微调期"的信息条（只在 ≤7 天且阶段未切换时出现）。
   验收：改 `weighInDate` 为 3 天后，首页出现提示；改回 40 天后消失。

4. **订阅消息**（代码已接入，仍需你在公众平台申请模板）
   已做：四个模板 ID 分别放 `saveLog` / `chat` / `advice` 云函数环境变量（`TPL_COACH_LOG` / `TPL_ATHLETE_MSG` / `TPL_ADVICE_PUBLISH` / `TPL_ADVICE_CHANGE`），覆盖保存记录、教练消息、建议发布、建议更新/撤回；前端在保存成功、绑定成功、首次聊天时请求授权，结果写 `users.subscribe`。
   待你操作：在公众平台申请四个模板，字段按 `thing1` / `thing2` / `time3` 创建；未配置或未授权时静默跳过，只保留站内收件箱。
   注意：订阅消息是**一次性**的，每授权一次只能收一条；发送成功后状态置为 `sent`，下次保存/聊天会再次请求。

5. **体脂与 FFM 口径（等「三」的决策）**
   做什么：给 profile 加 `bodyFatPct`，蛋白目标改成 `g/kg FFM` 双口径显示，规则 PRO-01 的 evidence 同时给出两种算法。

---

## 三、需要你拍板的两件事（我不改代码，只在文档里标了 needs_review）

1. **PRO-01 蛋白口径**
   现在：cut 期 2.0–2.4 g/kg **体重**（58kg → 116–139g）。
   文献：ISSN 2017 的 2.3–3.1 是 g/kg **去脂体重**；ISSN 2025 第 6 条给的是 1.2–2.0 g/kg 体重（下限）。
   两条路：A. 继续用体重口径（简单，偏保守）；B. 加体脂数据改 FFM 口径（更准，但拳王每次要报体脂）。
   你定 A 或 B，我把另一条写进 `docs/rule-registry.md` 的决策记录。

2. **PHASE-02 维持期带宽**
   现在：+3–5%（项目原设定，只出 info）。
   文献：ISSN 2025 第 3 条建议非赛季 +12–15%（针对 MMA 类）。
   你定：拳击用几档？定了我改默认值，并把理由写进规则 notes。

---

## 四、别做的事（会踩坑）

- 不要在 `miniprogram/config.js` 里填任何 API key（会被反编译），视觉 key 只放云函数环境变量。
- 不要手改 `cloudfunctions/*/lib/` 下的文件：那是 `bash scripts/sync-shared.sh` 生成的，下次同步会覆盖。
- 不要在没跑 `preflight` 的情况下直接改 `PHASE_PROFILES` 的 activeRuleIds / suppressedRuleIds：登记表的 applicablePhases 必须同步改，否则 preflight 报错（这是故意的）。
- 不要把 `docs/phase-matrix.md`、`docs/rule-source-table.md` 手改，它们由 `node scripts/dump-docs.js` 生成。
- 正式用之前把 `miniprogram/data/seed.js` 改回 `module.exports = []`，否则首次启动会导入 14 天假数据（preflight 会提醒）。

---

## 五、一键自检（改完任何东西先跑这个）

```bash
cd "E:\AI\冠军运动营养\boxer-coach"   # WSL 下是 /mnt/e/AI/冠军运动营养/boxer-coach
bash scripts/sync-shared.sh
node scripts/preflight.js      # 期望：0 阻塞（3 条提示是正常的）
node scripts/test-rules.js     # 107
node scripts/test-goals.js     # 147
node scripts/test-phases.js    # 47
node scripts/test-followup.js  # 44
node scripts/test-weekly.js    # 85
node scripts/test-vision.js    # 44
node scripts/test-advice-core.js # 15
node scripts/test-demo-seed.js # 41
node scripts/check-goal-matrix-doc.js # 60 格 legal/goal01Level/evidence 与文档一致
node scripts/lint-pages.js     # 一致：未发现未定义字段
node scripts/dump-docs.js      # 改了规则后必跑，否则文档和代码漂移
```

---

## 六、完成定义（什么时候算这个项目做完了）

- [ ] 第「一」节七步全过，真机上两人走通一天
- [ ] 连续 7 天真实数据后，周报里的数字和营养师手算一致
- [ ] 跟进队列里至少一条被确认并成功推到拳王次日首页
- [ ] 阶段从 cut 切到 peak 后，脱水百分比告警确实消失、补液执行率告警出现
- [ ] 规则库能标"待复核"，且告警展开里能看到徽标
- [ ] 照片识别在真机上给出与照片对得上的条目（误差可接受）

---

## 七、复合目标矩阵收尾（G7 结论）

状态：**代码完成**。`test-rules`/`test-goals`/`test-phases`/`test-followup`/`test-weekly`/`test-vision`/`test-advice-core`/`test-demo-seed` 全过，`preflight` 0 阻塞，60 格与文档逐格一致。

剩余（都需要云端或真机）：
1. 部署 `coachApi`（含 `setGoals`、`setRefeedPlan`、队列目标 chips）、`advice`（快照 `goal` 块）、`saveProfile`（LOCKED 五字段）。
2. 按 `docs/cloud-setup.md` 建 `advice / advice_revisions / pair_codes` 与索引（目标本身落在 `users.profile`，不需要新集合/索引）。
3. 控制台测试 `setGoals`：合法写入、超 3 个、重复、未知 ID、`G-MED`、阶段不允许、缺日期，确认均为整次拒绝且 `profile.goals` 不变。
4. 发布一条建议后核对 `advice` 快照含 `goalMatrixVersion/goalPlan/goalAdherence/goalBlockers/goalEffectiveDate/goalSource`。
5. 真机走查：无目标时看板/队列/复核页不出现目标块；有目标时 chips、弱证据徽标、独立 `goalAdherence`、复核页“带入建议开头”不覆盖正文。
6. ~~营养师端“调整目标”交互 UI 尚未实现~~ 已补齐：`pages/goals/*`（入口在营养师看板每位拳王卡片内），15 原子可选、阶段 N/A 与 `G-MED` 置灰并写明原因、条件类显示“需满足”、名额实时占用、增删/调序、错误码中文映射；离线禁止提交且不本地假写。

新增 / 改动文件：
- 新增：`miniprogram/data/goalMatrix.js`、`miniprogram/utils/goals.js`、`miniprogram/utils/goalDraft.js`、`miniprogram/pages/goals/*`、`scripts/check-goal-matrix-doc.js`
- 规则：`miniprogram/utils/rules.js`（v4.0 + `GOAL-01/02` + 四个派生字段）
- 拳王端：`miniprogram/pages/index/*`、`miniprogram/pages/trend/*`
- 营养师端：`miniprogram/pages/coach/*`、`miniprogram/pages/queue/*`、`miniprogram/pages/review/*`、`miniprogram/pages/goals/*`、`miniprogram/utils/coachApi.js`
- 云函数：`cloudfunctions/coachApi/index.js`、`cloudfunctions/advice/lib/core.js`、`cloudfunctions/saveProfile/index.js`，以及 `saveLog/getFeed/coachApi/advice/lib/` 同步副本
- 脚本：`scripts/preflight.js`、`scripts/test-goals.js`、`scripts/sync-shared.sh`
- 文档：`docs/goal-matrix.md`、`docs/schema.md`、`docs/cloud-setup.md`、`docs/NEXT-STEPS.md`
