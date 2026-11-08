import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComposition } from '../src/markdown/composition.mjs';
import {
  ARROW_HEAD_RATIO,
  ARROW_SHAFT_RATIO,
  ARROW_THICKNESS_RATIO,
  arrowGeometry,
  arrowThickness,
  betweenBoxes,
  besideBox,
  besideSpan,
  crossGeometry,
} from '../src/composition/geometry';

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
    '@arrow id=line from=a to=b side=top direction=up',
    '@arrow id=line side=right',
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
  assert.equal(from.y, 70);
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

test('a pointed arrow stays on the source center when that center still fits', () => {
  const node = { x: 0, y: 80, width: 100, height: 40 };
  const box = { x: 200, y: 0, width: 100, height: 110 };
  const [from, to] = betweenBoxes(node, box);
  assert.equal(from.y, 100);
  assert.equal(to.y, 100);
});

test('aligned figures of different heights keep the source center', () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  const b = { x: 200, y: 0, width: 100, height: 140 };
  const [from, to] = betweenBoxes(a, b);
  assert.equal(from.y, 50);
  assert.equal(to.y, 50);
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

test('from/to with side spans a layer instead of a single node', () => {
  const scene = parseComposition(
    '@part a\nA\n@endpart\n@part b\nB\n@endpart\n@arrow id=depth from=a to=b side=top',
  );
  const mark = scene.annotations[0];
  assert.equal(mark.kind, 'arrow');
  if (mark.kind !== 'arrow') return;
  assert.equal('from' in mark && mark.from, 'a');
  assert.equal('to' in mark && mark.to, 'b');
  assert.equal('side' in mark && mark.side, 'top');
  assert.equal('direction' in mark && mark.direction, 'right');
  assert.equal('target' in mark, false);
});

test('span axis arrows cover the layer between two nodes and sit just outside obstacles', () => {
  const issue = { x: 0, y: 80, width: 100, height: 40 };
  const branchA = { x: 140, y: 40, width: 100, height: 40 };
  const branchB = { x: 140, y: 100, width: 100, height: 40 };
  const leafA1 = { x: 280, y: 0, width: 100, height: 40 };
  const leafA2 = { x: 280, y: 50, width: 100, height: 40 };
  const leafA3 = { x: 280, y: 100, width: 100, height: 40 };
  const obstacles = [issue, branchA, branchB, leafA1, leafA2, leafA3];
  assert.deepEqual(besideSpan(issue, branchA, 'top', 'right', 64, 20, obstacles), [
    { x: 0, y: -12 },
    { x: 240, y: -12 },
  ]);
  assert.deepEqual(besideSpan(branchA, leafA1, 'top', 'right', 64, 20, obstacles), [
    { x: 140, y: -52 },
    { x: 380, y: -52 },
  ]);
  assert.deepEqual(besideSpan(leafA1, leafA3, 'right', 'down', 64, 20, obstacles), [
    { x: 432, y: 0 },
    { x: 432, y: 140 },
  ]);
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

test('bidirectional annotations parse for connections and axes, preserving the one-way default', () => {
  const body = '@part a\nA\n@endpart\n@part b\nB\n@endpart\n';
  for (const route of ['from=a to=b', 'target=a side=right', 'from=a to=b side=right']) {
    const scene = parseComposition(body + `@arrow id=trade ${route} arrows=both`);
    assert.equal(scene.annotations[0].kind, 'arrow');
    if (scene.annotations[0].kind === 'arrow') assert.equal(scene.annotations[0].arrows, 'both');
  }
  const original = parseComposition(body + '@arrow id=go from=a to=b').annotations[0];
  if (original.kind === 'arrow') assert.equal(original.arrows, 'end');
  assert.throws(() => parseComposition(body + '@arrow id=go from=a to=b arrows=invalid'), /arrows/);
});

test('bidirectional arrowheads reach both endpoints with a centered label in every orientation', () => {
  for (const to of [
    { x: 136, y: 0 },
    { x: -136, y: 0 },
    { x: 0, y: 136 },
    { x: 0, y: -136 },
    { x: 100, y: 100 },
  ]) {
    const from = { x: 0, y: 0 };
    const both = arrowGeometry(from, to, 72, 'both');
    const single = arrowGeometry(from, to, 72);
    const points = [...both.path.matchAll(/[ML] ([\d.e+-]+) ([\d.e+-]+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
    assert.deepEqual(points[0], from);
    assert.ok(points.some((p) => Math.hypot(p.x - to.x, p.y - to.y) < 1e-6));
    assert.ok(Math.abs(both.label.x - to.x / 2) < 1e-6);
    assert.ok(Math.abs(both.label.y - to.y / 2) < 1e-6);
    assert.ok(both.length > 0 && both.length < single.length);
    assert.equal(both.path.includes('NaN'), false);
  }
  const short = arrowGeometry({ x: 0, y: 0 }, { x: 10, y: 0 }, 72, 'both');
  assert.ok(short.length > 0);
});

function pathPoints(path: string) {
  return [...path.matchAll(/[ML] ([\d.e+-]+) ([\d.e+-]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function horizontalMetrics(
  from: { x: number; y: number },
  to: { x: number; y: number },
  path: string,
) {
  const points = pathPoints(path);
  const tip = points.find(
    (point) => Math.abs(point.x - to.x) < 1e-6 && Math.abs(point.y - to.y) < 1e-6,
  );
  assert.ok(tip, 'missing tip');
  const flares = points.filter((point) => Math.abs(point.x - to.x) > 1);
  const headBack = Math.max(...flares.map((point) => point.x));
  const half = Math.max(...points.map((point) => Math.abs(point.y - from.y)));
  const shaft = Math.min(
    ...points
      .filter((point) => Math.abs(point.x - from.x) < 1e-6)
      .map((point) => Math.abs(point.y - from.y)),
  );
  return {
    thickness: half * 2,
    head: Math.abs(to.x - from.x) - Math.abs(headBack - from.x),
    half,
    shaft,
  };
}

test('short arrows keep the long block-arrow proportions instead of becoming a bowtie', () => {
  const from = { x: 0, y: 0 };
  const long = arrowGeometry(from, { x: 240, y: 0 }, 88);
  const short = arrowGeometry(from, { x: 80, y: 0 }, 88);
  const both = arrowGeometry(from, { x: 80, y: 0 }, 88, 'both');
  const capped = arrowGeometry(from, { x: 400, y: 0 }, 64);
  assert.ok(Math.abs(long.box.height - 88) < 1e-6);
  assert.ok(Math.abs(capped.box.height - 64) < 1e-6);
  assert.ok(Math.abs(short.box.height / short.box.width - ARROW_THICKNESS_RATIO) < 0.02);
  assert.ok(Math.abs(both.box.height / both.box.width - ARROW_THICKNESS_RATIO) < 0.02);
  assert.ok(both.length > both.box.height * 0.35);
  const longParts = horizontalMetrics(from, { x: 240, y: 0 }, long.path);
  const shortParts = horizontalMetrics(from, { x: 80, y: 0 }, short.path);
  assert.ok(Math.abs(longParts.head / longParts.thickness - ARROW_HEAD_RATIO) < 0.02);
  assert.ok(Math.abs(shortParts.head / shortParts.thickness - ARROW_HEAD_RATIO) < 0.02);
  assert.ok(Math.abs(longParts.shaft / longParts.half - ARROW_SHAFT_RATIO) < 0.02);
  assert.ok(Math.abs(shortParts.shaft / shortParts.half - ARROW_SHAFT_RATIO) < 0.02);
  assert.equal(arrowThickness(80, 88), 80 * ARROW_THICKNESS_RATIO);
  assert.equal(arrowThickness(400, 64), 64);
});
