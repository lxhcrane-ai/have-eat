# 下次开工清单（按顺序做）

> 每次新开会话，先读这份文件，把「一」原样念给用户，再问要不要直接进「二」。
> 最后更新：2026-10-25，对应提交 0d74c86。
> 项目根：`E:\AI\冠军运动营养\boxer-coach`（注意目录名已从「运动营养」改为「冠军运动营养」）

---

## 零、现在到哪一步了（30 秒）

代码侧已完成：阶段状态机（18 条规则 / 4 阶段开关）、跟进队列、规则登记表（34 个文献锚点）、周报、阶段建议、照片识别、14 天演示数据。
验证：preflight 0 阻塞；规则 36、阶段 47、队列 35、周报 59、识别 44，共 221 项断言全过；lint-pages 0 冲突。
**没做过的只有一件事：真机。** 11 个页面从没在微信开发者工具里跑过，云函数也从没真正写库。

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

4. **建 9 个集合**（权限全选「仅创建者可读写」）
   ```
   users  logs  messages  inbox  settings
   followups  reminders  phase_history  rule_reviews
   ```
   再在 `settings` 手动加一条：`{ "key": "coachCode", "value": "COACH-8888" }`（不改也能跑，有默认码）。

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

4. **订阅消息**（需要你先在公众平台申请模板）
   做什么：`config.js` 填 `tplCoachLog` + `saveLog` 环境变量 `TPL_COACH_LOG`，红/黄灯时推给教练。
   注意：订阅消息是**一次性**的，教练每授权一次只能收一条，要设计成"点一次授权收一次"。

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
node scripts/preflight.js      # 期望：没有阻塞性问题（3 条提示是正常的）
node scripts/test-rules.js     # 36
node scripts/test-phases.js    # 47
node scripts/test-followup.js  # 35
node scripts/test-weekly.js    # 59
node scripts/test-vision.js    # 44
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
