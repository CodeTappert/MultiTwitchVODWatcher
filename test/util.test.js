const test = require('node:test');
const assert = require('node:assert');
const util = require('../lib/util.js');

test('parseUrls splits glued URLs and dedupes', () => {
  const input = 'https://www.twitch.tv/videos/1https://www.twitch.tv/videos/2\nhttps://www.twitch.tv/videos/1';
  assert.deepStrictEqual(util.parseUrls(input), [
    'https://www.twitch.tv/videos/1',
    'https://www.twitch.tv/videos/2',
  ]);
});

test('parseUrls strips trailing punctuation', () => {
  assert.deepStrictEqual(util.parseUrls('see https://a.test/x, and (https://b.test/y)'), [
    'https://a.test/x',
    'https://b.test/y',
  ]);
});

test('parseUrls ignores non-urls', () => {
  assert.deepStrictEqual(util.parseUrls('hello world'), []);
});

test('parseOffset handles mm:ss, h:mm:ss, sign and plain seconds', () => {
  assert.strictEqual(util.parseOffset('1:30'), 90);
  assert.strictEqual(util.parseOffset('-1:30'), -90);
  assert.strictEqual(util.parseOffset('+0:05'), 5);
  assert.strictEqual(util.parseOffset('90'), 90);
  assert.strictEqual(util.parseOffset('1:01:01'), 3661);
  assert.strictEqual(util.parseOffset(''), 0);
});

test('formatOffset round-trips and renders sign/units', () => {
  assert.strictEqual(util.formatOffset(0), '+0:00');
  assert.strictEqual(util.formatOffset(90), '+1:30');
  assert.strictEqual(util.formatOffset(-5), '-0:05');
  assert.strictEqual(util.formatOffset(3661), '+1:01:01');
  assert.strictEqual(util.parseOffset(util.formatOffset(3661)), 3661);
});

test('fmtTime formats clock time and clamps negatives', () => {
  assert.strictEqual(util.fmtTime(0), '0:00');
  assert.strictEqual(util.fmtTime(90), '1:30');
  assert.strictEqual(util.fmtTime(3661), '1:01:01');
  assert.strictEqual(util.fmtTime(-10), '0:00');
});

test('flatten turns nested objects into dot keys', () => {
  assert.deepStrictEqual(util.flatten({ a: { b: 'x' }, c: 'y' }), { 'a.b': 'x', c: 'y' });
});

test('pickLang matches exact, base and falls back to english', () => {
  const list = [
    { id: 'en-GB', code: 'en-GB', name: 'English' },
    { id: 'de-DE', code: 'de-DE', name: 'Deutsch' },
  ];
  assert.strictEqual(util.pickLang('de-DE', list), 'de-DE');
  assert.strictEqual(util.pickLang('de', list), 'de-DE');
  assert.strictEqual(util.pickLang('fr-FR', list), 'en-GB');
});
