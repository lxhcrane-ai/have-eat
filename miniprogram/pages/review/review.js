const api = require('../../utils/api.js');
const rules = require('../../utils/rules.js');
const goals = require('../../utils/goals.js');
const GM = require('../../data/goalMatrix.js');
const fmt = require('../../utils/format.js');
const adviceCache = require('../../utils/adviceCache.js');
const privacy = require('../../utils/privacy.js');
const coachApi = require('../../utils/coachApi.js');

// 本机草稿统一走 adviceCache，键为 advice_backup_v1_<athleteId>_<date>，7 天过期
const readBackup = adviceCache.readBackup;
const writeBackup = adviceCache.writeBackup;
const clearBackup = adviceCache.clearBackup;

const THROTTLE_MS = 1200;
const AUTO_SAVE_MS = 1600;
const STATUS_LABEL = { draft: '草稿', published: '已发布', revoked: '已撤回' };

// 用于判断「本地草稿」与「远端建议」是否真的不同，避免每次进入都弹窗
function sig(x) {
  if (!x) return '';
  const body = (x.body || '').trim();
  const rs = (x.ruleIds || []).slice().sort().join(',');
  const ks = (x.kbIds || []).slice().sort().join(',');
  return body + '|' + rs + '|' + ks;
}

function stampText(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return fmt.timeStr(d);
}

function whenText(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = fmt.todayStr(d);
  const label = day === fmt.todayStr() ? '今天' : (day.slice(5, 7) + '月' + day.slice(8, 10) + '日');
  return label + ' ' + fmt.timeStr(d);
}

const ATOM_NAMES = {};
GM.ATOMS.forEach(function (a) { ATOM_NAMES[a.id] = a.name; });
const BLOCKER_LABELS = {
  goal_illegal: '阶段不合法',
  goal_conflict: '目标冲突',
  phase_suppressed: '阶段抑制',
  evidence_weak: '证据偏弱',
  data_missing: '数据缺失',
  guardrail: '护栏拦截'
};

// 复核矩阵卡：数据只来自快照里的 goal 块；旧快照没有 goal 时整卡不渲染
function buildGoalCard(g) {
  if (!g) return null;
  const requested = Array.isArray(g.requested) ? g.requested : [];
  const blockers = Array.isArray(g.blockers) ? g.blockers : [];
  if (!requested.length && !blockers.length && !g.plan) return null;

  const gv = goals.goalView(g.plan, g.adherence, blockers, {});
  const planAtoms = (g.plan && Array.isArray(g.plan.atoms)) ? g.plan.atoms : [];
  const goalNames = gv.hasGoals ? gv.goalNames : goals.normalizeGoals(requested).atoms.map(function (id) {
    return { id: id, name: ATOM_NAMES[id] || id, role: '', roleLabel: '未生效' };
  });

  const blocked = [];
  const seenBlocked = {};
  function addBlocked(goalId, typeLabel, level, message) {
    const key = goalId + '|' + typeLabel;
    if (seenBlocked[key]) return;
    seenBlocked[key] = true;
    blocked.push({ goalId: goalId, goalName: ATOM_NAMES[goalId] || goalId, typeLabel: typeLabel, level: level, message: message });
  }
  if (g.plan) {
    goals.normalizeGoals(requested).atoms.forEach(function (id) {
      if (planAtoms.indexOf(id) < 0) addBlocked(id, '阶段裁剪', 'amber', '');
    });
  }
  blockers.forEach(function (b) {
    addBlocked(
      b.goalId,
      BLOCKER_LABELS[b.blockerType] || b.blockerType || '阻断',
      b.level || 'info',
      b.message || ''
    );
  });

  return {
    matrixVersion: g.matrixVersion || '',
    effectiveDate: g.effectiveDate || '',
    sourceText: g.source === 'nutritionist' ? '营养师设置' : (g.source || ''),
    conflict: !g.plan || (g.plan.legality !== 'legal'),
    leadName: gv.hasGoals ? gv.leadName : '',
    goals: goalNames,
    composites: gv.hasGoals ? gv.compositeNames : [],
    concessions: gv.hasGoals ? gv.concessions : [],
    blocked: blocked,
    adherence: gv.hasGoals ? gv.adherence : null,
    evidenceLabel: gv.hasGoals ? gv.evidenceLabel : '',
    weak: gv.hasGoals ? gv.weak : false,
    notes: gv.hasGoals ? gv.notes : [],
    strategyText: gv.hasGoals ? gv.strategyText : ''
  };
}

Page({
  data: {
    athleteId: '', name: '拳王', date: '', loading: true, error: '', offline: false,
    refeedInput: '', refeedText: '未设置', savingRefeed: false,
    restored: false, localDraftNote: false, saving: false, publishing: false, updating: false, savedAt: '',
    phase: '', phaseLabel: '', statusText: '未开始', published: false, revoked: false,
    editing: false, readOnly: false, adviceId: '', version: 0,
    publishedText: '', updatedText: '', updateReason: '',
    hasLog: false, logInfo: { meal: 0, sleep: '--', kg: '--', updatedAt: '--' }, logUpdated: '',
    snapshot: null, metrics: [], alerts: [], missingRequired: [], suppressedCount: 0,
    score: '--', level: '--', tone: 'info', headline: '',
    goalCard: null,
    rules: [], kb: [], ruleCount: 0, kbCount: 0,
    body: '', bodyLen: 0, dirty: false
  },

  onLoad(query) {
    privacy.lockShare();
    const q = query || {};
    const athleteId = q.athleteId || '';
    const date = q.date || fmt.todayStr();
    this.lastSaveAt = 0;
    this.saveTimer = null;
    this.setData({
      athleteId: athleteId,
      name: q.name ? decodeURIComponent(q.name) : '拳王',
      date: date
    });
    if (!athleteId) {
      this.setData({ loading: false, error: '缺少拳王参数，请从营养师看板进入' });
      return;
    }
    this.load();
  },

  onRefeedInput(e) {
    this.setData({ refeedInput: e.detail.value });
  },

  // 营养师设置 refeed 计划；留空 = 清除（本周不安排），离线不做本地假写。
  async saveRefeed() {
    if (this.data.savingRefeed) return;
    const raw = String(this.data.refeedInput === undefined || this.data.refeedInput === null ? '' : this.data.refeedInput).trim();
    let val = null;
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 7) {
        wx.showToast({ title: 'refeed 天数应为 0–7 的整数', icon: 'none' });
        return;
      }
      val = n;
    }
    this.setData({ savingRefeed: true });
    try {
      const res = await coachApi.setRefeedPlan({ athleteId: this.data.athleteId, refeedDays: val });
      if (res && res.ok) {
        const days = res.refeedDays;
        this.setData({
          savingRefeed: false,
          refeedInput: (days === null || days === undefined) ? '' : String(days),
          refeedText: (days === null || days === undefined) ? '未设置（本周不安排）' : '每周 ' + days + ' 天'
        });
        wx.showToast({ title: 'refeed 计划已保存', icon: 'success' });
      } else {
        this.setData({ savingRefeed: false });
        wx.showModal({ title: '未保存', content: (res && res.error) || '云端未返回原因，refeed 计划未保存', showCancel: false });
      }
    } catch (e) {
      this.setData({ savingRefeed: false });
      wx.showModal({ title: '未保存', content: '无法连接云端，refeed 计划未保存；本机不会写入假数据，请联网后重试。', showCancel: false });
    }
  },

  onUnload() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
  },

  // 服务端返回系统快照 + 当前建议（草稿或已发布）
  async load() {
    this.setData({ loading: true, error: '' });
    const res = await api.call('advice', {
      action: 'getContext', athleteId: this.data.athleteId, date: this.data.date
    });

    if (!res.ok) {
      // 离线/失败时才读本机草稿；先确认该拳王仍在当前教练名下，避免解绑后恢复旧草稿
      const owned = privacy.isOwnedAthlete(this.data.athleteId);
      const bk = owned ? readBackup(this.data.athleteId, this.data.date) : null;
      // 离线也先把勾选清单渲染出来，备份里的 ruleIds / kbIds 才能恢复
      const ruleView = rules.listRules().map(function (r) {
        return { ruleId: r.ruleId, name: r.name, hit: false, on: false };
      });
      const kbView = ((rules.KB && rules.KB.items) || []).map(function (k) {
        return { id: k.id, title: k.title, hit: false, on: false };
      });
      this.setData({
        loading: false,
        offline: !!res.offline,
        error: res.offline
          ? (owned ? '无法连接云端，当前可继续编辑本机草稿；目标计划与矩阵卡不可用，不会回退本地数据。' : '离线：无法确认该拳王仍在你名下，暂不显示本机草稿与目标计划。')
          : (res.error || '加载失败'),
        statusText: (bk && bk.body) ? '离线 · 本机草稿' : '离线',
        goalCard: null,
        localDraftNote: false,
        restored: !!(bk && bk.body),
        body: (bk && bk.body) || '',
        bodyLen: ((bk && bk.body) || '').length,
        rules: ruleView,
        kb: kbView
      });
      if (bk) this.applySelection(bk.ruleIds || [], bk.kbIds || [], {});
      return;
    }

    const snap = res.systemSnapshot || null;
    const advice = res.advice || null;
    const revoked = !!(advice && advice.status === 'revoked');
    const published = !!(advice && (advice.status === 'published' || revoked));
    const phase = (res.athlete && res.athlete.phase) || '';
    // refeed 计划（营养师写入）：默认回填当前值，留空表示本周不安排。
    const prof = (res.athlete && res.athlete.profile) || {};
    const refeedDays = (prof.refeedDays === null || prof.refeedDays === undefined) ? null : Number(prof.refeedDays);
    const refeedInput = refeedDays === null ? '' : String(refeedDays);
    const refeedText = refeedDays === null ? '未设置（本周不安排）' : '每周 ' + refeedDays + ' 天';

    const hitRules = {};
    const hitKb = {};
    ((snap && snap.alerts) || []).forEach(function (a) {
      if (a.ruleId) hitRules[a.ruleId] = true;
      (a.kb || []).forEach(function (id) { hitKb[id] = true; });
    });

    const bk = readBackup(this.data.athleteId, this.data.date);
    const selectedRules = advice ? (advice.ruleIds || []) : Object.keys(hitRules);
    const selectedKb = advice ? (advice.kbIds || []) : Object.keys(hitKb);

    const ruleView = rules.listRules().map(function (r) {
      return {
        ruleId: r.ruleId,
        name: r.name,
        hit: !!hitRules[r.ruleId],
        on: selectedRules.indexOf(r.ruleId) >= 0
      };
    });
    const kbItems = (rules.KB && rules.KB.items) || [];
    const kbView = kbItems.map(function (k) {
      return { id: k.id, title: k.title, hit: !!hitKb[k.id], on: selectedKb.indexOf(k.id) >= 0 };
    });

    const log = res.log || null;
    const payload = (log && log.payload) || {};
    const logInfo = {
      meal: (payload.meals || []).length,
      sleep: (payload.sleep && payload.sleep.hours !== undefined && payload.sleep.hours !== null && payload.sleep.hours !== '') ? payload.sleep.hours : '--',
      kg: (payload.weights && payload.weights.morning && payload.weights.morning.kg) ? payload.weights.morning.kg : '--',
      updatedAt: stampText(log && log.updatedAt)
    };

    const alerts = ((snap && snap.alerts) || []).map(function (a) {
      const sources = (a.sources || []).map(function (s) {
        return {
          typeName: rules.SOURCE_TYPES.filter(function (t) { return t.id === s.sourceType; }).map(function (t) { return t.name; })[0] || s.sourceType || '',
          year: s.year || '',
          anchor: s.anchor || '',
          doi: s.doi || '',
          citation: s.citation || ''
        };
      });
      const kbTitles = (a.kb || []).map(function (id) {
        return rules.KB_MAP[id] ? rules.KB_MAP[id].title : '';
      }).filter(function (t) { return !!t; });
      return {
        ruleId: a.ruleId || '',
        ruleName: a.ruleName || '',
        level: a.level || 'info',
        title: a.title || '',
        text: a.text || '',
        evidence: a.evidence || '',
        reviewStatus: a.reviewStatus || 'active',
        requiresFollowUp: !!a.requiresFollowUp,
        sources: sources,
        kbTitles: kbTitles
      };
    });

    const body = advice ? (advice.body || '') : '';
    this.setData({
      loading: false,
      offline: false,
      error: '',
      restored: false,
      localDraftNote: false,
      phase: phase,
      phaseLabel: phase ? rules.phaseLabel(phase) : '未设阶段',
      statusText: advice ? (STATUS_LABEL[advice.status] || advice.status) : '未开始',
      published: published,
      revoked: revoked,
      readOnly: published,
      editing: false,
      adviceId: (advice && advice.id) || '',
      version: (advice && Number(advice.version)) || 0,
      publishedText: advice ? whenText(advice.publishedAt) : '',
      updatedText: advice ? whenText(advice.updatedAt) : '',
      hasLog: !!(snap && snap.hasLog),
      logInfo: logInfo,
      logUpdated: (log && log.updatedAt) || '',
      snapshot: snap,
      goalCard: buildGoalCard(snap && snap.goal),
      metrics: (snap && snap.metrics) || [],
      alerts: alerts,
      missingRequired: (snap && snap.missingRequired) || [],
      suppressedCount: (snap && snap.suppressedCount) || 0,
      score: (snap && snap.score === null) ? '--' : ((snap && snap.score !== undefined) ? snap.score : '--'),
      level: (snap && snap.level) || '--',
      tone: (snap && snap.levelTone) || 'info',
      headline: (snap && snap.headline) || '',
      rules: ruleView,
      kb: kbView,
      ruleCount: ruleView.filter(function (x) { return x.on; }).length,
      kbCount: kbView.filter(function (x) { return x.on; }).length,
      body: body,
      bodyLen: body.length,
      refeedInput: refeedInput,
      refeedText: refeedText
    });

    // 本地未发布草稿：只有与远端内容不同才提示，绝不用远端旧内容静默覆盖
    if (bk) {
      if (sig(bk) === sig(advice)) {
        clearBackup(this.data.athleteId, this.data.date);
      } else {
        this.promptLocalDraft(bk, advice);
      }
    }
  },

  // 本地草稿与远端不一致：明确二选一，不静默取舍
  promptLocalDraft(bk, advice) {
    const that = this;
    const published = !!(advice && (advice.status === 'published' || advice.status === 'revoked'));
    const isDraft = !!(advice && advice.status === 'draft');

    const useLocal = function () {
      that.setData({
        body: bk.body || '',
        bodyLen: (bk.body || '').length,
        restored: true,
        dirty: false,
        localDraftNote: false,
        editing: published ? true : that.data.editing,
        readOnly: published ? false : that.data.readOnly,
        statusText: published ? '编辑中' : that.data.statusText
      });
      that.applySelection(bk.ruleIds || [], bk.kbIds || [], {});
    };

    if (published) {
      wx.showModal({
        title: '远端已发布 v' + (Number(advice.version) || 1) + '，本地还有草稿',
        content: '两者并存，不会自动取舍。选择“以本地草稿继续”会进入编辑态，提交时需填写修改原因；选择“查看已发布版本”则保留本机草稿，下次进入可再选。',
        confirmText: '以本地草稿继续',
        cancelText: '查看已发布版本',
        success: function (r) {
          if (r.confirm) { useLocal(); return; }
          that.setData({ localDraftNote: true });
        }
      });
      return;
    }

    if (isDraft) {
      wx.showModal({
        title: '本地草稿与远端草稿并存',
        content: '本机有一份未发布草稿，云端也有一份草稿。请选择保留哪一份，不会被静默覆盖。',
        confirmText: '继续本地草稿',
        cancelText: '使用远端草稿',
        success: function (r) {
          if (r.confirm) { useLocal(); return; }
          clearBackup(that.data.athleteId, that.data.date);
        }
      });
      return;
    }

    wx.showModal({
      title: '有本地草稿，是否继续？',
      content: '本机保存了一份未发布的审阅草稿' + (bk.savedAt ? '（' + whenText(bk.savedAt) + '）' : '') + '。',
      confirmText: '继续编辑',
      cancelText: '丢弃草稿',
      success: function (r) {
        if (r.confirm) { useLocal(); return; }
        that.discardLocalDraft();
      }
    });
  },

  // 丢弃本机草稿：正文清空，勾选回到系统命中项
  discardLocalDraft() {
    clearBackup(this.data.athleteId, this.data.date);
    let rc = 0;
    let kc = 0;
    const ruleView = this.data.rules.map(function (r) {
      const on = !!r.hit;
      if (on) rc += 1;
      return Object.assign({}, r, { on: on });
    });
    const kbView = this.data.kb.map(function (k) {
      const on = !!k.hit;
      if (on) kc += 1;
      return Object.assign({}, k, { on: on });
    });
    this.setData({
      body: '',
      bodyLen: 0,
      restored: false,
      dirty: false,
      localDraftNote: false,
      rules: ruleView,
      kb: kbView,
      ruleCount: rc,
      kbCount: kc
    });
  },

  // 离线恢复备份时只回填勾选
  applySelection(ruleIds, kbIds, hitRules) {
    let rc = 0;
    const ruleView = this.data.rules.map(function (r) {
      const on = (ruleIds || []).indexOf(r.ruleId) >= 0 || (hitRules && hitRules[r.ruleId]);
      if (on) rc += 1;
      return Object.assign({}, r, { on: !!on });
    });
    let kc = 0;
    const kbView = this.data.kb.map(function (k) {
      const on = (kbIds || []).indexOf(k.id) >= 0;
      if (on) kc += 1;
      return Object.assign({}, k, { on: !!on });
    });
    this.setData({ rules: ruleView, kb: kbView, ruleCount: rc, kbCount: kc });
  },

  selectedRuleIds() {
    return this.data.rules.filter(function (r) { return r.on; }).map(function (r) { return r.ruleId; });
  },

  selectedKbIds() {
    return this.data.kb.filter(function (k) { return k.on; }).map(function (k) { return k.id; });
  },

  onBody(e) {
    const body = e.detail.value || '';
    this.setData({ body: body, bodyLen: body.length, dirty: true, restored: false });
    this.touch();
  },

  // 把主导策略要点放到正文开头；只前置，不覆盖营养师已写内容
  bringGoal() {
    const card = this.data.goalCard;
    if (!card || !card.strategyText) return;
    if (this.data.readOnly) {
      wx.showToast({ title: '当前只读，先点编辑', icon: 'none' });
      return;
    }
    const prefix = '【目标·' + (card.leadName || '当前计划') + '】' + card.strategyText;
    const body = this.data.body || '';
    if (body.indexOf(prefix) === 0) {
      wx.showToast({ title: '已在正文开头', icon: 'none' });
      return;
    }
    const next = prefix + (body ? '\n' + body : '');
    this.setData({ body: next, bodyLen: next.length, dirty: true, restored: false });
    this.touch();
  },

  toggleRule(e) {
    if (this.data.readOnly) return;
    const i = e.currentTarget.dataset.i;
    const key = 'rules[' + i + '].on';
    const obj = {};
    obj[key] = !this.data.rules[i].on;
    this.setData(obj);
    this.refreshCounts();
    this.touch();
  },

  toggleKb(e) {
    if (this.data.readOnly) return;
    const i = e.currentTarget.dataset.i;
    const key = 'kb[' + i + '].on';
    const obj = {};
    obj[key] = !this.data.kb[i].on;
    this.setData(obj);
    this.refreshCounts();
    this.touch();
  },

  refreshCounts() {
    this.setData({
      ruleCount: this.data.rules.filter(function (r) { return r.on; }).length,
      kbCount: this.data.kb.filter(function (k) { return k.on; }).length,
      dirty: true
    });
  },

  // 每次改动先写本地备份（离线也能保住），在线时再节流自动存草稿
  touch() {
    writeBackup(this.data.athleteId, this.data.date, {
      body: this.data.body,
      ruleIds: this.selectedRuleIds(),
      kbIds: this.selectedKbIds(),
      savedAt: fmt.nowIso()
    });
    if (this.data.published || this.data.offline) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const that = this;
    this.saveTimer = setTimeout(function () { that.doSave(false, false); }, AUTO_SAVE_MS);
  },

  async doSave(manual, force) {
    if (this.data.published) {
      if (manual) wx.showToast({ title: '已发布：请点下方“修改”提交新版本', icon: 'none' });
      return { ok: false, code: 'PUBLISHED' };
    }
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const body = this.data.body.trim();
    if (!body) {
      if (manual) wx.showToast({ title: '先写建议正文', icon: 'none' });
      return { ok: false, error: 'EMPTY' };
    }
    if (this.data.offline) {
      if (manual) wx.showToast({ title: '离线：已存本机备份，联网后再保存', icon: 'none' });
      return { ok: false, offline: true };
    }
    if (this.data.saving) return { ok: false, error: 'SAVING' };
    const now = Date.now();
    if (!force && now - this.lastSaveAt < THROTTLE_MS) return { ok: false, error: 'THROTTLED' };
    this.lastSaveAt = now;

    this.setData({ saving: true });
    const res = await api.call('advice', {
      action: 'saveDraft',
      athleteId: this.data.athleteId,
      date: this.data.date,
      scope: 'day',
      body: body,
      phase: this.data.phase,
      ruleIds: this.selectedRuleIds(),
      kbIds: this.selectedKbIds(),
      logUpdatedAt: this.data.logUpdated || ''
    });
    this.setData({ saving: false });

    if (res.ok) {
      this.setData({
        adviceId: (res.advice && res.advice.id) || this.data.adviceId,
        statusText: '草稿',
        savedAt: fmt.timeStr(),
        dirty: false,
        restored: false
      });
      if (manual) wx.showToast({ title: '草稿已保存', icon: 'none' });
      return res;
    }
    if (res.code === 'USE_UPDATE') {
      this.setData({ published: true, readOnly: true, statusText: '已发布' });
      if (manual) {
        wx.showModal({
          title: '该日期已有已发布建议',
          content: '该日期已有已发布建议，请关闭后重新进入审阅页，点“修改”提交新版本。',
          showCancel: false
        });
      }
      return res;
    }
    if (manual || res.offline) {
      wx.showToast({ title: res.error || '草稿保存失败', icon: 'none' });
    }
    return res;
  },

  saveDraft() { this.doSave(true, false); },

  publish() {
    if (this.data.published) return;
    if (this.data.offline) {
      wx.showToast({ title: '离线不能发布', icon: 'none' });
      return;
    }
    if (!this.data.body.trim()) {
      wx.showToast({ title: '先写建议正文', icon: 'none' });
      return;
    }
    const that = this;
    wx.showModal({
      title: '发布给 ' + this.data.name,
      content: '发布后拳王首页立即可见，系统快照会在此刻冻结并留痕。',
      confirmText: '发布',
      success: async function (r) {
        if (!r.confirm) return;
        that.setData({ publishing: true });
        const saved = await that.doSave(true, true);
        if (!saved.ok) {
          that.setData({ publishing: false });
          return;
        }
        const res = await api.call('advice', {
          action: 'publish',
          athleteId: that.data.athleteId,
          date: that.data.date,
          scope: 'day'
        });
        that.setData({ publishing: false });
        if (res.ok) {
          const a = res.advice || {};
          that.setData({
            published: true,
            revoked: false,
            readOnly: true,
            statusText: '已发布',
            adviceId: a.id || that.data.adviceId,
            version: Number(a.version) || 1,
            publishedText: whenText(a.publishedAt),
            updatedText: whenText(a.updatedAt),
            savedAt: fmt.timeStr(),
            dirty: false
          });
          clearBackup(that.data.athleteId, that.data.date);
          wx.showToast({
            title: res.notified === false ? '已发布（通知未生成）' : '已发布给拳王',
            icon: 'none'
          });
        } else {
          wx.showModal({ title: '发布失败', content: res.error || '请检查云环境与 advice 集合', showCancel: false });
        }
      }
    });
  },

  // 已发布建议：明确点“修改”才进入编辑态
  startEdit() {
    if (!this.data.published || this.data.revoked) return;
    const that = this;
    const enter = function () {
      that.setData({
        editing: true,
        readOnly: false,
        statusText: '编辑中',
        updateReason: '',
        dirty: false,
        localDraftNote: false
      });
    };
    if (this.data.localDraftNote) {
      wx.showModal({
        title: '本机还有未发布草稿',
        content: '编辑已发布版本后开始输入时，本机草稿会被覆盖。',
        confirmText: '继续编辑已发布版本',
        cancelText: '取消',
        success: function (r) { if (r.confirm) enter(); }
      });
      return;
    }
    enter();
  },

  onReason(e) { this.setData({ updateReason: e.detail.value || '' }); },

  cancelEdit() {
    const that = this;
    if (!this.data.dirty) {
      this.setData({ editing: false, readOnly: true, statusText: this.data.revoked ? '已撤回' : '已发布' });
      return;
    }
    wx.showModal({
      title: '放弃本次修改？',
      content: '未提交的内容不会写入新版本。',
      confirmText: '放弃',
      success: function (r) {
        if (!r.confirm) return;
        that.setData({ editing: false, readOnly: true, statusText: that.data.revoked ? '已撤回' : '已发布' });
        that.load();
      }
    });
  },

  // 提交新版本：正文与原因必填，服务端重算快照并写 revisions / inbox
  submitUpdate() {
    if (!this.data.body.trim()) {
      wx.showToast({ title: '先写建议正文', icon: 'none' });
      return;
    }
    if (!this.data.updateReason.trim()) {
      wx.showToast({ title: '请填写修改原因（可简短）', icon: 'none' });
      return;
    }
    const that = this;
    wx.showModal({
      title: '发布新版本 v' + (this.data.version + 1) + '？',
      content: '拳王会收到更新通知，系统快照会在此刻重新冻结并留痕。',
      confirmText: '发布',
      success: async function (r) {
        if (!r.confirm) return;
        that.setData({ updating: true });
        const res = await api.call('advice', {
          action: 'update',
          adviceId: that.data.adviceId,
          athleteId: that.data.athleteId,
          date: that.data.date,
          scope: 'day',
          body: that.data.body.trim(),
          phase: that.data.phase,
          ruleIds: that.selectedRuleIds(),
          kbIds: that.selectedKbIds(),
          reason: that.data.updateReason.trim()
        });
        that.setData({ updating: false });
        if (res.ok) {
          const a = res.advice || {};
          that.setData({
            editing: false,
            readOnly: true,
            published: true,
            revoked: false,
            statusText: '已发布',
            adviceId: a.id || that.data.adviceId,
            version: Number(a.version) || (that.data.version + 1),
            publishedText: whenText(a.publishedAt),
            updatedText: whenText(a.updatedAt),
            updateReason: '',
            dirty: false,
            restored: false
          });
          clearBackup(that.data.athleteId, that.data.date);
          wx.showToast({ title: '已发布新版本', icon: 'none' });
        } else {
          wx.showModal({ title: '提交失败', content: res.error || '请稍后重试', showCancel: false });
        }
      }
    });
  },

  // 撤回：二次确认 + 原因，明确告知拳王端会显示“已撤回”
  revoke() {
    if (!this.data.published || this.data.revoked) return;
    const that = this;
    wx.showModal({
      title: '撤回这条建议？',
      content: '撤回后拳王端将显示“已撤回”，正文不再展示。可填写撤回原因（可简短）。',
      editable: true,
      placeholderText: '撤回原因',
      confirmText: '撤回',
      success: async function (r) {
        if (!r.confirm) return;
        const reason = (r.content || '').trim() || '营养师撤回';
        that.setData({ updating: true });
        const res = await api.call('advice', {
          action: 'revoke',
          adviceId: that.data.adviceId,
          athleteId: that.data.athleteId,
          date: that.data.date,
          scope: 'day',
          reason: reason
        });
        that.setData({ updating: false });
        if (res.ok) {
          that.setData({
            revoked: true,
            readOnly: true,
            editing: false,
            statusText: '已撤回',
            updatedText: whenText(res.advice && res.advice.updatedAt),
            dirty: false
          });
          wx.showToast({ title: '已撤回', icon: 'none' });
        } else {
          wx.showModal({ title: '撤回失败', content: res.error || '请稍后重试', showCancel: false });
        }
      }
    });
  },

  goBack() { wx.navigateBack(); }
});
