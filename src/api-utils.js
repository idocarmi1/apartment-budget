const { createSupabaseRepository } = require('./supabase-repository');
const { requireUser } = require('./auth');

let cachedRepository;

function getRepository() {
  if (!cachedRepository) cachedRepository = createSupabaseRepository();
  return cachedRepository;
}

function setRepositoryForTests(repo) {
  cachedRepository = repo;
}

function sendJson(res, status, data, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function sendMethodNotAllowed(res) {
  sendJson(res, 405, { error: 'שיטה לא נתמכת' });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return Array.isArray(req.query[key]) ? req.query[key][0] : req.query[key];
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get(key);
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('מזהה לא תקין');
  return id;
}

function withApi(handler, options = {}) {
  return async function apiHandler(req, res) {
    try {
      const repo = options.repo || getRepository();
      const user = options.auth === false ? null : requireUser(req);
      await handler(req, res, { repo, user, readBody, queryValue, parseId });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message || 'שגיאה לא צפויה' });
    }
  };
}

module.exports = {
  getRepository,
  parseId,
  queryValue,
  readBody,
  sendJson,
  sendMethodNotAllowed,
  setRepositoryForTests,
  withApi
};
