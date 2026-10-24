const rules = require('../../utils/rules.js');

Page({
  data: { cats: [], active: 'all', list: [], query: '', openId: '', total: 0 },

  onLoad() {
    const cats = [{ id: 'all', name: '全部', desc: '' }].concat(rules.KB.categories);
    this.setData({ cats: cats, total: rules.KB.items.length });
    this.filter('all', '');
  },

  pickCat(e) {
    const id = e.currentTarget.dataset.id;
    this.filter(id, this.data.query);
  },

  onSearch(e) {
    const q = e.detail.value || '';
    this.setData({ query: q });
    this.filter(this.data.active, q);
  },

  filter(cat, q) {
    let list = rules.KB.items.slice();
    if (cat && cat !== 'all') list = list.filter(function (i) { return i.cat === cat; });
    if (q) {
      const k = q.toLowerCase();
      list = list.filter(function (i) {
        return (i.title + i.body + i.tags.join(' ')).toLowerCase().indexOf(k) >= 0;
      });
    }
    const catName = {};
    rules.KB.categories.forEach(function (c) { catName[c.id] = c.name; });
    this.setData({
      active: cat,
      list: list.map(function (i) {
        return { id: i.id, title: i.title, body: i.body, source: i.source, catName: catName[i.cat] || '' };
      })
    });
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ openId: this.data.openId === id ? '' : id });
  }
});
