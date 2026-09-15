const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const share = require('../public/share-message');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const EXPECTED_EMOJIS = {
  home: String.fromCodePoint(0x1F3E1),
  money: String.fromCodePoint(0x1F4B0),
  expenses: String.fromCodePoint(0x1F4B8),
  success: String.fromCodePoint(0x2705),
  warning: String.fromCodePoint(0x26A0, 0xFE0F),
  chart: String.fromCodePoint(0x1F4CA),
  couple: String.fromCodePoint(0x1F46B),
  categories: String.fromCodePoint(0x1F3F7, 0xFE0F),
  receipt: String.fromCodePoint(0x1F9FE),
  link: String.fromCodePoint(0x1F517)
};

function createFullSummary() {
  return {
    month: '2026-08',
    budgetCents: 600000,
    totalCents: 725000,
    paidBy: {
      ido: { amountCents: 325000, count: 6 },
      karina: { amountCents: 400000, count: 5 }
    },
    byCategory: [
      { category: 'חשמל', amountCents: 125000 },
      { category: 'סופר', amountCents: 600000 }
    ],
    expenses: createExpenses(11)
  };
}

function createPositiveSummary() {
  return {
    ...createFullSummary(),
    totalCents: 31000,
    paidBy: {
      ido: { amountCents: 12000, count: 1 },
      karina: { amountCents: 19000, count: 1 }
    },
    byCategory: [
      { category: 'חשבונות', amountCents: 19000 },
      { category: 'סופר', amountCents: 12000 }
    ],
    expenses: [
      { id: 1, amountCents: 12000, category: 'סופר', description: 'סופר שכונתי', paidBy: 'ido', expenseDate: '2026-08-24' },
      { id: 2, amountCents: 19000, category: 'חשבונות', description: 'מים', paidBy: 'karina', expenseDate: '2026-08-23' }
    ]
  };
}

function codePoints(value) {
  return Array.from(value).map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

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
    this.id = selector.startsWith('#') ? selector.slice(1) : '';
    this.className = '';
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.files = [];
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.attributes = {};
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  async dispatch(type, event = {}) {
    const handlers = this.listeners.get(type) || [];
    const dispatchEvent = {
      preventDefault() {},
      target: this,
      ...event
    };
    for (const handler of handlers) await handler(dispatchEvent);
  }

  append() {}
  reset() {}
  scrollIntoView() {}
  showModal() {}
  close() {}
  matches() { return false; }
  closest() { return null; }

  querySelector(selector) {
    return new FakeElement(selector);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
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

async function withStaticServer(callback) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_ROOT, pathname));
    if (!filePath.startsWith(PUBLIC_ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const contentType = filePath.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : filePath.endsWith('.js')
          ? 'application/javascript; charset=utf-8'
          : 'application/octet-stream';
      res.writeHead(200, { 'content-type': contentType });
      res.end(body);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function createExpenses(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    amountCents: (index + 1) * 1000,
    category: index % 2 ? 'חשמל' : 'סופר',
    description: `הוצאה ${index + 1}`,
    paidBy: index % 2 ? 'karina' : 'ido',
    createdBy: index % 3 ? 'ido' : 'karina',
    expenseDate: `2026-08-${String(index + 1).padStart(2, '0')}`
  }));
}

test('בונה הודעת WhatsApp עברית מלאה ללא ערכי NaN או undefined', () => {
  const text = share.buildWhatsAppSummary(createFullSummary());

  assert.match(text, /תקציב הבית/);
  assert.match(text, /אוגוסט 2026/);
  assert.match(text, /\*תקציב חודשי:\* 6,000 ₪/);
  assert.match(text, /\*סך ההוצאות:\* 7,250 ₪/);
  assert.match(text, /\*חריגה של:\* 1,250 ₪/);
  assert.match(text, /\*ניצול התקציב:\* 120\.8%/);
  assert.match(text, /עידו שילם: 3,250 ₪ — 6 הוצאות/);
  assert.match(text, /קארינה שילמה: 4,000 ₪ — 5 הוצאות/);
  assert.ok(text.indexOf('סופר') < text.indexOf('חשמל'));
  assert.match(text, /ועוד 1 הוצאות באפליקציה/);
  assert.match(text, /https:\/\/apartment-budget\.vercel\.app/);
  assert.match(text, /\n\n/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('הודעת WhatsApp מכילה אימוג׳ים תקינים בלי replacement character או mojibake', () => {
  const text = `${share.buildWhatsAppSummary(createFullSummary())}\n${share.buildWhatsAppSummary(createPositiveSummary())}`;

  for (const emoji of Object.values(EXPECTED_EMOJIS)) {
    assert.ok(text.includes(emoji), `missing emoji ${emoji}`);
  }

  assert.doesNotMatch(text, /\uFFFD|�/);
  assert.doesNotMatch(text, /ðŸ|â/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('קידוד WhatsApp מתפענח פעם אחת בדיוק לטקסט המקורי', () => {
  const text = share.buildWhatsAppSummary(createFullSummary());
  const url = share.buildWhatsAppUrl(createFullSummary());

  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(new URL(url).searchParams.get('text'), text);
  assert.notEqual(url, text);
  assert.match(text, /\*תקציב חודשי:\* 6,000 ₪/);
  assert.match(text, /\*סך ההוצאות:\* 7,250 ₪/);
  assert.match(text, /תקציב הבית/);
  assert.match(text, /\n/);
  assert.doesNotMatch(text, /\\\*/);
  assert.doesNotMatch(text, /\*\*\*/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('לחיצה על כפתור השיתוף משתמשת ב-handler האמיתי וב-URLSearchParams', async () => {
  const summary = createPositiveSummary();
  await withStaticServer(async (baseUrl) => {
    const html = await fetch(`${baseUrl}/`).then((response) => response.text());
    const scriptSources = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(scriptSources, [
      '/share-message.js?v=unicode-runtime-2',
      '/app.js?v=unicode-runtime-2'
    ]);

    const scripts = await Promise.all(scriptSources.map((src) => fetch(new URL(src, baseUrl)).then((response) => response.text())));
    const document = createFakeDocument();
    const opened = [];
    const sandbox = {
      URL,
      URLSearchParams,
      Intl,
      Date,
      Math,
      Number,
      String,
      Array,
      Object,
      console,
      document,
      navigator: {
        clipboard: { writeText: async () => {} }
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      fetch: async (requestUrl) => {
        const request = new URL(requestUrl, baseUrl);
        const action = request.searchParams.get('action');
        const body = action === 'summary'
          ? summary
          : action === 'session'
            ? { authenticated: false, users: { ido: 'עידו', karina: 'קארינה' } }
            : {};
        return { ok: true, json: async () => body };
      },
      open: (url, target, features) => {
        opened.push({ url, target, features });
        return {};
      },
      addEventListener() {},
      scrollTo() {},
      confirm: () => true,
      setTimeout,
      clearTimeout,
      setInterval: () => 1,
      clearInterval: () => {}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);
    for (const [index, script] of scripts.entries()) {
      vm.runInContext(script, context, { filename: scriptSources[index] });
    }
    await new Promise((resolve) => setImmediate(resolve));
    await document.querySelector('#shareBtn').dispatch('click');

    assert.equal(opened.length, 1);
    assert.equal(opened[0].target, '_blank');
    assert.equal(opened[0].features, 'noopener,noreferrer');

    const expected = sandbox.HomeBudgetShare.buildWhatsAppSummary(summary);
    const actual = new URL(opened[0].url).searchParams.get('text');
    assert.equal(actual, expected);
    assert.ok(actual.includes(EXPECTED_EMOJIS.home));
    assert.ok(actual.includes(EXPECTED_EMOJIS.money));
    assert.ok(actual.includes(EXPECTED_EMOJIS.expenses));
    assert.ok(actual.includes(EXPECTED_EMOJIS.success));
    assert.ok(actual.includes(EXPECTED_EMOJIS.chart));
    assert.doesNotMatch(actual, /\uFFFD|�|ðŸ|NaN|undefined/);
    assert.doesNotMatch(actual, /\\\*/);
    assert.doesNotMatch(actual, /\*\*\*/);
    assert.deepEqual(codePoints(actual).filter((point) => [
      'U+1F3E1',
      'U+1F4B0',
      'U+1F4B8',
      'U+2705',
      'U+1F4CA'
    ].includes(point)), [
      'U+1F3E1',
      'U+1F4B0',
      'U+1F4B8',
      'U+2705',
      'U+1F4CA'
    ]);
  });
});

test('service worker לא מחזיר סקריפטים ישנים ממטמון v1', () => {
  const source = fs.readFileSync(path.join(PUBLIC_ROOT, 'sw.js'), 'utf8');

  assert.match(source, /home-budget-shell-unicode-runtime-2/);
  assert.match(source, /\/share-message\.js\?v=unicode-runtime-2/);
  assert.match(source, /\/app\.js\?v=unicode-runtime-2/);
  assert.match(source, /event\.request\.destination === 'script'/);
  assert.doesNotMatch(source, /home-budget-shell-v1/);
});

test('מטפל בחודש בלי תקציב ובלי הוצאות', () => {
  const text = share.buildWhatsAppSummary({
    month: '2026-09',
    expenses: [],
    paidBy: {}
  });

  assert.match(text, /עדיין לא הוגדר תקציב/);
  assert.match(text, /אין הוצאות ואין תקציב מוגדר/);
  assert.match(text, /0% \(אין תקציב מוגדר\)/);
  assert.match(text, /אין עדיין הוצאות בחודש הזה/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('מקודד URL של WhatsApp בלי מספר יעד קבוע', () => {
  const url = share.buildWhatsAppUrl({ month: '2026-08', expenses: [] });

  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  assert.doesNotMatch(url, /phone=/);
  assert.match(new URL(url).searchParams.get('text'), /תקציב הבית/);
});
