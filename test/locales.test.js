const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'locales');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function keys(obj, prefix, out) {
  prefix = prefix || '';
  out = out || [];
  for (const k of Object.keys(obj)) {
    if (k === 'meta') continue;
    const val = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (val && typeof val === 'object') keys(val, key, out);
    else out.push(key);
  }
  return out;
}

const reference = 'en-GB.json';
const referenceKeys = keys(load(reference)).sort();

test('at least one locale exists', () => {
  assert.ok(files.length > 0);
});

test('every locale is valid JSON with a meta.code and meta.name', () => {
  for (const f of files) {
    const data = load(f);
    assert.ok(data.meta, f + ' is missing "meta"');
    assert.ok(data.meta.code, f + ' is missing meta.code');
    assert.ok(data.meta.name, f + ' is missing meta.name');
  }
});

test('every locale has exactly the same keys as ' + reference, () => {
  for (const f of files) {
    assert.deepStrictEqual(keys(load(f)).sort(), referenceKeys, f + ' keys differ from ' + reference);
  }
});
