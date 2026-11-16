import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, plain } from '../src/ui/tips.js';
import { TIPS } from '../src/engine/explain.js';

const btn = (id, label) => `<button type="button" class="tip" data-tip="${id}">${label}</button>`;

test('fmt escapes text then links known ids', () => {
  assert.equal(fmt('A<K beats {{IP|position}}'), `A&lt;K beats ${btn('position', 'IP')}`);
  assert.equal(fmt('{{a"b|position}}'), btn('position', 'a&quot;b'));
});

test('fmt renders unknown ids as plain label text', () => {
  assert.equal(fmt('{{x<y|nope}} ok'), 'x&lt;y ok');
});

test('fmt leaves malformed tokens as escaped text', () => {
  assert.equal(fmt('{{IP}}'), '{{IP}}');
  assert.equal(fmt('{{a|b|c}}'), '{{a|b|c}}');
  assert.equal(fmt(5), '5');
});

test('plain strips tokens to labels without escaping', () => {
  assert.equal(plain('{{IP|position}} acts last'), 'IP acts last');
  assert.equal(plain('{{x|nope}} <b>'), 'x <b>');
});

test('TIPS is id -> non-empty string and has position', () => {
  for (const [id, text] of Object.entries(TIPS)) assert.ok(typeof text === 'string' && text.length > 0, id);
  assert.ok(TIPS.position);
});
