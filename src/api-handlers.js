const { clearSessionCookie, readSessionUser, signSessionCookie } = require('./auth');
const { USER_NAMES, USERS } = require('./constants');
const { parseExpenseImage: parseExpenseImageWithOpenAI } = require('./openai-expense-image');
const { formatMonth, parseAmountToCents, parseQuickExpense } = require('./parser');
const { queryValue, readBody, sendJson, sendMethodNotAllowed, withApi } = require('./api-utils');

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;

function buildPins() {
  return {
    ido: process.env.IDO_PIN,
    karina: process.env.KARINA_PIN
  };
}

const session = async (req, res) => {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);
  const user = readSessionUser(req);
  if (!USERS.includes(user)) return sendJson(res, 200, { authenticated: false, users: USER_NAMES });
  return sendJson(res, 200, { authenticated: true, user, name: USER_NAMES[user], users: USER_NAMES });
};

const login = async (req, res) => {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  const key = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local';
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (attempt.resetAt <= now) {
    attempt.count = 0;
    attempt.resetAt = now + LOGIN_WINDOW_MS;
  }
  if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
    return sendJson(res, 429, { error: 'יותר מדי ניסיונות התחברות. נסו שוב בעוד כמה דקות.' });
  }
  const body = await readBody(req);
  const pins = buildPins();
  const { user, pin } = body || {};
  if (!USERS.includes(user) || !pins[user] || String(pin || '') !== String(pins[user])) {
    attempt.count += 1;
    loginAttempts.set(key, attempt);
    return sendJson(res, 401, { error: 'שם או PIN לא נכונים' });
  }
  loginAttempts.delete(key);
  return sendJson(res, 200, { ok: true, user, name: USER_NAMES[user] }, {
    'Set-Cookie': signSessionCookie(user)
  });
};

const logout = async (req, res) => {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
};

const parse = withApi(async (req, res, ctx) => {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);
  return sendJson(res, 200, parseQuickExpense(ctx.queryValue(req, 'text') || ''));
});

const parseExpenseImage = withApi(async (req, res, { repo, user, readBody: read }) => {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  const body = await read(req);
  let imageDataUrl = body?.imageDataUrl || '';
  try {
    const categories = await repo.listCategories();
    const result = await parseExpenseImageWithOpenAI({ imageDataUrl, categories });
    return sendJson(res, 200, {
      ok: true,
      model: result.model,
      paidBy: user,
      transactions: result.transactions.map((transaction) => ({
        ...transaction,
        paidBy: user
      })),
      warning: result.warning || ''
    });
  } finally {
    imageDataUrl = '';
    if (body && typeof body === 'object') body.imageDataUrl = undefined;
  }
});

const categories = withApi(async (req, res, { repo }) => {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);
  return sendJson(res, 200, { categories: await repo.listCategories() });
});

const summary = withApi(async (req, res, { repo }) => {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);
  const month = queryValue(req, 'month') || formatMonth();
  const data = await repo.getSummary(month, {
    category: queryValue(req, 'category') || '',
    paidBy: queryValue(req, 'paidBy') || '',
    q: queryValue(req, 'q') || ''
  });
  return sendJson(res, 200, data);
});

const history = withApi(async (req, res, { repo }) => {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);
  return sendJson(res, 200, { months: await repo.getHistory() });
});

const budget = withApi(async (req, res, { repo, readBody: read }) => {
  if (req.method !== 'PUT') return sendMethodNotAllowed(res);
  const body = await read(req);
  const month = queryValue(req, 'month') || body.month;
  if (!month) throw new Error('חודש לא תקין');
  const amountCents = body.amountCents ?? parseAmountToCents(body.amount);
  return sendJson(res, 200, { budget: await repo.setBudget(month, amountCents) });
});

const expenses = withApi(async (req, res, { repo, user, readBody: read }) => {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  const body = await read(req);
  const amountCents = body.amountCents ?? parseAmountToCents(body.amount);
  const expense = await repo.addExpense({ ...body, amountCents, paidBy: body.paidBy || user }, user);
  return sendJson(res, 201, { expense });
});

const expenseById = withApi(async (req, res, { repo, parseId: parse }) => {
  const id = parse(req.query?.id || new URL(req.url, 'http://localhost').pathname.split('/').pop());
  if (req.method === 'PUT') {
    const body = await readBody(req);
    const amountCents = body.amountCents ?? (body.amount ? parseAmountToCents(body.amount) : undefined);
    return sendJson(res, 200, { expense: await repo.updateExpense(id, { ...body, amountCents }) });
  }
  if (req.method === 'DELETE') {
    return sendJson(res, 200, { deleted: await repo.deleteExpense(id) });
  }
  return sendMethodNotAllowed(res);
});

const undoLastExpense = withApi(async (req, res, { repo, user }) => {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  return sendJson(res, 200, { deleted: await repo.undoLastExpense(user) });
});

const backup = withApi(async (req, res, { repo }) => {
  if (req.method !== 'GET') return sendMethodNotAllowed(res);
  return sendJson(res, 200, await repo.exportBackup(), {
    'Content-Disposition': 'attachment; filename="home-budget-backup.json"'
  });
});

const restore = withApi(async (req, res, { repo, readBody: read }) => {
  if (req.method !== 'POST') return sendMethodNotAllowed(res);
  const body = await read(req);
  return sendJson(res, 200, { ok: true, restored: await repo.restoreBackup(body) });
});

module.exports = {
  backup,
  budget,
  categories,
  expenseById,
  expenses,
  history,
  login,
  logout,
  parse,
  parseExpenseImage,
  restore,
  session,
  summary,
  undoLastExpense
};
