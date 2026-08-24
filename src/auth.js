const signature = require('cookie-signature');
const { USERS } = require('./constants');

const COOKIE_NAME = 'home_budget_session';

function getCookieSecret() {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) throw new Error('COOKIE_SECRET חסר במשתני הסביבה');
  return secret;
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function signSessionCookie(user) {
  const secret = getCookieSecret();
  const signed = `s:${signature.sign(user, secret)}`;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(signed)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=5184000'
  ];
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const value = cookies[COOKIE_NAME];
  if (!value || !value.startsWith('s:')) return null;
  const unsigned = signature.unsign(value.slice(2), getCookieSecret());
  return USERS.includes(unsigned) ? unsigned : null;
}

function requireUser(req) {
  const user = readSessionUser(req);
  if (!user) {
    const error = new Error('נדרשת התחברות');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  readSessionUser,
  requireUser,
  signSessionCookie
};
