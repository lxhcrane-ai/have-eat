const api = require('../../utils/api.js');
const fmt = require('../../utils/format.js');
const rules = require('../../utils/rules.js');
const goals = require('../../utils/goals.js');
const goalDraft = require('../../utils/goalDraft.js');
const coachApi = require('../../utils/coachApi.js');
const privacy = require('../../utils/privacy.js');

Page({
  data: {
    athleteId: '', name: '拳王', loading: true, error: '', offline: false,
    phase: '', phaseLabel: '', phaseHint: '',
    selected: [], selectedView: [],
    groups: [],
    quota: { main: 0, monitor: 0, maxMain: 3, maxMonitor: 1, text: '主目标 0/3 · 监测 0/1', over: false },
    bodyFat: '', goalDate: '', today: '',
    hasExisting: false, droppedNote: '',
    submitting: false, formError: '', formErrorCode: '', formDetail: '', toggleNote: ''
  },

  onLoad(query) {
    privacy.lockShare();
    const q = query || {};
    const athleteId = q.athleteId || '';
    this.states = [];
    this.setData({
      athleteId: athleteId,
      name: q.name ? decodeURIComponent(q.name) : '拳王'
    });
    if (!athleteId) {
      this.setData({ loading: false, error: '缺少拳王参数，请从营养师看板进入' });
      return;
    }
    this.load();
  },

  // 阶段与已有目标都来自云端 getFeed；离线时整页禁用，不回退本地假数据
  async load() {
    this.setData({ loading: true, error: '', offline: false, formError: '', formErrorCode: '', formDetail: '', toggleNote: '' });
    const res = await api.call('getFeed', {});
    if (!res.ok) {
      this.setData({
        loading: false,
        offline: !!res.offline,
        error: res.offline
          ? '离线：无法读取拳王当前阶段与已有目标，目标设置已禁用。请联网后重试；本机不会伪造目标。'
          : (res.error || '加载失败')
      });
      return;
    }
    if (res.role !== 'coach') {
      this.setData({ loading: false, error: '当前账号是拳王身份，只有营养师可以设置目标' });
      return;
    }
    const list = res.athletes || [];
    const athleteId = this.data.athleteId;
    const a = list.filter(function (x) { return x.openid === athleteId; })[0];
    if (!a) {
      this.setData({ loading: false, error: '该拳王不在你名下（或已解绑），无法设置目标' });
      return;
    }

    const prof = a.profile || {};
    const phase = rules.resolvePhase(prof.phase || 'maintain');
    const today = fmt.todayStr();
    const daysToWeigh = prof.weighInDate ? fmt.daysBetween(today, prof.weighInDate) : null;
    const gapPct = (typeof prof.weightKg === 'number' && typeof prof.targetWeightKg === 'number' && prof.targetWeightKg > 0)
      ? Math.round(((prof.weightKg - prof.targetWeightKg) / prof.targetWeightKg) * 1000) / 10
      : null;

    const parsed = goalDraft.sanitize(prof.goals || []);
    this.states = goalDraft.atomStates(phase, { today: today, daysToWeigh: daysToWeigh, gapPct: gapPct, weighInDate: prof.weighInDate });

    this.setData({
      loading: false, error: '', offline: false,
      phase: phase,
      phaseLabel: rules.phaseLabel(phase),
      phaseHint: '当前阶段「' + rules.phaseLabel(phase) + '」不允许的目标已置灰并写明原因；条件类目标会显示需满足的条件。',
      bodyFat: (typeof prof.bodyFatPct === 'number' ? String(prof.bodyFatPct) : ''),
      goalDate: prof.goalEffectiveDate || today,
      today: today,
      hasExisting: parsed.selected.length > 0,
      droppedNote: parsed.dropped.length ? ('已忽略不可回填的目标：' + parsed.dropped.join('、')) : ''
    });
    this.render(parsed.selected);
  },

  // 选择状态 → 视图：名额、置灰、原因、条件说明都在这里算
  render(selected) {
    const list = (selected || []).slice();
    const q = goalDraft.quota(list);
    const groups = goalDraft.atomGroups(this.states).map(function (g) {
      return {
        id: g.id,
        label: g.label,
        atoms: g.atoms.map(function (s) {
          const checked = list.indexOf(s.id) >= 0;
          let disabled = !s.allowed;
          let reason = s.reason;
          if (!disabled && !checked && q.mainFull && s.occupiesSlot) {
            disabled = true;
            reason = '主目标已满 3 个，请先移除一个再添加';
          }
          if (!disabled && !checked && q.monitorFull && !s.occupiesSlot) {
            disabled = true;
            reason = '免疫监测只能选 1 个，请先移除再加';
          }
          let conditionNote = '';
          if (s.condition) {
            conditionNote = (s.conditionMet ? '条件已满足：' : '需满足：') + s.condition;
          }
          return Object.assign({}, s, {
            checked: checked,
            disabled: disabled,
            disableReason: disabled ? reason : '',
            conditionNote: conditionNote
          });
        })
      };
    });
    this.setData({
      selected: list,
      groups: groups,
      quota: q,
      hasExisting: list.length > 0,
      selectedView: goalDraft.selectedView(list, this.states)
    });
  },

  toggleAtom(e) {
    const id = e.currentTarget.dataset.id;
    const r = goalDraft.toggle(this.data.selected, id, this.states);
    if (!r.ok) {
      this.setData({ toggleNote: r.reason });
      wx.showToast({ title: r.reason, icon: 'none' });
      return;
    }
    this.setData({ toggleNote: '' });
    this.render(r.selected);
  },

  moveGoal(e) {
    const ds = e.currentTarget.dataset;
    const r = goalDraft.move(this.data.selected, Number(ds.i), ds.dir);
    if (r.ok) this.render(r.selected);
  },

  removeGoal(e) {
    const r = goalDraft.removeAt(this.data.selected, Number(e.currentTarget.dataset.i));
    if (r.ok) this.render(r.selected);
  },

  clearAll() {
    const that = this;
    wx.showModal({
      title: '清空目标？',
      content: '清空后提交，拳王端将不再显示目标计划。',
      confirmText: '清空',
      success: function (r) {
        if (!r.confirm) return;
        that.render([]);
      }
    });
  },

  goBack() { wx.navigateBack(); },

  onBodyFat(e) {
    this.setData({ bodyFat: e.detail.value || '' });
  },

  onDate(e) {
    this.setData({ goalDate: e.detail.value || '' });
  },

  // 提交唯一写入口：coachApi.setGoals → 云函数 coachApi(action=setGoals)
  async submit() {
    if (this.data.submitting) return;
    if (this.data.offline) {
      this.setData({
        formErrorCode: '',
        formError: '离线：无法连接云端，目标未保存。本机不会写入假数据，请联网后重试。',
        formDetail: ''
      });
      return;
    }
    const pre = goalDraft.precheck(this.data.selected, this.data.bodyFat, this.data.goalDate);
    if (!pre.ok) {
      this.setData({
        formErrorCode: pre.code,
        formError: pre.code + '：' + goals.goalErrorText(pre.code, pre.reason),
        formDetail: ''
      });
      return;
    }

    this.setData({ submitting: true, formError: '', formErrorCode: '', formDetail: '' });
    const res = await coachApi.setGoals({
      athleteId: this.data.athleteId,
      goals: this.data.selected,
      goalEffectiveDate: this.data.goalDate,
      bodyFatPct: pre.bodyFatPct
    });
    this.setData({ submitting: false });

    if (res.ok) {
      wx.showToast({ title: '目标已保存', icon: 'none' });
      // 返回营养师看板；coach.onShow 会重新拉取并刷新目标 chips
      setTimeout(function () { wx.navigateBack(); }, 600);
      return;
    }
    if (res.offline) {
      this.setData({
        formErrorCode: '',
        formError: res.error || '无法连接云端，目标未保存；本机不会写入假数据。',
        formDetail: ''
      });
      return;
    }
    const code = res.code || '';
    this.setData({
      formErrorCode: code,
      formError: code ? code + '：' + goals.goalErrorText(code, res.error) : goals.goalErrorText('', res.error),
      formDetail: (res.error && code) ? res.error : ''
    });
  }
});
