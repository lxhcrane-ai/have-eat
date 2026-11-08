# 云环境初始化（营养师建议闭环）

当前仓库里 `miniprogram/config.js` 的 `env` 与 `project.config.json` 的 `appid` 都还是占位值，无法真正连上云环境。下面按顺序手工完成，全部做完后才能进行云端读写与真机验证。

> 云函数只能创建集合，**不能创建索引**。索引必须在「云开发控制台 → 数据库 → 索引管理」里逐个手工建。

---

## 第 1 步：填写云环境 ID

1. 微信开发者工具点顶部「云开发」进入云开发控制台。
2. 左上角「设置」→「环境设置」，复制**环境 ID**（形如 `cloud1-xxxx`，不是环境名称）。
3. 打开 [miniprogram/config.js](../miniprogram/config.js)，把 `env: 'YOUR-CLOUD-ENV-ID'` 改成刚复制的值。
4. 保存后重新编译小程序。

## 第 2 步：填写真实 AppID

1. 登录微信公众平台 →「开发」→「开发管理」→「开发设置」，复制小程序的 AppID。
2. 打开 [project.config.json](../project.config.json)，把 `"appid": "touristappid"` 改成真实 AppID。
3. 用该 AppID 重新打开项目（或重新登录开发者工具）。游客 AppID 无法使用云开发，必须换成真实 AppID。

## 第 3 步：创建集合与设置权限

需要新建 3 个集合，名称必须完全一致：

| 集合 | 用途 |
|---|---|
| `advice` | 营养师建议（草稿 / 已发布 / 已撤回） |
| `advice_revisions` | 发布后修改、撤回的留痕 |
| `pair_codes` | 教练生成的一次性配对码 |

两种建法，任选一种：

- **方式 A（推荐，可重复执行）**：开发者工具里右键 `cloudfunctions/initDb` →「上传并部署：云端安装依赖」。部署完成后，云开发控制台 →「云函数」→ `initDb` →「测试」，参数填 `{}` 运行。返回 `results` 会逐条列出 `created` / `exists` / `failed`，集合已存在会跳过，不会写入任何业务数据。
- **方式 B（纯手工）**：云开发控制台 →「数据库」→「集合列表」→「新建集合」，依次输入上面三个名称。

创建后逐个设置权限：

1. 数据库 → 选中集合 →「权限设置」。
2. 选择「所有用户不可读写」（等价于自定义规则 `{"read": false, "write": false}`）。
3. 三个集合都设置成同一权限。

说明：小程序端的所有读写都走云函数，云函数使用管理权限，不受「所有用户不可读写」限制；这样可避免客户端直接读到他人工学数据。

> 批次一已有的 `users`、`logs`、`inbox`、`followups`、`reminders`、`rule_reviews` 等集合保持现状，本次不重建。

## 第 4 步：逐个创建索引

路径：云开发控制台 →「数据库」→ 选中集合 →「索引管理」→「新建索引」→ 填名称 → 逐个添加字段并选择升/降序 → 设置是否唯一 → 确定。索引构建需要一点时间，状态变成「已生效」后再继续。

### `advice`

| 索引名（建议） | 字段与方向 | 唯一 | 用途 |
|---|---|---|---|
| `uniq_athlete_date_scope` | `athleteId` 升序, `date` 升序, `scope` 升序 | **是** | 保证同一拳王、同一天、同一窗口（day/range）只有一条建议；`saveDraft` 先查后写，唯一索引兜底并发重复 |
| `idx_athlete_status_dateTo_dateFrom` | `athleteId` 升序, `status` 升序, `dateTo` 降序, `dateFrom` 升序 | 否 | `advice{action:'get/getContext'}` 找覆盖当天的建议（`dateFrom <= 当天 <= dateTo`，按 `dateTo` 倒序取最新） |
| `idx_athlete_status_date` | `athleteId` 升序, `status` 升序, `date` 降序 | 否 | 历史建议页 / `list`：自己或指定拳王，`status in [...]` 且 `date < before`，按日期倒序分页 |
| `idx_coach_status_date` | `coachOpenid` 升序, `status` 升序, `date` 降序 | 否 | 教练不带 `athleteId` 时的建议列表 |
| `idx_coach_status_dateFrom_dateTo` | `coachOpenid` 升序, `status` 升序, `dateFrom` 升序, `dateTo` 升序 | 否 | `getFeed` 教练看板：`coachOpenid + status:'published' + dateFrom<=today<=dateTo` 统计当日审阅状态 |

### `advice_revisions`

| 索引名（建议） | 字段与方向 | 唯一 | 用途 |
|---|---|---|---|
| `idx_advice_version` | `adviceId` 升序, `version` 升序 | 否 | 按建议查历史版本；不设唯一以兼容重试/历史数据中可能出现的同版本留痕 |

### `pair_codes`

| 索引名（建议） | 字段与方向 | 唯一 | 用途 |
|---|---|---|---|
| `uniq_code` | `code` 升序 | **是** | `bind` 按 `code` 精确定位一条配对码，避免重复码把拳王绑到错误教练 |
| `idx_code_status` | `code` 升序, `status` 升序 | 否 | 生成配对码时校验 `code + status:'active'` 是否重复；绑定更新时按 `code + status` 条件更新 |

### `inbox`（批次二 2.1 的收件箱页需要）

| 索引名（建议） | 字段与方向 | 唯一 | 用途 |
|---|---|---|---|
| `idx_owner_read_createdAt` | `owner` 升序, `read` 升序, `createdAt` 降序 | 否 | 未读计数、按范围全部已读；`owner + read:false` 与 `getFeed` 的每人未读口径一致 |
| `idx_owner_athlete_read` | `owner` 升序, `athleteId` 升序, `read` 升序 | 否 | 教练按拳王查未读（`owner + athleteId + read:false`），与看板红点同口径 |
| `idx_owner_createdAt` | `owner` 升序, `createdAt` 降序 | 否 | 收件箱列表按时间倒序分页（拳王看自己、教练看自己名下拳王） |
| `idx_owner_type_createdAt` | `owner` 升序, `type` 升序, `createdAt` 降序 | 否 | 按类型筛选列表（`log` / `message` / `advice*` / 跟进） |

---

## 第 5 步：部署复合目标与 refeed 计划写入（`coachApi`）

目标不是独立集合，全部落在 `users` 文档的 `profile` 内，因此**不需要新建集合，也不需要新建索引**：

| 项 | 落点 | 动作 |
|---|---|---|
| `setGoals` 写入口 | `cloudfunctions/coachApi/index.js`（action=`setGoals`） | 上传并部署 `coachApi` |
| `setRefeedPlan` 写入口 | `cloudfunctions/coachApi/index.js`（action=`setRefeedPlan`） | 同批部署 `coachApi` |
| 复核矩阵卡快照 | `cloudfunctions/advice/lib/core.js` 的快照新增 `goal` 块 | 上传并部署 `advice` |
| 写入字段 | `users.profile.goals / goalEffectiveDate / goalSource / bodyFatPct / refeedDays` | 无需改集合结构 |
| 防覆盖 | `cloudfunctions/saveProfile/index.js` 的 `LOCKED` 已含上述五字段 | 同批部署 `saveProfile` |
| 查询依赖 | 已按 `_openid` / `coachOpenid` 读取 `users` | 沿用现有索引，无需新增 |

校验在服务端一次完成，任何一条不通过都整次拒绝，不会写半成品：

| 代码 | 触发 |
|---|---|
| `E_GOAL_QUOTA` | 主目标超过 3 个，或 `G-IMM` 超过 1 个 |
| `E_GOAL_DUPLICATE` | 同一目标重复（含 `EN` 与 `G-SLE` 等价重复） |
| `E_GOAL_UNKNOWN` | 未知目标 ID |
| `E_GOAL_FORBIDDEN` | `G-MED` 等不可选目标，或该拳王未绑定到当前营养师 |
| `E_GOAL_PHASE_ILLEGAL` | 当前阶段矩阵不允许（含条件不满足） |
| `E_GOAL_CONFLICT` | 目标组合需要被矩阵裁剪（partial） |
| `E_GOAL_EMPTY_DATE` | 设置了目标但缺少或无效 `goalEffectiveDate` |
| `E_GOAL_BODYFAT` | `bodyFatPct` 非 number 或不在 3–50（省略字段 = 保留原值，显式 `null` = 清除） |
| `E_GOAL_REFEED` | `refeedDays` 非 0–7 整数 |
| `E_GOAL_WRITE` | 单次 update 失败（此时不修改任何字段） |

验证方式：云开发控制台 →「云函数」→ `coachApi` →「测试」，事件填：

```json
{ "action": "setGoals", "athleteId": "拳王的 openid", "goals": ["B-CUT", "G-SLE"], "goalEffectiveDate": "2026-11-08" }
```

返回 `ok:true` 时应同时带 `goals / goalEffectiveDate / goalSource:'nutritionist'`；故意多传一个目标或重复 ID，应整次失败且数据库里 `profile.goals` 保持原值。

refeed 计划用 `{ "action": "setRefeedPlan", "athleteId": "拳王的 openid", "refeedDays": 2 }` 验证：返回 `ok:true` 且 `users.profile.refeedDays=2`；传 `8` 应返回 `E_GOAL_REFEED` 且原值不变；传 `null` 表示清除本周计划。

> 营养师端页面（看板列表、跟进队列、复核页）只展示云端返回的目标数据；云端不可用时明确提示并留空，不回退本地假数据。

---

## 如何验证索引已生效

1. **控制台看状态**：`advice` / `advice_revisions` / `pair_codes` 的「索引管理」里，每条索引状态应为「已生效」（刚建时可能先显示构建中）。
2. **验证唯一索引**：数据库 → `advice` 集合 →「添加记录」，手工插入一条含 `athleteId`、`date`、`scope` 的测试文档；再插入一条三者完全相同的文档，第二条应报 `E11000 duplicate key error`（或同类 duplicate key 文案）。验证完把两条测试文档都删掉，不要留下业务数据。
3. **验证普通索引**：分别调用对应云函数，确认返回正常且云函数日志没有超时。索引是否被命中不提供直接 UI，主要看数据量增大后查询耗时是否稳定。

## 遗漏索引时可能出现的具体报错

微信云开发与部分数据库不同：**普通查询缺少索引通常不会直接报 “index not found”**，而是退化为全表扫描，小数据量下仍然成功；数据量变大或云函数超时时间较短时，云函数日志会出现类似：

```text
Invoking task timed out after 10 seconds
```

具体表现与遗漏项对应：

| 遗漏项 | 现象 / 报错 |
|---|---|
| `advice` 的 `uniq_athlete_date_scope` | **不会报错**，反而可能写入同一窗口两条建议；随后 `adviceCovering` 取到哪条不确定，草稿/已发布状态可能错乱 |
| 普通查询索引（`athleteId+status+date`、`coachOpenid+status+date` 等） | 不报索引错误；数据量大后查询变慢、云函数超时（`Invoking task timed out after ...`），历史页/看板可能转圈或返回空 |
| 集合未创建 | 报 `[ResourceNotFound] Db or Table not exist`；`advice` 云函数会返回「请先在云开发控制台创建 advice 集合…」，`coachApi` 生成配对码会返回「写入失败（请先在云控制台创建 pair_codes 集合）」 |
| 权限设置错误（仅当客户端直连数据库时） | 报 `[PermissionDenied]` / `-502003` 一类权限错误；本项目的页面只调云函数，正常不会出现 |

> 以上为按代码中实际查询与错误分支整理的排查口径，尚未在真实云环境逐项复现；真机与云端行为仍需部署后验证。
