const test = require('node:test');
const assert = require('node:assert/strict');
const { login, session } = require('../src/api-handlers');

process.env.COOKIE_SECRET = 'test-secret';
process.env.IDO_PIN = 'test-ido-pin';
process.env.KARINA_PIN = 'test-karina-pin';

function createReq({ method = 'GET', body, cookie } = {}) {
  return {
    method,
    body,
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: `test-${Math.random()}` },
    url: '/api/test',
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

test('הרשאות כניסה לפי PIN וקוקי חתום', async () => {
  const badRes = createRes();
  await login(createReq({ method: 'POST', body: { user: 'ido', pin: 'wrong' } }), badRes);
  assert.equal(badRes.statusCode, 401);

  const goodRes = createRes();
  await login(createReq({ method: 'POST', body: { user: 'ido', pin: 'test-ido-pin' } }), goodRes);
  assert.equal(goodRes.statusCode, 200);
  assert.match(goodRes.headers['set-cookie'], /HttpOnly/);

  const cookie = goodRes.headers['set-cookie'].split(';')[0];
  const sessionRes = createRes();
  await session(createReq({ cookie }), sessionRes);
  assert.equal(json(sessionRes).authenticated, true);
  assert.equal(json(sessionRes).user, 'ido');
});
