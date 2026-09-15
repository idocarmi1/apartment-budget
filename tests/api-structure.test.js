const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('תחת api נשאר קובץ פונקציה אחד בלבד', () => {
  const apiDir = path.resolve(__dirname, '..', 'api');
  const files = fs.readdirSync(apiDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  assert.deepEqual(files, ['index.js']);
});
