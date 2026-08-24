const test = require('node:test');
const assert = require('node:assert/strict');
const { centralApi } = require('../src/central-api');

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
