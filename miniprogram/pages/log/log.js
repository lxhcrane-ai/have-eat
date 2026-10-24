const rules = require('../../utils/rules.js');
const store = require('../../utils/store.js');
const fmt = require('../../utils/format.js');
const api = require('../../utils/api.js');
const FOOD = require('../../utils/food.js');

const SESSIONS = [
  { id: 'cardio', name: '有氧' }, { id: 'strength', name: '力量' },
  { id: 'technique', name: '技术' }, { id: 'sparring', name: '实战' },
  { id: 'recovery', name: '恢复' }, { id: 'rest', name: '休息' }
];
const PLAN_TYPES = [
  { id: 'technique', name: '技术' }, { id: 'speed', name: '速度' },
  { id: 'power', name: '爆发' }, { id: 'max_strength', name: '最大力量' },
  { id: 'conditioning', name: '体能' }, { id: 'rest', name: '休息' }
];
const AREAS = [
  { id: 'shoulder', name: '肩' }, { id: 'back', name: '背' },
  { id: 'arm', name: '手臂' }, { id: 'leg', name: '腿' }, { id: 'core', name: '核心' }
];
const MEAL_SLOTS = [
  { id: 'breakfast', name: '早餐' }, { id: 'lunch', name: '午餐' },
  { id: 'dinner', name: '晚餐' }, { id: 'snack', name: '加餐' }
];

function emptyDraft(date) {
  return {
    date: date,
    weights: { morning: { kg: '', context: 'morning_fasted' }, pre: { kg: '', context: 'pre_train' }, post: { kg: '', context: 'post_train' } },
    sleep: { hours: '', quality: 3 },
    hydration: { waterMl: '', urineColor: 2 },
    restingHr: '',
    training: { sessionType: '', durationMin: '', rpe: 6, rounds: '', content: '' },
    sorenessByArea: { shoulder: 0, back: 0, arm: 0, leg: 0, core: 0 },
    mood: { fatigue: 3, stress: 3, appetite: 3 },
    meals: [],
    nextPlan: { type: '', note: '' },
    // 微调期：补液计划与实际执行
    hydrationPlan: { planMl: '', actualMl: '', sodiumOk: true },
    // 微调/恢复期：胃肠症状（0 无 – 4 严重；appetite 指"食欲下降"）
    giSymptoms: { nausea: 0, bloating: 0, cramp: 0, appetite: 0, vomiting: false },
    // 补剂执行
    supplementPlan: { planned: [], taken: [], creatineG: '', caffeineMg: '' },
    // 恢复期：称重后补液补糖
    postWeighIn: { fluidMl: '', carbG: '', fluidSodium: true, subjective: 3, weighInKg: '', glycogenDepleted: true },
    goal: {}
  };
}

Page({
  data: {
    draft: null,
    sessions: SESSIONS, planTypes: PLAN_TYPES, areas: AREAS, slots: MEAL_SLOTS,
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 },
    preview: '',
    pickerOpen: false, pickerMealIndex: 0, foodQuery: '', foodShown: [], pickFood: null, pickGrams: '100',
    sorenessList: [],
    saving: false, offline: false, isHistory: false,
    urineTones: [1, 2, 3, 4, 5, 6, 7, 8],
    rpeMarks: { 1: '很轻', 10: '极限' },
    // 阶段驱动的表单：阶段决定哪些字段必填、哪些出现
    phaseId: 'maintain', phaseLabel: '', phaseGoal: '', phaseNote: '',
    phaseRequired: [], phaseOptional: [],
    giList: [], suppList: [],
    giKeys: [
      { key: 'nausea', name: '恶心' },
      { key: 'bloating', name: '腹胀' },
      { key: 'cramp', name: '痉挛' },
      { key: 'appetite', name: '食欲下降' }
    ],
    suppOptions: [
      { id: 'creatine', name: '肌酸' },
      { id: 'caffeine', name: '咖啡因' },
      { id: 'betaAlanine', name: 'β-丙氨酸' }
    ]
  },

  onLoad(query) {
    const date = (query && query.date) || fmt.todayStr();
    this.setData({ isHistory: date !== fmt.todayStr() });
    this.applyPhase();
    this.loadDraft(date);
  },

  // 阶段只读：由营养师后台设置，拳王端不提供切换
  applyPhase() {
    const profile = wx.getStorageSync('profile') || {};
    const prof = rules.getPhaseProfile(profile.phase);
    const fields = rules.fieldsFor(prof.id);
    this.setData({
      phaseId: prof.id,
      phaseLabel: prof.label,
      phaseGoal: prof.goal,
      phaseNote: prof.notes,
      phaseRequired: fields.required,
      phaseOptional: fields.optional
    });
  },

  isRequired(key) {
    return this.data.phaseRequired.some(function (f) { return f.key === key; });
  },

  onShow() {
    // 从趋势页点进来时，用 storage 传日期（tabBar 页无法接收 query）
    const edit = wx.getStorageSync('edit_date');
    if (edit) {
      wx.removeStorageSync('edit_date');
      if (edit !== this.data.draft.date) {
        this.setData({ isHistory: edit !== fmt.todayStr() });
        this.loadDraft(edit);
      }
    }
  },

  loadDraft(date) {
    const saved = store.get(date);
    const profile = wx.getStorageSync('profile') || {};
    let d;
    if (saved) {
      const n = rules.normalizeLog(saved);
      d = {
        date: n.date,
        weights: {
          morning: { kg: n.weights.morning ? String(n.weights.morning.kg) : '', context: 'morning_fasted' },
          pre: { kg: n.weights.pre ? String(n.weights.pre.kg) : '', context: 'pre_train' },
          post: { kg: n.weights.post ? String(n.weights.post.kg) : '', context: 'post_train' }
        },
        sleep: { hours: n.sleep.hours === null ? '' : String(n.sleep.hours), quality: n.sleep.quality || 3 },
        hydration: { waterMl: n.hydration.waterMl ? String(n.hydration.waterMl) : '', urineColor: n.hydration.urineColor || 2 },
        restingHr: n.restingHr === null ? '' : String(n.restingHr),
        training: {
          sessionType: n.training.sessionType || '',
          durationMin: n.training.durationMin === null ? '' : String(n.training.durationMin),
          rpe: n.training.rpe || 6,
          rounds: n.training.rounds === null ? '' : String(n.training.rounds),
          content: n.training.content || ''
        },
        sorenessByArea: {
          shoulder: n.sorenessByArea.shoulder || (n.sorenessLegacy || 0),
          back: n.sorenessByArea.back || 0, arm: n.sorenessByArea.arm || 0,
          leg: n.sorenessByArea.leg || 0, core: n.sorenessByArea.core || 0
        },
        mood: { fatigue: n.mood.fatigue || 3, stress: n.mood.stress || 3, appetite: n.mood.appetite || 3 },
        meals: (n.meals || []).map(function (m) {
          return { slot: m.slot || 'snack', time: m.time || '', items: m.items || [], note: m.note || '', photoFileId: m.photoFileId || '', photoLocal: '' };
        }),
        nextPlan: { type: (n.nextPlan && n.nextPlan.type) || '', note: (n.nextPlan && n.nextPlan.note) || '' },
        hydrationPlan: {
          planMl: n.hydrationPlan.planMl === null ? '' : String(n.hydrationPlan.planMl),
          actualMl: n.hydrationPlan.actualMl === null ? '' : String(n.hydrationPlan.actualMl),
          sodiumOk: n.hydrationPlan.sodiumOk !== false
        },
        giSymptoms: {
          nausea: n.giSymptoms.nausea || 0, bloating: n.giSymptoms.bloating || 0,
          cramp: n.giSymptoms.cramp || 0, appetite: n.giSymptoms.appetite || 0,
          vomiting: !!n.giSymptoms.vomiting
        },
        supplementPlan: {
          planned: n.supplementPlan.planned || [],
          taken: n.supplementPlan.taken || [],
          creatineG: n.supplementPlan.creatineG === null ? '' : String(n.supplementPlan.creatineG),
          caffeineMg: n.supplementPlan.caffeineMg === null ? '' : String(n.supplementPlan.caffeineMg)
        },
        postWeighIn: {
          fluidMl: n.postWeighIn.fluidMl === null ? '' : String(n.postWeighIn.fluidMl),
          carbG: n.postWeighIn.carbG === null ? '' : String(n.postWeighIn.carbG),
          fluidSodium: n.postWeighIn.fluidSodium !== false,
          subjective: n.postWeighIn.subjective === null ? 3 : n.postWeighIn.subjective,
          weighInKg: n.postWeighIn.weighInKg === null ? '' : String(n.postWeighIn.weighInKg),
          glycogenDepleted: n.postWeighIn.glycogenDepleted !== false
        },
        goal: n.goal || {}
      };
    } else {
      d = emptyDraft(date);
      if (profile.phase) d.goal.phase = profile.phase;
    }
    this.setData({ draft: d });
    this.syncSoreness();
    this.syncGi();
    this.syncSupp();
    this.recalc();
  },

  syncGi() {
    const g = (this.data.draft && this.data.draft.giSymptoms) || {};
    this.setData({
      giList: this.data.giKeys.map(function (k) { return { key: k.key, name: k.name, v: Number(g[k.key] || 0) }; })
    });
  },

  syncSupp() {
    const sp = (this.data.draft && this.data.draft.supplementPlan) || { planned: [], taken: [] };
    this.setData({
      suppList: this.data.suppOptions.map(function (o) {
        return {
          id: o.id, name: o.name,
          planned: (sp.planned || []).indexOf(o.id) >= 0,
          taken: (sp.taken || []).indexOf(o.id) >= 0
        };
      })
    });
  },

  syncSoreness() {
    const s = this.data.draft.sorenessByArea || {};
    this.setData({
      sorenessList: AREAS.map(function (a) { return { id: a.id, name: a.name, v: s[a.id] || 0 }; })
    });
  },

  // ---------- 通用输入 ----------
  onNum(e) {
    const k = e.currentTarget.dataset.k;
    const v = e.detail.value;
    const o = {}; o['draft.' + k] = v;
    this.setData(o);
    this.recalc();
  },
  onText(e) {
    const k = e.currentTarget.dataset.k;
    const o = {}; o['draft.' + k] = e.detail.value;
    this.setData(o);
  },
  onPick(e) {
    const ds = e.currentTarget.dataset;
    const o = {}; o['draft.' + ds.k] = String(ds.v);
    this.setData(o);
    this.recalc();
  },
  onSlider(e) {
    const ds = e.currentTarget.dataset;
    const o = {}; o['draft.' + ds.k] = e.detail.value;
    this.setData(o);
    if (ds.k.indexOf('sorenessByArea') >= 0) this.syncSoreness();
    this.recalc();
  },
  onDate(e) {
    const date = e.detail.value;
    this.setData({ isHistory: date !== fmt.todayStr() });
    this.loadDraft(date);
  },

  // 胃肠症状（0 无 – 4 严重）
  onGi(e) {
    const k = e.currentTarget.dataset.k;
    const o = {}; o['draft.giSymptoms.' + k] = e.detail.value;
    this.setData(o);
    this.syncGi();
    this.recalc();
  },

  // 补剂计划 / 已执行 多选
  toggleSupp(e) {
    const ds = e.currentTarget.dataset;
    const list = (this.data.draft.supplementPlan[ds.kind] || []).slice();
    const i = list.indexOf(ds.id);
    if (i >= 0) list.splice(i, 1); else list.push(ds.id);
    const o = {}; o['draft.supplementPlan.' + ds.kind] = list;
    this.setData(o);
    this.syncSupp();
  },

  onBool(e) {
    const k = e.currentTarget.dataset.k;
    const parts = k.split('.');
    let cur = this.data.draft;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    const last = parts[parts.length - 1];
    const o = {}; o['draft.' + k] = !cur[last];
    this.setData(o);
    this.recalc();
  },

  // ---------- 餐食 ----------
  addSlot(e) {
    const slot = e.currentTarget.dataset.slot;
    const meals = this.data.draft.meals.slice();
    const nameMap = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
    meals.push({ slot: slot, time: fmt.timeStr(), items: [], note: '', photoFileId: '', photoLocal: '', label: nameMap[slot] });
    this.setData({ 'draft.meals': meals });
    this.recalc();
  },

  removeMeal(e) {
    const i = e.currentTarget.dataset.i;
    const meals = this.data.draft.meals.slice();
    meals.splice(i, 1);
    this.setData({ 'draft.meals': meals });
    this.recalc();
  },

  copyLastMeal(e) {
    const i = e.currentTarget.dataset.i;
    const meals = this.data.draft.meals.slice();
    const cur = meals[i];
    // 从历史记录里找同名餐次最近一次
    const logs = store.recent(14);
    let src = null;
    for (let j = 0; j < logs.length; j++) {
      if (logs[j].date === this.data.draft.date) continue;
      const ms = (logs[j].meals || []);
      for (let k = 0; k < ms.length; k++) {
        if (ms[k].slot === cur.slot && ms[k].items && ms[k].items.length) { src = ms[k]; break; }
      }
      if (src) break;
    }
    if (!src) { wx.showToast({ title: '没有可复制的历史餐', icon: 'none' }); return; }
    cur.items = JSON.parse(JSON.stringify(src.items));
    this.setData({ 'draft.meals': meals });
    this.recalc();
    wx.showToast({ title: '已复制上次同餐', icon: 'none' });
  },

  openPicker(e) {
    const i = e.currentTarget.dataset.i;
    this.setData({ pickerOpen: true, pickerMealIndex: i, foodQuery: '', foodShown: FOOD.slice(0, 40), pickFood: null, pickGrams: '100' });
  },
  closePicker() { this.setData({ pickerOpen: false }); },
  onFoodSearch(e) {
    const q = (e.detail.value || '').trim();
    const list = q ? FOOD.filter(function (f) { return f.name.indexOf(q) >= 0; }) : FOOD.slice(0, 40);
    this.setData({ foodQuery: q, foodShown: list });
  },
  pickFoodItem(e) {
    const id = e.currentTarget.dataset.id;
    const f = FOOD.filter(function (x) { return x.id === id; })[0];
    this.setData({ pickFood: f });
  },
  onGrams(e) { this.setData({ pickGrams: e.detail.value }); },

  confirmAddFood() {
    const f = this.data.pickFood;
    const g = parseFloat(this.data.pickGrams);
    if (!f) { wx.showToast({ title: '先选一种食物', icon: 'none' }); return; }
    if (!g || g <= 0) { wx.showToast({ title: '输入克数', icon: 'none' }); return; }
    const factor = g / 100;
    const item = {
      id: f.id, name: f.name, grams: g,
      kcal: Math.round(f.kcal * factor),
      protein: Math.round(f.p * factor * 10) / 10,
      carbs: Math.round(f.c * factor * 10) / 10,
      fat: Math.round(f.f * factor * 10) / 10
    };
    const meals = this.data.draft.meals.slice();
    meals[this.data.pickerMealIndex].items.push(item);
    this.setData({ 'draft.meals': meals, pickerOpen: false, pickFood: null });
    this.recalc();
  },

  removeItem(e) {
    const ds = e.currentTarget.dataset;
    const meals = this.data.draft.meals.slice();
    meals[ds.i].items.splice(ds.j, 1);
    this.setData({ 'draft.meals': meals });
    this.recalc();
  },

  choosePhoto(e) {
    const i = e.currentTarget.dataset.i;
    const that = this;
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success(res) {
        const path = res.tempFiles[0].tempFilePath;
        const meals = that.data.draft.meals.slice();
        meals[i].photoLocal = path;
        that.setData({ 'draft.meals': meals });
        wx.cloud.uploadFile({
          cloudPath: 'meals/' + that.data.draft.date + '_' + Date.now() + '.jpg',
          filePath: path,
          success(up) {
            const m2 = that.data.draft.meals.slice();
            m2[i].photoFileId = up.fileID;
            that.setData({ 'draft.meals': m2 });
          },
          fail() { /* 离线时保留本地路径，仅用于本机查看 */ }
        });
      }
    });
  },

  recalc() {
    const meals = this.data.draft.meals || [];
    let kcal = 0, p = 0, c = 0, f = 0, count = 0;
    meals.forEach(function (m) {
      if (!m.items || !m.items.length) return;
      count++;
      m.items.forEach(function (it) {
        kcal += it.kcal || 0; p += it.protein || 0; c += it.carbs || 0; f += it.fat || 0;
      });
    });
    const totals = { kcal: Math.round(kcal), protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f), count: count };

    // 实时预览
    const profile = wx.getStorageSync('profile') || {};
    const log = this.buildLog();
    const fb = rules.evaluate(log, { profile: profile, recentMorningWeights: store.morningWeights(14) });
    let preview = '蛋白 ' + totals.protein + '/' + (fb.protein.targetG || '?') + 'g';
    if (fb.hydration.pct !== null) preview = '脱水 ' + fb.hydration.pct + '% · ' + preview;
    if (totals.kcal) preview += ' · ' + totals.kcal + 'kcal';
    this.setData({ totals: totals, preview: preview });
  },

  buildLog() {
    const d = this.data.draft;
    const meals = (d.meals || []).map(function (m) {
      let kcal = 0, p = 0, c = 0, f = 0;
      (m.items || []).forEach(function (it) { kcal += it.kcal || 0; p += it.protein || 0; c += it.carbs || 0; f += it.fat || 0; });
      return {
        slot: m.slot, time: m.time, note: m.note || '', items: m.items || [],
        kcal: Math.round(kcal), protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f),
        photoFileId: m.photoFileId || '', source: (m.items && m.items.length) ? 'library' : 'text_only'
      };
    });

    return {
      schemaVersion: 2,
      date: d.date,
      tzOffset: fmt.tzOffsetMinutes(),
      createdAt: fmt.nowIso(),
      weights: {
        morning: d.weights.morning.kg ? { kg: d.weights.morning.kg, context: 'morning_fasted' } : null,
        pre: d.weights.pre.kg ? { kg: d.weights.pre.kg, context: 'pre_train' } : null,
        post: d.weights.post.kg ? { kg: d.weights.post.kg, context: 'post_train' } : null
      },
      sleep: { hours: d.sleep.hours, quality: d.sleep.quality },
      hydration: { waterMl: d.hydration.waterMl, urineColor: d.hydration.urineColor },
      restingHr: d.restingHr,
      training: d.training,
      sorenessByArea: d.sorenessByArea,
      mood: d.mood,
      meals: meals,
      nextPlan: d.nextPlan,
      hydrationPlan: d.hydrationPlan,
      giSymptoms: d.giSymptoms,
      supplementPlan: d.supplementPlan,
      postWeighIn: d.postWeighIn,
      goal: d.goal
    };
  },

  async save() {
    const log = this.buildLog();
    if (!log.weights.morning.kg && !log.weights.pre.kg && !log.weights.post.kg) {
      wx.showToast({ title: '至少填一个体重', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    log.athleteId = wx.getStorageSync('openid') || '';
    store.upsert(log);

    const profile = wx.getStorageSync('profile') || {};
    const fb = rules.evaluate(log, { profile: profile, recentMorningWeights: store.morningWeights(14) });

    const res = await api.call('saveLog', { log: log });
    this.setData({ saving: false });

    if (res.ok) {
      store.clearPending(log.date);
      wx.showToast({ title: '已同步 · ' + fb.score + ' 分', icon: 'none', duration: 1500 });
    } else {
      store.addPending(log.date);
      wx.showToast({ title: '已存本机，联网后同步', icon: 'none', duration: 1800 });
    }
    setTimeout(function () { wx.switchTab({ url: '/pages/index/index' }); }, 700);
  }
});
