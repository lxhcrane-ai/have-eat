// 从代码生成文档表格，避免文档和实现漂移。
// 用法：node scripts/dump-docs.js
const fs = require('fs');
const path = require('path');
const rules = require(path.join(__dirname, '../miniprogram/utils/rules.js'));

const OUT = path.join(__dirname, '../docs');
const PHASES = ['maintain', 'cut', 'peak', 'recover'];

// 阶段内的阈值差异（代码里写死的分支，文档必须说清）
const CELL_NOTE = {
  'PRO-01': { cut: '2.0–2.4 g/kg', recover: '1.6–2.0 g/kg', peak: '1.6–2.2 g/kg', maintain: '1.6–2.2 g/kg' },
  'SLE-01': { peak: '<7h 即 amber', cut: '<6.5h amber', maintain: '<6.5h amber', recover: '<6.5h amber' },
  'REC-02': { peak: '酸痛 ≥7 且计划速度 → 改课', cut: '同左', maintain: '同左', recover: '抑制' }
};

function phaseCell(rule, phase) {
  const prof = rules.PHASE_PROFILES[phase];
  const active = prof.activeRuleIds.indexOf(rule.ruleId) >= 0;
  if (!active) return '抑制';
  const note = CELL_NOTE[rule.ruleId] && CELL_NOTE[rule.ruleId][phase];
  return note ? '启用（' + note + '）' : '启用';
}

function mdEscape(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function buildMatrix() {
  const lines = [];
  lines.push('# 阶段–规则矩阵（由 scripts/dump-docs.js 生成，勿手改）');
  lines.push('');
  lines.push('阶段决定"哪些规则生效、哪些被抑制、哪些阈值调整"。抑制不是删除：被抑制的规则会记录在 `feedback.suppressed` 里，后台可审计。');
  lines.push('');
  lines.push('| 规则 ID | 规则名 | 维持期 | 减脂期 | 微调期 | 恢复期 | 人工跟进 |');
  lines.push('|---|---|---|---|---|---|---|');
  rules.listRules().forEach(function (r) {
    lines.push('| ' + r.ruleId + ' | ' + mdEscape(r.name) + ' | ' + PHASES.map(function (p) { return phaseCell(r, p); }).join(' | ') +
      ' | ' + (r.requiresHumanFollowUp ? '是' : '否') + ' |');
  });
  lines.push('');
  lines.push('## 评分权重（每阶段合计 100）');
  lines.push('');
  lines.push('| 阶段 | 水合 | 蛋白 | 能量 | 恢复 | 记录 | 主告警类型 |');
  lines.push('|---|---|---|---|---|---|---|');
  PHASES.forEach(function (p) {
    const w = rules.PHASE_PROFILES[p].metricWeights;
    lines.push('| ' + rules.PHASE_PROFILES[p].label + ' | ' + w.hydration + ' | ' + w.protein + ' | ' + w.energy + ' | ' + w.recovery + ' | ' + w.logging + ' | ' +
      rules.PHASE_PROFILES[p].primaryAlertTypes.join('、') + ' |');
  });
  lines.push('');
  lines.push('## 字段契约（拳王端表单按此收缩/展开）');
  lines.push('');
  lines.push('| 阶段 | 必填 | 其中缺失即判"数据不足" | 选填 |');
  lines.push('|---|---|---|---|');
  PHASES.forEach(function (p) {
    const f = rules.PHASE_PROFILES[p].fieldSchema;
    const lab = function (k) { return rules.FIELD_LABELS[k] || k; };
    lines.push('| ' + rules.PHASE_PROFILES[p].label + ' | ' + f.required.map(lab).join('、') + ' | ' +
      (f.critical || []).map(lab).join('、') + ' | ' + f.optional.map(lab).join('、') + ' |');
  });
  lines.push('');
  lines.push('## 关键行为差异');
  lines.push('');
  lines.push('- **微调期（peak）**：HYD-01（脱水百分比）被抑制，因为赛前水盐操作会让这个数值必然异常；水合改由 HYD-05（补液计划执行率）判定。ENE-01（能量盈亏）关闭——微调期不动热量缺口是阶段定义本身。');
  lines.push('- **恢复期（recover）**：HYD-01/02/03、ENE-01、PHASE-01、REC-03 全部抑制；改看 HYD-04（称重后补液）、REC-01（碳水与进食节奏）、REC-04（体重回升）。晨脉在称重后生理性偏高，不参与判断。');
  lines.push('- **同一份数据、两套结论**：scripts/test-phases.js 用"脱水 3.7% + 蛋白 96g + 酸痛 8 + 次日速度课 + 睡眠 6h"验证，cut 期产出 HYD-01/PRO-01 等 7 条告警，peak 期不报 HYD-01/PRO-01，改报 HYD-05 与 LOG-01，评分差 ≥ 8。');
  lines.push('');
  lines.push('复现：`node scripts/test-phases.js`（47 项断言）。');
  return lines.join('\n');
}

function buildSourceTable() {
  const lines = [];
  lines.push('# 规则–来源对照表（由 scripts/dump-docs.js 生成，勿手改）');
  lines.push('');
  lines.push('每条规则至少 1 个一级来源，anchor 具体到章节或结论句。复核状态为 `needs_review` 的规则，告警展开时会显示"该规则待复核"。');
  lines.push('');
  lines.push('## 总表');
  lines.push('');
  lines.push('| 规则 ID | 规则名 | 阈值 | 复核 | 来源数 | 一级来源（类型 · 年份 · 锚点） |');
  lines.push('|---|---|---|---|---|---|');
  rules.listRules().forEach(function (r) {
    const srcs = r.sources.map(function (s) {
      return rules.SOURCE_TYPES.filter(function (t) { return t.id === s.sourceType; }).map(function (t) { return t.name; })[0] +
        ' ' + s.year + ' · ' + s.anchor + (s.doi ? '（doi:' + s.doi + '）' : '');
    }).join('<br>');
    lines.push('| ' + r.ruleId + ' | ' + mdEscape(r.name) + ' | ' + mdEscape(r.thresholds) + ' | ' +
      (r.reviewStatus === 'needs_review' ? '**待复核**' : '有效') + ' | ' + r.sources.length + ' | ' + srcs + ' |');
  });
  lines.push('');
  lines.push('## 完整文献条目');
  lines.push('');
  const seen = {};
  rules.listRules().forEach(function (r) {
    r.sources.forEach(function (s) {
      if (seen[s.citation]) return;
      seen[s.citation] = true;
      lines.push('- ' + s.citation + (s.doi ? ' doi:' + s.doi : '') + (s.url ? ' ' + s.url : ''));
    });
  });
  lines.push('');
  lines.push('## 待复核与冲突（代码里标了 needs_review）');
  lines.push('');
  rules.listRules().forEach(function (r) {
    if (r.reviewStatus !== 'needs_review') return;
    lines.push('### ' + r.ruleId + ' ' + r.name);
    lines.push('');
    lines.push(r.notes);
    lines.push('');
  });
  return lines.join('\n');
}

fs.writeFileSync(path.join(OUT, 'phase-matrix.md'), buildMatrix() + '\n');
fs.writeFileSync(path.join(OUT, 'rule-source-table.md'), buildSourceTable() + '\n');
console.log('已生成 docs/phase-matrix.md 与 docs/rule-source-table.md');
console.log('规则数：' + rules.listRules().length + '，来源数：' +
  rules.listRules().reduce(function (n, r) { return n + r.sources.length; }, 0));
