import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeHitsNode } from '../src/flow/route.ts';

test('edge collision detection reads the same fractional and exponential coordinates as SVG', () => {
  const box = { x: 80, y: 45, width: 40, height: 10 };
  for (const path of [
    'M 0.0000001 50 L 200 50',
    'M 1e-7 5e1 L 2e2 5e1',
    'M +.0000001 +50 L +200 +50',
  ])
    assert.equal(edgeHitsNode(path, box), true, path);
  assert.equal(edgeHitsNode('M 1e-7 5e1 L 2e2 5e1', { ...box, y: 70 }), false);
});

test('collision detection includes touching a padded corner or travelling along its boundary', () => {
  const box = { x: 41, y: 41, width: 18, height: 18 };
  assert.equal(edgeHitsNode('M 0 40 L 100 40', box), true);
  assert.equal(edgeHitsNode('M 0 80 L 80 0', box), true);
  assert.equal(edgeHitsNode('M 0 39 L 100 39', box), false);
});
