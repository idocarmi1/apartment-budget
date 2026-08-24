const test = require('node:test');
const assert = require('node:assert/strict');
const { getSupabaseSecretKey } = require('../src/supabase-repository');

function withEnv(values, fn) {
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if ('SUPABASE_SECRET_KEY' in values) process.env.SUPABASE_SECRET_KEY = values.SUPABASE_SECRET_KEY;
  else delete process.env.SUPABASE_SECRET_KEY;
  if ('SUPABASE_SERVICE_ROLE_KEY' in values) process.env.SUPABASE_SERVICE_ROLE_KEY = values.SUPABASE_SERVICE_ROLE_KEY;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    fn();
  } finally {
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecret;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
}

test('SUPABASE_SECRET_KEY מקבל קדימות על השם הישן', () => {
  withEnv({
    SUPABASE_SECRET_KEY: 'test-new-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'test-old-secret'
  }, () => {
    assert.equal(getSupabaseSecretKey(), 'test-new-secret');
  });
});

test('SUPABASE_SERVICE_ROLE_KEY נשאר נתמך לצורך תאימות', () => {
  withEnv({
    SUPABASE_SERVICE_ROLE_KEY: 'test-old-secret'
  }, () => {
    assert.equal(getSupabaseSecretKey(), 'test-old-secret');
  });
});
