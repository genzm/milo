import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { layoutCanvas, parseCanvas } from '../src/canvas.ts';
import { layoutDiagram, parseDiagram, resolvedLinks } from '../src/diagram.ts';
import { layoutFlowFromCanvas } from '../src/flow/layout.ts';
import {
  parseComposition,
  type ArrowAnnotation,
  type CompositionScene,
} from '../src/markdown/composition.mjs';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';
import type { DiagramLayout, DiagramPlacedItem } from '../src/diagram.ts';

const FIXTURE = readFileSync(new URL('./fixtures/diagram-patterns.md', import.meta.url), 'utf8');

type PatternCase = {
  pattern: string;
  allow: Set<string>;
  slide: string;
  diagrams: Array<{ options: string; body: string }>;
  canvases: Array<{ options: string; body: string }>;
  composes: Array<{ options: string; body: string }>;
};

function extractBlocks(slide: string, open: string, close: string) {
  const pattern = new RegExp(`@${open}(?:\\s+([^\\n]*))?\\n([\\s\\S]*?)@end${close}`, 'g');
  return [...slide.matchAll(pattern)].map((match) => ({
    options: (match[1] || '').trim(),
    body: match[2],
  }));
}

function fixtureSlides(source: string) {
  const match = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(source);
  return (match ? match[1] : source).split(/\n---\n/);
}

function loadPatterns(): PatternCase[] {
  const slides = fixtureSlides(FIXTURE);
  return slides.flatMap((slide: string) => {
    const header = /<!--\s*pattern:\s*([a-z0-9-]+)(?:\s+allow=([A-Z_,]+))?\s*-->/.exec(slide);
    if (!header) return [];
    return [
      {
        pattern: header[1],
        allow: new Set((header[2] || '').split(',').filter(Boolean)),
        slide,
        diagrams: extractBlocks(slide, 'diagram', 'diagram'),
        canvases: extractBlocks(slide, 'canvas', 'canvas'),
        composes: extractBlocks(slide, 'compose', 'compose'),
      },
    ];
  });
}

function cases(): PatternCase[] {
  return loadPatterns();
}

function pattern(id: string) {
  const found = cases().find((item) => item.pattern === id);
  assert.ok(found, `missing pattern ${id}`);
  return found;
}

function firstDiagram(id: string) {
  const item = pattern(id);
  const block = item.diagrams[0];
  assert.ok(block, `pattern ${id} has no diagram`);
  const scene = parseDiagram(block.body, block.options);
  return { scene, layout: layoutDiagram(scene) };
}

function firstCanvas(id: string) {
  const item = pattern(id);
  const block = item.canvases[0];
  assert.ok(block, `pattern ${id} has no canvas`);
  const scene = parseCanvas(block.body, block.options);
  return { scene, frames: layoutCanvas(scene), layout: layoutFlowFromCanvas(scene) };
}

function firstCompose(id: string): CompositionScene {
  const item = pattern(id);
  const block = item.composes[0];
  assert.ok(block, `pattern ${id} has no compose`);
  return parseComposition(block.body, block.options);
}

function arrow(scene: CompositionScene, id: string): ArrowAnnotation {
  const found = scene.annotations.find((mark) => mark.kind === 'arrow' && mark.id === id);
  assert.ok(found, `missing arrow ${id}`);
  assert.equal(found.kind, 'arrow');
  return found;
}

function centerOf(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function item(layout: DiagramLayout, id: string): DiagramPlacedItem {
  const found = layout.items.find((entry) => entry.id === id);
  assert.ok(found, `missing item ${id}`);
  return found;
}

function assertRegular(items: DiagramPlacedItem[], count: number) {
  assert.equal(items.length, count);
  const points = items.map(centerOf);
  const cx = points.reduce((sum, point) => sum + point.x, 0) / count;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / count;
  const radii = points.map((point) => Math.hypot(point.x - cx, point.y - cy));
  for (const radius of radii) assert.ok(Math.abs(radius - radii[0]) < 1.5);
}

function render(source: string) {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document,
    originalResizeObserver = globalThis.ResizeObserver;
  Object.assign(globalThis, {
    document: window.document,
    ResizeObserver: window.ResizeObserver,
  });
  const root = window.document.createElement('div');
  const rendered = renderSlide(root as unknown as HTMLElement, source, {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    inspect: () => {},
  });
  return {
    root,
    close() {
      rendered.dispose();
      Object.assign(globalThis, {
        document: originalDocument,
        ResizeObserver: originalResizeObserver,
      });
      window.close();
    },
  };
}

test('diagram fixture lists distinct ring, radial, field, free, grid, column and compose patterns', () => {
  const ids = cases().map((item) => item.pattern);
  assert.ok(ids.length >= 40, `expected many patterns, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const needed of [
    'ring-3',
    'ring-notes',
    'radial-spatial',
    'radial-crowd',
    'field-halo',
    'field-cards',
    'free-merge',
    'free-shapes',
    'grid-3',
    'grid-wrap',
    'columns-2',
    'compose-boxes',
    'compose-side',
    'compose-column',
  ])
    assert.ok(ids.includes(needed), needed);
});

test('every diagram pattern lays out without unexpected overflow', () => {
  for (const item of cases()) {
    for (const block of item.diagrams) {
      const layout = layoutDiagram(parseDiagram(block.body, block.options));
      if (item.allow.has('OVERFLOW')) {
        assert.equal(layout.overflow, true, item.pattern);
        continue;
      }
      assert.equal(layout.overflow, false, item.pattern);
    }
    for (const block of item.canvases) {
      const scene = parseCanvas(block.body, block.options);
      const layout = layoutFlowFromCanvas(scene);
      const failed = layout.diagnostics.filter(
        (diag) =>
          diag.code === 'NODE_OVERLAP' ||
          diag.code === 'EDGE_COLLISION' ||
          diag.code === 'FRAME_OVERFLOW' ||
          diag.code === 'TEXT_OVERFLOW',
      );
      assert.equal(
        failed.length,
        0,
        `${item.pattern}: ${failed.map((diag) => diag.code).join('; ')}`,
      );
    }
  }
});

test('diagram pattern slides render without block errors', () => {
  for (const item of cases()) {
    const { root, close } = render(item.slide);
    try {
      assert.equal(root.querySelector('.block-error'), null, item.pattern);
      assert.ok(
        root.querySelector(
          '.milo-canvas, .milo-diagram, .milo-composition, .grid-block, .columns-block',
        ),
        `${item.pattern}: missing figure`,
      );
    } finally {
      close();
    }
  }
});

test('ring-3 is a triangle with the first vertex on top', () => {
  const { layout } = firstDiagram('ring-3');
  assertRegular(layout.items, 3);
  const a = centerOf(item(layout, 'a'));
  const b = centerOf(item(layout, 'b'));
  const c = centerOf(item(layout, 'c'));
  assert.ok(a.y < b.y && a.y < c.y);
  assert.ok(b.x < a.x);
  assert.ok(c.x > a.x);
  assert.equal(layout.links.length, 3);
});

test('ring-4 and ring-6 stay regular polygons', () => {
  assertRegular(firstDiagram('ring-4').layout.items, 4);
  assertRegular(firstDiagram('ring-6').layout.items, 6);
});

test('clockwise ring puts the second vertex on the right', () => {
  const { layout } = firstDiagram('ring-cw');
  const a = centerOf(item(layout, 'a'));
  const b = centerOf(item(layout, 'b'));
  assert.ok(a.y < b.y);
  assert.ok(b.x > a.x);
});

test('start=left puts the first vertex on the left', () => {
  const { layout } = firstDiagram('ring-start-left');
  const a = centerOf(item(layout, 'a'));
  const others = layout.items.filter((entry) => entry.id !== 'a').map(centerOf);
  assert.ok(others.every((point) => a.x < point.x));
});

test('connect=none writes no cycle edges', () => {
  const { scene, layout } = firstDiagram('ring-none');
  assert.equal(resolvedLinks(scene).length, 0);
  assert.equal(layout.links.length, 0);
});

test('outside notes sit away from vertices and keep the ring regular', () => {
  const { layout } = firstDiagram('ring-notes');
  assertRegular(layout.items, 3);
  assert.equal(layout.noteLinks.length, 3);
  for (const entry of layout.items) {
    assert.ok(entry.note);
    const vertex = centerOf(entry);
    const note = centerOf(entry.note);
    assert.ok(Math.hypot(note.x - vertex.x, note.y - vertex.y) > 24);
  }
});

test('leader notes still leave the vertices in a regular triangle', () => {
  const { layout } = firstDiagram('ring-notes-leader');
  assertRegular(layout.items, 3);
  assert.ok(layout.noteLinks.every((link) => link.kind === 'leader'));
});

test('mixed notes omit the blank vertex', () => {
  const { layout } = firstDiagram('ring-mixed-notes');
  assert.ok(item(layout, 'a').note);
  assert.equal(item(layout, 'b').note, undefined);
  assert.ok(item(layout, 'c').note);
  assert.equal(layout.noteLinks.length, 2);
});

test('two rings on one slide keep independent layouts', () => {
  const item = pattern('ring-grid');
  assert.equal(item.diagrams.length, 2);
  const three = layoutDiagram(parseDiagram(item.diagrams[0].body, item.diagrams[0].options));
  const four = layoutDiagram(parseDiagram(item.diagrams[1].body, item.diagrams[1].options));
  assertRegular(three.items, 3);
  assertRegular(four.items, 4);
});

test('classic radial keeps the hub inward of every satellite', () => {
  const { layout } = firstDiagram('radial-classic');
  const hub = centerOf(item(layout, 'hub'));
  for (const id of ['a', 'b', 'c', 'd']) {
    const point = centerOf(item(layout, id));
    assert.ok(Math.hypot(point.x - hub.x, point.y - hub.y) > 80, id);
  }
  assert.equal(layout.overflow, false);
});

test('spatial radial keeps side and near < mid < far', () => {
  const { layout } = firstDiagram('radial-spatial');
  const hub = centerOf(item(layout, 'hub'));
  const dist = (id: string) => {
    const point = centerOf(item(layout, id));
    return Math.hypot(point.x - hub.x, point.y - hub.y);
  };
  assert.ok(centerOf(item(layout, 'a')).y < hub.y);
  assert.ok(centerOf(item(layout, 'c')).y > hub.y);
  assert.ok(centerOf(item(layout, 'b')).x < hub.x);
  assert.ok(centerOf(item(layout, 'd')).x > hub.x);
  assert.ok(dist('b') < dist('d'));
  assert.ok(dist('d') < dist('a'));
  assert.ok(Math.abs(dist('a') - dist('c')) < 2);
});

test('two cards on the same side stay on that side and spread apart', () => {
  const { layout } = firstDiagram('radial-same-side');
  const hub = centerOf(item(layout, 'hub'));
  const a = centerOf(item(layout, 'a'));
  const b = centerOf(item(layout, 'b'));
  assert.ok(a.y < hub.y && b.y < hub.y);
  assert.ok(Math.abs(a.x - b.x) > 8);
});

test('too many cards on one side report overlap', () => {
  const { layout } = firstDiagram('radial-crowd');
  const hub = centerOf(item(layout, 'hub'));
  for (const id of ['a', 'b', 'c', 'd']) assert.ok(centerOf(item(layout, id)).y < hub.y, id);
  assert.equal(layout.overflow, true);
  assert.equal(layout.overflowReason, 'overlap');
});

test('center= selects the hub even when it is not first', () => {
  const { scene, layout } = firstDiagram('radial-center');
  assert.equal(scene.options.center, 'hub');
  const hub = centerOf(item(layout, 'hub'));
  const frame = { x: layout.width / 2, y: layout.height / 2 };
  assert.ok(Math.hypot(hub.x - frame.x, hub.y - frame.y) < 40);
  for (const id of ['a', 'b', 'c']) {
    const point = centerOf(item(layout, id));
    assert.ok(Math.hypot(point.x - hub.x, point.y - hub.y) > 60, id);
  }
});

test('radial cycle links the satellites and not the hub to itself', () => {
  const { scene } = firstDiagram('radial-cycle');
  const links = resolvedLinks(scene);
  const around = links.filter(
    (link) => link.from !== 'hub' && link.to !== 'hub' && link.kind === 'undirected',
  );
  assert.equal(around.length, 3);
});

test('field aliases keep left left of right and top above bottom', () => {
  const { layout } = firstDiagram('field-aliases');
  const a = centerOf(item(layout, 'a'));
  const b = centerOf(item(layout, 'b'));
  const c = centerOf(item(layout, 'c'));
  assert.ok(a.x < c.x && c.x < b.x);
  assert.ok(a.y < c.y && c.y < b.y);
});

test('field origin sits near the middle of the frame', () => {
  const { layout } = firstDiagram('field-origin');
  const a = centerOf(item(layout, 'a'));
  assert.ok(Math.abs(a.x - layout.width / 2) < 8);
  assert.ok(Math.abs(a.y - layout.height / 2) < 8);
});

test('field zones contain their points', () => {
  const { layout } = firstDiagram('field-zones');
  const west = layout.regions.find((region) => region.id === 'west')!;
  const east = layout.regions.find((region) => region.id === 'east')!;
  const a = centerOf(item(layout, 'a'));
  const b = centerOf(item(layout, 'b'));
  assert.ok(a.x > west.box.x && a.x < west.box.x + west.box.width);
  assert.ok(b.x > east.box.x && b.x < east.box.x + east.box.width);
});

test('field clusters appear in the legend and halo draws a path', () => {
  const clusters = firstDiagram('field-clusters').layout;
  assert.deepEqual(
    clusters.legend.map((entry) => entry.id),
    ['g1', 'g2'],
  );
  const halo = firstDiagram('field-halo').layout;
  const marks = halo.regions.filter((region) => region.kind === 'cluster');
  assert.equal(marks.length, 2);
  assert.ok(marks.every((region) => region.path));
  assert.equal(halo.overflow, false);
});

test('field cards keep titles on the card', () => {
  const { layout } = firstDiagram('field-cards');
  assert.equal(item(layout, 'a').kind, 'card');
  assert.equal(item(layout, 'a').label, undefined);
  assert.equal(item(layout, 'b').kind, 'card');
});

test('field mixed shapes keep a card and a dot', () => {
  const { layout } = firstDiagram('field-mixed');
  assert.equal(item(layout, 'a').kind, 'card');
  assert.equal(item(layout, 'b').kind, 'dot');
  assert.ok(item(layout, 'b').label);
});

test('field links connect the authored points', () => {
  const { layout } = firstDiagram('field-links');
  assert.equal(layout.links.length, 2);
  assert.ok(layout.links.every((link) => link.path.startsWith('M ')));
});

test('free merge keeps authored frames and two incoming edges', () => {
  const { frames, layout } = firstCanvas('free-merge');
  assert.equal(frames[0].x, 20);
  assert.equal(frames[1].y, 374);
  assert.ok(layout.edgePaths.some((path) => path.from === 'a' && path.to === 'c'));
  assert.ok(layout.edgePaths.some((path) => path.from === 'b' && path.to === 'c'));
});

test('free row and column keep a shared axis', () => {
  const row = firstCanvas('free-row').frames;
  assert.ok(row.every((frame) => Math.abs(frame.y - row[0].y) < 1));
  assert.ok(row[0].x < row[1].x && row[1].x < row[2].x);
  const column = firstCanvas('free-column').frames;
  assert.ok(column.every((frame) => Math.abs(frame.x - column[0].x) < 1));
  assert.ok(column[0].y < column[1].y && column[1].y < column[2].y);
});

test('free frame keeps pinned coordinates', () => {
  const { frames } = firstCanvas('free-frame');
  assert.equal(frames[0].x, 48);
  assert.equal(frames[0].width, 210);
  assert.equal(frames[1].x, 520);
  assert.equal(frames[1].y, 80);
});

test('three-column grid keeps three panels and three independent rings', () => {
  const entry = pattern('grid-3');
  assert.equal(entry.diagrams.length, 3);
  assertRegular(
    layoutDiagram(parseDiagram(entry.diagrams[0].body, entry.diagrams[0].options)).items,
    3,
  );
  assertRegular(
    layoutDiagram(parseDiagram(entry.diagrams[1].body, entry.diagrams[1].options)).items,
    4,
  );
  const { root, close } = render(entry.slide);
  try {
    const grid = root.querySelector('.grid-block') as unknown as HTMLElement;
    assert.equal(grid?.style.getPropertyValue('--grid-columns'), '3');
    assert.equal(root.querySelectorAll('.panel-block').length, 3);
    assert.equal(root.querySelectorAll('.milo-diagram').length, 3);
  } finally {
    close();
  }
});

test('wrapping grid keeps two columns and three children', () => {
  const entry = pattern('grid-wrap');
  assert.equal(entry.diagrams.length, 3);
  const { root, close } = render(entry.slide);
  try {
    const grid = root.querySelector('.grid-block') as unknown as HTMLElement;
    assert.equal(grid?.style.getPropertyValue('--grid-columns'), '2');
    assert.equal(grid?.childElementCount, 3);
    assert.equal(root.querySelectorAll('.milo-diagram').length, 3);
  } finally {
    close();
  }
});

test('mixed grid keeps a ring beside a radial', () => {
  const entry = pattern('grid-mixed');
  assert.equal(entry.diagrams.length, 2);
  const ring = layoutDiagram(parseDiagram(entry.diagrams[0].body, entry.diagrams[0].options));
  const radial = layoutDiagram(parseDiagram(entry.diagrams[1].body, entry.diagrams[1].options));
  assertRegular(ring.items, 3);
  assert.ok(entry.diagrams[1].options.includes('layout=radial'));
  const hub = centerOf(item(radial, 'hub'));
  assert.ok(
    Math.hypot(centerOf(item(radial, 'a')).x - hub.x, centerOf(item(radial, 'a')).y - hub.y) > 40,
  );
});

test('stacked grid nests boxes without a diagram', () => {
  const { root, close } = render(pattern('grid-stack').slide);
  try {
    const grid = root.querySelector('.grid-block') as unknown as HTMLElement;
    assert.equal(grid?.style.getPropertyValue('--grid-columns'), '2');
    assert.equal(root.querySelectorAll('.stack-block').length, 2);
    assert.equal(root.querySelectorAll('.box-block').length, 5);
    assert.equal(root.querySelector('.milo-diagram'), null);
  } finally {
    close();
  }
});

test('two equal columns keep a ring and a field', () => {
  const entry = pattern('columns-2');
  assert.equal(entry.diagrams.length, 2);
  const { root, close } = render(entry.slide);
  try {
    const columns = root.querySelector('.columns-block') as unknown as HTMLElement;
    assert.equal(columns?.style.getPropertyValue('--column-count'), '2');
    assert.equal(root.querySelectorAll('.column-block').length, 2);
    assert.equal(root.querySelectorAll('.milo-diagram').length, 2);
  } finally {
    close();
  }
  const field = layoutDiagram(parseDiagram(entry.diagrams[1].body, entry.diagrams[1].options));
  assert.ok(centerOf(item(field, 'a')).x < centerOf(item(field, 'c')).x);
  assert.equal(field.links.length, 2);
});

test('three equal columns keep text and boxes', () => {
  const { root, close } = render(pattern('columns-3').slide);
  try {
    const columns = root.querySelector('.columns-block') as unknown as HTMLElement;
    assert.equal(columns?.style.getPropertyValue('--column-count'), '3');
    assert.equal(root.querySelectorAll('.column-block').length, 3);
    assert.equal(root.querySelectorAll('.box-block').length, 2);
    assert.ok(root.querySelector('.column-block strong'));
    assert.equal(root.querySelectorAll('.column-block li').length, 2);
  } finally {
    close();
  }
});

test('mixed columns put a radial beside stacked boxes', () => {
  const entry = pattern('columns-mixed');
  const { layout } = firstDiagram('columns-mixed');
  const hub = centerOf(item(layout, 'hub'));
  for (const id of ['a', 'b', 'c']) {
    const point = centerOf(item(layout, id));
    assert.ok(Math.hypot(point.x - hub.x, point.y - hub.y) > 40, id);
  }
  const { root, close } = render(entry.slide);
  try {
    assert.equal(
      (root.querySelector('.columns-block') as unknown as HTMLElement)?.style.getPropertyValue(
        '--column-count',
      ),
      '2',
    );
    assert.equal(root.querySelectorAll('.milo-diagram').length, 1);
    assert.equal(root.querySelectorAll('.stack-block .box-block').length, 3);
  } finally {
    close();
  }
});

test('compose boxes parse a one-way arrow between two parts', () => {
  const scene = firstCompose('compose-boxes');
  assert.deepEqual(
    scene.parts.map((part) => part.id),
    ['left', 'right'],
  );
  const mark = arrow(scene, 'go');
  assert.equal('from' in mark && mark.from, 'left');
  assert.equal('to' in mark && mark.to, 'right');
  assert.equal(mark.arrows, 'end');
  const { root, close } = render(pattern('compose-boxes').slide);
  try {
    assert.equal(root.querySelectorAll('.composition-part').length, 2);
    assert.equal(root.querySelectorAll('.box-block').length, 2);
  } finally {
    close();
  }
});

test('compose both keeps a bidirectional label', () => {
  const mark = arrow(firstCompose('compose-both'), 'trade');
  assert.equal(mark.arrows, 'both');
  assert.equal(mark.label, '切替');
});

test('compose diagrams keep an independent ring and radial', () => {
  const entry = pattern('compose-diagrams');
  assert.equal(entry.diagrams.length, 2);
  assertRegular(
    layoutDiagram(parseDiagram(entry.diagrams[0].body, entry.diagrams[0].options)).items,
    3,
  );
  const radial = layoutDiagram(parseDiagram(entry.diagrams[1].body, entry.diagrams[1].options));
  assert.ok(item(radial, 'hub'));
  const mark = arrow(firstCompose('compose-diagrams'), 'advance');
  assert.equal('from' in mark && mark.from, 'now');
  assert.equal('to' in mark && mark.to, 'future');
});

test('compose node points from a ring vertex to a box', () => {
  const mark = arrow(firstCompose('compose-node'), 'action');
  assert.equal('from' in mark && mark.from, 'map.b');
  assert.equal('to' in mark && mark.to, 'note');
  const { scene } = firstDiagram('compose-node');
  assert.equal(scene.items.find((entry) => entry.id === 'b')?.level, 'high');
});

test('compose side puts axis arrows on a radial', () => {
  const scene = firstCompose('compose-side');
  assert.equal(scene.parts.length, 1);
  const span = arrow(scene, 'span');
  const wide = arrow(scene, 'wide');
  assert.equal('target' in span && span.target, 'map.a');
  assert.equal('side' in span && span.side, 'top');
  assert.equal('target' in wide && wide.target, 'map');
  assert.equal('side' in wide && wide.side, 'right');
  assert.equal(wide.tone, 'default');
});

test('compose column stacks parts from top to bottom', () => {
  const scene = firstCompose('compose-column');
  assert.equal(scene.layout, 'column');
  assert.deepEqual(
    scene.parts.map((part) => part.id),
    ['top', 'bottom'],
  );
  const mark = arrow(scene, 'down');
  assert.equal('from' in mark && mark.from, 'top');
  assert.equal('to' in mark && mark.to, 'bottom');
  const { root, close } = render(pattern('compose-column').slide);
  try {
    assert.equal(
      (root.querySelector('.milo-composition') as unknown as HTMLElement)?.dataset
        .compositionLayout,
      'column',
    );
  } finally {
    close();
  }
});
