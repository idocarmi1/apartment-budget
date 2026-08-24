const test = require('node:test');
const assert = require('node:assert/strict');
const { getSupabaseSecretKey, getSupabaseUrl, monthDateRange } = require('../src/supabase-repository');

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_URL_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_URL_SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY'
];

function withEnv(values, fn) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (key in values) process.env[key] = values[key];
    else delete process.env[key];
  }

  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('SUPABASE_URL מקבל קדימות על שם ה-URL שנוצר על ידי Vercel', () => {
  withEnv({
    SUPABASE_URL: 'test-standard-url',
    SUPABASE_URL_SUPABASE_URL: 'test-vercel-url'
  }, () => {
    assert.equal(getSupabaseUrl(), 'test-standard-url');
  });
});

test('SUPABASE_URL_SUPABASE_URL נתמך כ-fallback לכתובת Supabase', () => {
  withEnv({
    SUPABASE_URL_SUPABASE_URL: 'test-vercel-url'
  }, () => {
    assert.equal(getSupabaseUrl(), 'test-vercel-url');
  });
});

test('SUPABASE_SECRET_KEY מקבל קדימות על השם הישן', () => {
  withEnv({
    SUPABASE_SECRET_KEY: 'test-new-secret',
    SUPABASE_URL_SUPABASE_SECRET_KEY: 'test-vercel-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'test-old-secret'
  }, () => {
    assert.equal(getSupabaseSecretKey(), 'test-new-secret');
  });
});

test('SUPABASE_URL_SUPABASE_SECRET_KEY מקבל קדימות לפני service role הישן', () => {
  withEnv({
    SUPABASE_URL_SUPABASE_SECRET_KEY: 'test-vercel-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'test-old-secret',
    SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY: 'test-vercel-old-secret'
  }, () => {
    assert.equal(getSupabaseSecretKey(), 'test-vercel-secret');
  });
});

test('SUPABASE_SERVICE_ROLE_KEY נשאר נתמך לפני שם service role של Vercel', () => {
  withEnv({
    SUPABASE_SERVICE_ROLE_KEY: 'test-old-secret',
    SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY: 'test-vercel-old-secret'
  }, () => {
    assert.equal(getSupabaseSecretKey(), 'test-old-secret');
  });
});

test('SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY נתמך כ-fallback אחרון', () => {
  withEnv({
    SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY: 'test-vercel-old-secret'
  }, () => {
    assert.equal(getSupabaseSecretKey(), 'test-vercel-old-secret');
  });
});

test('טווח תאריכים חודשי מתאים לשאילתת אינדקס ישיר על expense_date', () => {
  assert.deepEqual(monthDateRange('2026-08'), {
    start: '2026-08-01',
    end: '2026-09-01'
  });
  assert.deepEqual(monthDateRange('2026-12'), {
    start: '2026-12-01',
    end: '2027-01-01'
  });
});
