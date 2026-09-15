const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    for (const name of names) this.values.add(name);
  }

  remove(...names) {
    for (const name of names) this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force ?? !this.values.has(name);
    if (shouldAdd) this.values.add(name);
    else this.values.delete(name);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(selector) {
    this.selector = selector;
    this.children = [];
    this.className = '';
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.style = {};
    this.files = [];
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.src = '';
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  append(...items) {
    this.children.push(...items);
  }

  setAttribute(name, value) {
    this[name] = String(value);
  }

  matches() { return false; }
  closest() { return null; }
  reset() {}
  scrollIntoView() {}
  showModal() {}
  close() {}

  querySelector(selector) {
    return new FakeElement(selector);
  }
}

function createFakeDocument() {
  const elements = new Map();
  return {
    activeElement: null,
    visibilityState: 'visible',
    addEventListener() {},
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
      return elements.get(selector);
    }
  };
}

function loadAppContext() {
  const document = createFakeDocument();
  const sandbox = {
    document,
    window: null,
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ authenticated: false, users: { ido: 'עידו', karina: 'קארינה' } }) }),
    URLSearchParams,
    Intl,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    RegExp,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    confirm: () => true,
    addEventListener() {},
    Image: class {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'public/app.js' });
  return { context, document };
}

test('זיהוי כפילות עובד לפי תאריך, סכום, משלם ותיאור מנורמל', () => {
  const { context } = loadAppContext();
  const result = vm.runInContext(`
    isPotentialDuplicate(
      { expenseDate: '2026-08-24', amountCents: 12000, paidBy: 'ido', description: 'סופר   שכונתי!' },
      [{ expenseDate: '2026-08-24', amountCents: 12000, paidBy: 'ido', description: 'סופר שכונתי' }]
    )
  `, context);

  assert.equal(result, true);
});

test('כמה עסקאות מאותו צילום מוצגות במסך האישור', () => {
  const { context, document } = loadAppContext();
  vm.runInContext(`
    state.categories = ['סופר', 'מים', 'אחר'];
    state.session = { user: 'ido', name: 'עידו' };
    renderImageTransactions([
      { amountCents: 12000, description: 'סופר', merchant: 'סופר', expenseDate: '2026-08-24', category: 'סופר', confidence: 0.94, warning: '', paidBy: 'ido', duplicate: false },
      { amountCents: 9000, description: 'מים', merchant: 'עירייה', expenseDate: '2026-08-23', category: 'מים', confidence: 0.65, warning: 'תאריך לא חד', paidBy: 'ido', duplicate: true }
    ]);
  `, context);

  const review = document.querySelector('#imageTransactionsReview');
  const list = review.children.find((item) => item.className === 'image-transaction-list');
  assert.ok(list);
  assert.equal(list.children.length, 2);
});
