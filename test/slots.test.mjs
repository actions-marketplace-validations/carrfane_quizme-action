import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANGLES,
  planSlots,
  cleanDescription,
  normaliseAngle,
  MAX_DESCRIPTION_CHARS,
  MIN_INTENT_CHARS,
} from '../scripts/lib/slots.mjs';

test('planSlots leads with intent when the PR states one', () => {
  assert.deepEqual(planSlots(3, true), ['intent', 'behavior', 'side_effects']);
  assert.deepEqual(planSlots(4, true), ['intent', 'behavior', 'side_effects', 'rationale']);
  assert.deepEqual(planSlots(6, true), [
    'intent', 'behavior', 'side_effects', 'rationale', 'intent', 'behavior',
  ]);
});

test('planSlots never asks about intent when there is none to check against', () => {
  assert.deepEqual(planSlots(3, false), ['rationale', 'behavior', 'side_effects']);
  assert.deepEqual(planSlots(5, false), [
    'rationale', 'behavior', 'side_effects', 'rationale', 'behavior',
  ]);
  for (let n = 1; n <= 10; n += 1) {
    assert.ok(!planSlots(n, false).includes('intent'), `count ${n}`);
  }
});

test('planSlots returns exactly count known angles', () => {
  for (let n = 1; n <= 10; n += 1) {
    for (const hasIntent of [true, false]) {
      const slots = planSlots(n, hasIntent);
      assert.equal(slots.length, n);
      assert.ok(slots.every((s) => Object.hasOwn(ANGLES, s)));
    }
  }
});

test('cleanDescription strips template comments and blank runs', () => {
  const body = '<!-- Describe your change -->\n\nAdds retries\n\n\n\nto the uploader.\n<!--\nmulti\nline\n-->';
  assert.equal(cleanDescription(body).text, 'Adds retries\n\nto the uploader.');
});

test('cleanDescription treats a missing or comment-only body as no intent', () => {
  for (const body of [null, undefined, '', '   ', '<!-- template -->']) {
    assert.deepEqual(cleanDescription(body), { text: '', hasIntent: false });
  }
});

test('cleanDescription needs MIN_INTENT_CHARS of real text to count as intent', () => {
  assert.equal(cleanDescription('x'.repeat(MIN_INTENT_CHARS - 1)).hasIntent, false);
  assert.equal(cleanDescription('x'.repeat(MIN_INTENT_CHARS)).hasIntent, true);
  // Short text is still passed through: it is useful context for rationale.
  assert.equal(cleanDescription('Fix SSO loop').text, 'Fix SSO loop');
});

test('cleanDescription caps very long bodies and says so', () => {
  const { text, hasIntent } = cleanDescription('y'.repeat(MAX_DESCRIPTION_CHARS + 500));
  assert.equal(hasIntent, true);
  assert.ok(text.startsWith('y'.repeat(MAX_DESCRIPTION_CHARS)));
  assert.ok(text.endsWith('[... description truncated ...]'));
  assert.ok(text.length < MAX_DESCRIPTION_CHARS + 50);
});

test('normaliseAngle accepts the spellings a model is likely to use', () => {
  assert.equal(normaliseAngle('Side effects'), 'side_effects');
  assert.equal(normaliseAngle(' side-effects '), 'side_effects');
  assert.equal(normaliseAngle('BEHAVIOR'), 'behavior');
  assert.equal(normaliseAngle('behaviour'), 'behavior');
  assert.equal(normaliseAngle(42), '');
  assert.equal(normaliseAngle(undefined), '');
});
