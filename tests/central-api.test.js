const test = require('node:test');
const assert = require('node:assert/strict');
const { centralApi } = require('../src/central-api');
const { createMemoryRepository } = require('../src/memory-repository');
const { setRepositoryForTests } = require('../src/api-utils');

process.env.COOKIE_SECRET = 'test-secret';
process.env.IDO_PIN = 'test-ido-pin';
process.env.KARINA_PIN = 'test-karina-pin';

function createReq({ method = 'GET', url = '/api', body, cookie } = {}) {
  return {
    method,
    url,
    query: undefined,
    body,
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: `central-test-${Math.random()}` },
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

test('הפונקציה המרכזית מנתבת התחברות ומצב session', async () => {
  const loginRes = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=login',
    body: { user: 'ido', pin: 'test-ido-pin' }
  }), loginRes);

  assert.equal(loginRes.statusCode, 200);
  assert.equal(json(loginRes).user, 'ido');

  const cookie = loginRes.headers['set-cookie'].split(';')[0];
  const sessionRes = createRes();
  await centralApi(createReq({
    method: 'GET',
    url: '/api?action=session',
    cookie
  }), sessionRes);

  assert.equal(sessionRes.statusCode, 200);
  assert.equal(json(sessionRes).authenticated, true);
  assert.equal(json(sessionRes).user, 'ido');
});

test('הפונקציה המרכזית מחזירה 404 לפעולה לא קיימת', async () => {
  const res = createRes();
  await centralApi(createReq({ method: 'GET', url: '/api?action=missing' }), res);
  assert.equal(res.statusCode, 404);
});

test('שמירת תקציב דרך ה-API המרכזי נשמרת ומשותפת לשני המשתמשים', async () => {
  setRepositoryForTests(createMemoryRepository());

  const idoLogin = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=login',
    body: { user: 'ido', pin: 'test-ido-pin' }
  }), idoLogin);
  const idoCookie = idoLogin.headers['set-cookie'].split(';')[0];

  const budgetRes = createRes();
  await centralApi(createReq({
    method: 'PUT',
    url: '/api?action=budget&month=2026-08',
    cookie: idoCookie,
    body: { month: '2026-08', amountCents: 600000 }
  }), budgetRes);
  assert.equal(budgetRes.statusCode, 200);
  assert.equal(json(budgetRes).budget.amountCents, 600000);

  const expenseRes = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=expenses',
    cookie: idoCookie,
    body: {
      amountCents: 1000,
      category: 'סופר',
      description: 'בדיקת תקציב',
      paidBy: 'ido',
      expenseDate: '2026-08-24'
    }
  }), expenseRes);
  assert.equal(expenseRes.statusCode, 201);

  const idoSummary = createRes();
  await centralApi(createReq({
    method: 'GET',
    url: '/api?action=summary&month=2026-08',
    cookie: idoCookie
  }), idoSummary);
  assert.equal(json(idoSummary).budgetCents, 600000);
  assert.equal(json(idoSummary).totalCents, 1000);
  assert.equal(json(idoSummary).remainingCents, 599000);

  const karinaLogin = createRes();
  await centralApi(createReq({
    method: 'POST',
    url: '/api?action=login',
    body: { user: 'karina', pin: 'test-karina-pin' }
  }), karinaLogin);
  const karinaCookie = karinaLogin.headers['set-cookie'].split(';')[0];

  const karinaSummary = createRes();
  await centralApi(createReq({
    method: 'GET',
    url: '/api?action=summary&month=2026-08',
    cookie: karinaCookie
  }), karinaSummary);
  assert.equal(json(karinaSummary).budgetCents, 600000);
  assert.equal(json(karinaSummary).remainingCents, 599000);

  const repeatedRead = createRes();
  await centralApi(createReq({
    method: 'GET',
    url: '/api?action=summary&month=2026-08',
    cookie: idoCookie
  }), repeatedRead);
  assert.equal(json(repeatedRead).budget.amountCents, 600000);
});
