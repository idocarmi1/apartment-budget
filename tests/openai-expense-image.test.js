const test = require('node:test');
const assert = require('node:assert/strict');
const { centralApi } = require('../src/central-api');
const { createMemoryRepository } = require('../src/memory-repository');
const { setRepositoryForTests } = require('../src/api-utils');
const {
  OPENAI_RESPONSES_URL,
  parseDataUrl,
  parseExpenseImage,
  setOpenAIResponsesFetchForTests
} = require('../src/openai-expense-image');

process.env.COOKIE_SECRET = 'test-secret';
process.env.IDO_PIN = 'test-ido-pin';
process.env.KARINA_PIN = 'test-karina-pin';

const VALID_IMAGE = `data:image/jpeg;base64,${Buffer.from('fake-image').toString('base64')}`;

function createReq({ method = 'GET', url = '/api', body, cookie } = {}) {
  return {
    method,
    url,
    query: undefined,
    body,
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: `image-test-${Math.random()}` },
    [Symbol.asyncIterator]: async function* iterator() {}
  };
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(value) {
      this.body = value || '';
    }
  };
}

function json(res) {
  return JSON.parse(res.body);
}

async function login(user = 'ido') {
  const res = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=login',
    body: { user, pin: user === 'ido' ? 'test-ido-pin' : 'test-karina-pin' }
  }), res);
  assert.equal(res.statusCode, 200);
  return res.headers['set-cookie'].split(';')[0];
}

function mockOpenAI(transactions, capture = {}) {
  setOpenAIResponsesFetchForTests(async (url, options) => {
    capture.url = url;
    capture.request = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({ transactions })
      })
    };
  });
}

test.afterEach(() => {
  setOpenAIResponsesFetchForTests(null);
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_VISION_MODEL;
});

test('משתמש לא מחובר אינו יכול לפענח תמונה', async () => {
  const res = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=parse-expense-image',
    body: { imageDataUrl: VALID_IMAGE }
  }), res);

  assert.equal(res.statusCode, 401);
  assert.match(json(res).error, /נדרשת התחברות/);
});

test('קובץ מסוג לא נתמך נדחה', () => {
  assert.throws(() => parseDataUrl('data:image/gif;base64,AAAA'), /סוג קובץ לא נתמך/);
});

test('קובץ גדול מדי נדחה', () => {
  const oversized = `data:image/jpeg;base64,${'A'.repeat((4 * 1024 * 1024 * 4) / 3 + 20)}`;
  assert.throws(() => parseDataUrl(oversized), /גדול מדי/);
});

test('תשובת AI תקינה ממופה לעסקאות ומשתמש מחובר קובע את המשלם', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_VISION_MODEL = 'test-vision-model';
  setRepositoryForTests(createMemoryRepository());
  const capture = {};
  mockOpenAI([
    {
      amount: 120.5,
      description: 'סופר שכונתי',
      merchant: 'סופר בעיר',
      expenseDate: '2026-08-24',
      category: 'סופר',
      confidence: 0.94,
      warning: ''
    }
  ], capture);

  const cookie = await login('karina');
  const res = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=parse-expense-image',
    cookie,
    body: { imageDataUrl: VALID_IMAGE }
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(capture.url, OPENAI_RESPONSES_URL);
  assert.equal(capture.request.model, 'test-vision-model');
  assert.equal(capture.request.text.format.type, 'json_schema');
  assert.equal(capture.request.input[1].content[1].type, 'input_image');
  assert.equal(json(res).transactions[0].amountCents, 12050);
  assert.equal(json(res).transactions[0].paidBy, 'karina');
  assert.equal(json(res).transactions[0].category, 'סופר');
});

test('תשובת AI חלקית או שגויה מטופלת ללא קריסה', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  setOpenAIResponsesFetchForTests(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: '{broken json' })
  }));

  const result = await parseExpenseImage({ imageDataUrl: VALID_IMAGE, categories: ['סופר', 'אחר'] });
  assert.deepEqual(result.transactions, []);
  assert.match(result.warning, /צילום לא ברור/);
});

test('כמה עסקאות מאותו צילום מוחזרות, אך לא נשמרת הוצאה לפני אישור', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const repo = createMemoryRepository();
  setRepositoryForTests(repo);
  mockOpenAI([
    { amount: 10, description: 'מים', merchant: 'עירייה', expenseDate: '2026-08-20', category: 'מים', confidence: 0.8, warning: '' },
    { amount: 25, description: 'סופר', merchant: 'מכולת', expenseDate: '2026-08-21', category: 'סופר', confidence: 0.9, warning: '' }
  ]);

  const cookie = await login('ido');
  const parseRes = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=parse-expense-image',
    cookie,
    body: { imageDataUrl: VALID_IMAGE }
  }), parseRes);

  assert.equal(parseRes.statusCode, 200);
  assert.equal(json(parseRes).transactions.length, 2);
  assert.equal((await repo.getSummary('2026-08')).expenseCount, 0);
});

test('העסקאות המאושרות נשמרות דרך מנגנון ההוצאות הקיים', async () => {
  const repo = createMemoryRepository();
  setRepositoryForTests(repo);
  const cookie = await login('ido');
  const expenseRes = createRes();

  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=expenses',
    cookie,
    body: {
      amountCents: 2500,
      category: 'סופר',
      description: 'עסקה מאושרת מצילום',
      paidBy: 'ido',
      expenseDate: '2026-08-21'
    }
  }), expenseRes);

  assert.equal(expenseRes.statusCode, 201);
  const summary = await repo.getSummary('2026-08');
  assert.equal(summary.expenseCount, 1);
  assert.equal(summary.expenses[0].description, 'עסקה מאושרת מצילום');
});
