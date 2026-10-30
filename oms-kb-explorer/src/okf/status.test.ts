import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusBadge, trustBadge } from './status.ts';

test('maps OKF and legacy status values to badges', () => {
  for (const s of ['stable', 'Stable', 'Active', 'Complete', 'Implementation Complete']) {
    assert.equal(statusBadge(s), 'stable', s);
  }
  for (const s of ['draft', 'Draft', 'Draft for discussion']) assert.equal(statusBadge(s), 'draft', s);
  assert.equal(statusBadge('deprecated'), 'deprecated');
  for (const s of ['', undefined, null, 'Proposed']) assert.equal(statusBadge(s), 'unknown', String(s));
});

test('maps trust tiers to labels and tones', () => {
  assert.deepEqual(trustBadge('human-reviewed'), { label: 'Human-reviewed', tone: 'good' });
  assert.deepEqual(trustBadge('machine-confirmed'), { label: 'Machine-confirmed', tone: 'neutral' });
  assert.deepEqual(trustBadge('unverified'), { label: 'Unverified', tone: 'warning' });
  assert.equal(trustBadge(undefined), null);
});
