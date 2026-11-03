import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComposition } from '../src/markdown/composition.mjs';
import { arrowGeometry, betweenBoxes, besideBox, crossGeometry } from '../src/composition/geometry';

test('composition retains nested Markdown, fenced markers and source offsets', () => {
  const scene = parseComposition(
    '@part before width=560\n@box\nHello\n@endbox\n\n```\n@endpart\n@cross target=literal\n```\n@endpart\n@arrow id=time from=before to=after label="時間"\n@part after\n@compose\n@part inner\nText\n@endpart\n@endcompose\n@endpart\n@cross target=time',
  );
  assert.equal(scene.parts.length, 2);
  assert.equal(scene.parts[0].line, 1);
  assert.equal(scene.parts[0].width, 560);
  assert.match(scene.parts[0].source, /@cross target=literal/);
  assert.match(scene.parts[1].source, /@part inner/);
  assert.equal(scene.annotations.length, 2);
});

test('composition rejects ambiguous identifiers, incomplete connections and invalid geometry', () => {
  const body = '@part a\nText\n@endpart\n';
  for (const extra of [
    '@part a\nOther\n@endpart',
    '@arrow id=a from=a to=b',
    '@arrow id=line from=a',
    '@arrow id=line target=a from=a to=b',
    '@arrow id=line target=a side=top direction=up',
    '@cross target=a size=NaN',
    '@cross target=a scale=-1',
  ]) {
    assert.throws(() => parseComposition(body + extra));
  }
  assert.throws(() => parseComposition('@part a\nMissing end'), /@endpart/);
});

test('large connecting arrows share an axis when box projections overlap', () => {
  const a = { x: 10, y: 20, width: 200, height: 100 };
  const b = { x: 350, y: 50, width: 180, height: 180 };
  const [from, to] = betweenBoxes(a, b);
  assert.equal(from.y, to.y);
  assert.equal(from.x, 222);
  assert.equal(to.x, 338);
  const reverse = betweenBoxes(b, a);
  assert.deepEqual(reverse, [to, from]);
  const arrow = arrowGeometry(from, to, 64);
  assert.ok(arrow.path.endsWith(' Z'));
  assert.equal(arrow.box.x, from.x);
  assert.equal(arrow.box.width, to.x - from.x);
  assert.throws(() => arrowGeometry(from, from, 64), /余白/);
});

test('axis arrows and crosses follow target geometry in every direction', () => {
  const box = { x: 100, y: 100, width: 240, height: 140 };
  const right = besideBox(box, 'top', 'right', 64, 20);
  assert.deepEqual(right, [
    { x: 100, y: 48 },
    { x: 340, y: 48 },
  ]);
  assert.deepEqual(besideBox(box, 'top', 'left', 64, 20), [right[1], right[0]]);
  const down = besideBox(box, 'right', 'down', 64, 20);
  assert.deepEqual(down, [
    { x: 392, y: 100 },
    { x: 392, y: 240 },
  ]);
  assert.deepEqual(besideBox(box, 'right', 'up', 64, 20), [down[1], down[0]]);
  assert.equal(arrowGeometry(...down, 64).vertical, true);
  assert.ok(crossGeometry(box).stroke >= 12);
});

test('overlapping targets report insufficient space instead of reversing the arrow', () => {
  assert.throws(
    () =>
      betweenBoxes(
        { x: 0, y: 0, width: 200, height: 100 },
        { x: 100, y: 0, width: 200, height: 100 },
      ),
    /余白/,
  );
});

test('a tall explanation box uses the available horizontal corridor', () => {
  const [from, to] = betweenBoxes(
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 300, y: 0, width: 100, height: 1000 },
  );
  assert.deepEqual(from, { x: 112, y: 50 });
  assert.deepEqual(to, { x: 288, y: 50 });
});
