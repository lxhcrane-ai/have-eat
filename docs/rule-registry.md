# 规则登记与文献锚点

规则不再是散落在 `rules.js` 里的 if 分支：每条规则有一个稳定编号、一段可读的判定逻辑、阈值、一级来源锚点、适用阶段、是否需要人工跟进，以及复核状态。

- 数据：`miniprogram/data/ruleRegistry.js`（纯数据，双端共用）
- 判定：`miniprogram/utils/rules.js`（用 `ruleId` 做开关，告警带 `ruleId` / `evidence` / `reviewStatus` / `sources`）
- 生成的对照表：`docs/rule-source-table.md`（`node scripts/dump-docs.js`）

---

## 一、数据结构

```js
{
  ruleId: 'HYD-01',              // 稳定编号，文案可改、编号不改
  name: '训练脱水百分比',
  logicSummary: '一句话判定逻辑',
  thresholds: 'pct ≥ 2% → amber；pct ≥ 3% → red',
  sources: [{
    citation: '完整文献引用（作者. 标题. 期刊. 年;卷(期):页）',
    sourceType: 'position_stand',   // position_stand | consensus | systematic_review | narrative_review | textbook | industry_standard
    year: 2007,
    anchor: '具体到章节、条目号或结论句',
    doi: '10.1249/mss.0b013e31802ca597',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17277604/'
  }],
  applicablePhases: ['maintain', 'cut'],   // 必须与 PHASE_PROFILES 的 activeRuleIds 完全一致（preflight 会校验）
  requiresHumanFollowUp: true,             // true 才会进营养师跟进队列
  lastReviewedAt: '2026-10-25',
  reviewStatus: 'active',                  // active | needs_review | deprecated
  kbIds: ['hyd-2pct', 'hyd-replace'],      // 关联知识库条目（文案素材）
  notes: '方法学警告 / 阈值冲突 / 待办',
  metric: 'hydration'
}
```

规则编号段位：`HYD` 水合、`PRO` 蛋白、`ENE` 能量、`PHASE` 减重速率与阶段、`SLE` 睡眠、`REC` 恢复、`GI` 胃肠、`SUP` 补剂、`LOG` 记录完整性。共 18 条、34 个来源锚点。另有 1 条**营养护栏**规则 `G-CONC` 已出规格、待实施（见 §七），实施后为 19 条。

---

## 二、已登记规则与来源（摘要）

完整表见 `docs/rule-source-table.md`，下面是最关键的 8 条：

| 规则 | 判定 | 一级来源（锚点） |
|---|---|---|
| HYD-01 脱水百分比 | 训练前后体重差 ÷ 训练前体重；≥2% 提示，≥3% 红灯 | ACSM 2007 立场声明「Dehydration and performance」段：≥2% 即损害表现；ACSM/AND/DC 2016「Fluid」段 |
| HYD-02 补液量 | 每掉 1kg 补 1.25–1.5L 含钠液体 | ACSM 2007「Fluid replacement」段 |
| PRO-01 蛋白总量 | cut 2.0–2.4 g/kg；其余 1.6–2.2；recover 1.6–2.0 | ISSN 2017 蛋白立场声明（1.4–2.0 g/kg；能量限制期 2.3–3.1 g/kg **FFM**）；Refalo 2025 系统综述+元回归（g/kg FFM 呈剂量-反应，缺口越大 FFM 掉越多）；ISSN 2025 第 6 条（下限 1.2–2.0 g/kg） |
| PHASE-01 减重速率 | 7 日晨重回归斜率 >1%/周红灯 | ACSM/AND/DC 2016「Weight management」；ISSN 2025 第 7 条（72/48/24h 分别 6.7%/5.7%/4.4%，属急性脱水，不可当长期速率） |
| REC-01 称重后碳水 | 糖原耗尽 8–12 g/kg，轻度限制 4–7 g/kg；快碳 ≤60 g/h | ISSN 2025 第 13–14 条 |
| REC-02 酸痛与强度课 | 酸痛 ≥7 且次日速度/爆发/最大力量 → 改课 | Cheung 2003（DOMS 24–72h 达峰、力量与位置觉下降）；Meeusen 2013 ECSS/ACSM 联合共识 |
| REC-03 晨脉 | 比个体基线高 ≥5 次/分 | Buchheit 2014（必须对照个体滚动基线）；Meeusen 2013 |
| SLE-01 睡眠 | 目标 7–9h；<6.5h 提示，<6h 红灯；peak 期 <7h 即提示 | Walsh 2021 BJSM 专家共识（habitual short sleep <7h） |
| HYD-04 称重后补液 | ORS 1–1.5 L/h，钠 50–90 mmol/L；<1000ml 提示 | ISSN 2025 第 12 条；ACSM 2007 |

> 关于 IOC 2018：本项目只在 SUP-01（补剂）锚定 `IOC consensus statement: dietary supplements and the high-performance athlete, BJSM 2018;52:439-455, doi:10.1136/bjsports-2018-099027`。IOC 并未在 2018 年发布"综合运动营养"共识，称重后恢复统一锚定 ISSN 2025 与 ACSM 2016，避免出现无法核对的引用。

---

## 三、方法学警告（会显示在"依据"展开里）

- **HYD-01**：训练前后体重差含糖原与底物氧化，不等于净失水；必须带 `context`（pre/post）才可比。微调期禁用本规则——水盐操作会让数值必然异常。
- **HYD-03**：单次尿样受饮水时间、维生素 B、甜菜影响，**不应单独用于水合评估**，只作趋势提示。
- **PHASE-01**：少于 4 个晨重点不计算斜率，不用单日波动判断；peak/recover 禁用（体重变化主要来自水、钠、糖原与胃肠内容物）。
- **PRO-01**：同一拳手用 BM 口径与 FFM 口径结论可差 20–30g，见下文冲突。
- **REC-01**：ISSN 2025 第 15 条原文写作 "regain ≥10% of body mass"，字面值不成立（疑为占已失体重的比例），引用时以原文为准，本规则只断言"回升不足则提示"。
- **REC-03**：没有 `restingHrBaseline` 就不出结论，不做人群默认值推断。

---

## 四、两处真实冲突（已标 needs_review，不改代码）

1. **PRO-01 蛋白阈值**
   - 代码：cut 期 2.0–2.4 g/kg **体重**
   - 文献：ISSN 2017 的 2.3–3.1 是 g/kg **FFM**；ISSN 2025 第 6 条给的是 1.2–2.0 g/kg 体重（下限）
   - 影响：58kg / 15% 体脂的拳手，FFM 约 49kg → 2.3–3.1 g/kg FFM = 113–152g；按 BM 2.0–2.4 = 116–139g。区间大致相容，但口径不同会让"差多少克"的文案前后不一致。
   - 处理：保留现有阈值（对减脂期偏保守），标 `needs_review`，等营养师决定是否引入体脂数据改用 FFM 口径。

2. **PHASE-02 维持期体重带宽**
   - 代码：+3–5%（项目原设定）
   - 文献：ISSN 2025 第 3 条建议非赛季维持在参赛级别之上 **12–15%**（针对 MMA 等需大幅减重的项目）
   - 影响：拳击与 MMA 的赛前减重幅度不同，+3–5% 对拳击可能合理，对 MMA 偏低。
   - 处理：默认带宽仍用 5%，但规则只出 info 不出红灯；营养师可用 `profile.maintainBandPct` 覆盖。

这两条正是"新综述发布时先标待复核、不改代码"的实例。

---

## 五、复核流程

1. 营养师在「营养师后台 → 规则库」点某条规则 → **标记为待复核**（写 `rule_reviews` 集合，不改代码）。
2. 拳王端该规则触发的告警，展开"依据"会显示 `该规则待复核` 徽标；教练端跟进项同样带徽标。
3. 营养师核对原文后：若阈值要改 → 改 `ruleRegistry.js` / `rules.js` → `bash scripts/sync-shared.sh` → 重新上传 `saveLog` / `getFeed` / `coachApi`；若只是确认无需改 → 点"已核对，恢复为有效"。
4. `deprecated` 的规则应从 `PHASE_PROFILES` 的 `activeRuleIds` 移除，`preflight` 会因"登记表与阶段配置不一致"报错，强制两端同步。

---

## 六、校验

```bash
node scripts/preflight.js     # 登记表完整性：来源字段、doi/url、阶段一致、权重合计 100
node scripts/test-phases.js   # 47 项：告警必须可追溯到 ruleId + 非空 evidence + 至少 1 个来源锚点
node scripts/dump-docs.js     # 重新生成 docs/rule-source-table.md 与 docs/phase-matrix.md
```

---

## 七、待实施规则：`G-CONC`（打击后营养护栏）

> 规格全文见 `docs/concussion-spec.md`。本节只登记编号与边界，**未写入 `ruleRegistry.js` 前不生效**。

| 项 | 内容 |
|---|---|
| 编号 | `G-CONC`（注意：不是目标原子，不写入 `goalMatrix.js` 的 `ATOMS`） |
| 名称 | 打击后营养护栏 |
| 定位 | 只输出营养动作，不做医学诊断、不判停训/复训/送医 |
| 判定 | 按 `health.concussion` 的症状强度、受击/击倒/中止、记忆空白/平衡异常，以及近 7/30 天累积，分「营养降级」「营养降级 + 转介提示」两档；无受击无症状不出告警 |
| 出参 | `nutritionGuardrail`：`level / action / flags / referralPrompt / reasons`；不写 `goalBlockers`、不进 `score`、不进 `goalAdherence` |
| 一级来源 | `patricios2023`（只用于「建议按队队医/医生流程评估」一句）；`turnagol2022`（康复期营养方向） |
| 适用阶段 | 四阶段全部（`applicablePhases` 与 `PHASE_PROFILES.activeRuleIds` 必须一致） |
| 复核状态 | `needs_review`（营养降级幅度是产品保守策略，不是文献剂量） |
| 人工跟进 | `requiresHumanFollowUp: true`，跟进动作只能是营养侧降级 |
| 知识库 | `RC-06`、`RF-06`、`RH-08`（按 `docs/concussion-spec.md` §5 软化后） |

**禁止出参**：停训/复训/送医/分级/时间表、`stopTraining`、`returnToPlay`、`referralLevel`。
