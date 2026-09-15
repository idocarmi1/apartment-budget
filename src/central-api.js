const handlers = require('./api-handlers');
const { sendJson } = require('./api-utils');

const ROUTES = {
  'GET session': handlers.session,
  'POST login': handlers.login,
  'POST logout': handlers.logout,
  'GET parse': handlers.parse,
  'GET categories': handlers.categories,
  'GET summary': handlers.summary,
  'GET history': handlers.history,
  'PUT budget': handlers.budget,
  'POST expenses': handlers.expenses,
  'PUT expense': handlers.expenseById,
  'DELETE expense': handlers.expenseById,
  'POST undo-last': handlers.undoLastExpense,
  'GET backup': handlers.backup,
  'POST restore': handlers.restore
};

function normalizeQuery(req) {
  const url = new URL(req.url || '/api', 'http://localhost');
  const query = { ...(req.query || {}) };
  for (const [key, value] of url.searchParams.entries()) {
    if (query[key] === undefined) query[key] = value;
  }
  req.query = query;
  return query;
}

async function centralApi(req, res) {
  const query = normalizeQuery(req);
  const action = query.action || '';
  const route = ROUTES[`${req.method} ${action}`];
  if (!route) {
    return sendJson(res, 404, { error: 'הפעולה לא נמצאה' });
  }
  return route(req, res);
}

module.exports = {
  centralApi,
  normalizeQuery
};
