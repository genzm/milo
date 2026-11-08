import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { ARROW_THICKNESS_RATIO, arrowGeometry, arrowThickness } from '../src/composition/geometry';
import {
  parseComposition,
  type ArrowAnnotation,
  type CompositionScene,
} from '../src/markdown/composition.mjs';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

const FIXTURE = readFileSync(new URL('./fixtures/annotation-arrows.md', import.meta.url), 'utf8');

type PatternCase = {
  pattern: string;
  slide: string;
  composes: Array<{ options: string; body: string }>;
};

function extractBlocks(slide: string, open: string, close: string) {
  const pattern = new RegExp(`@${open}(?:[^\\S\\n]+([^\\n]*))?\\n([\\s\\S]*?)@end${close}`, 'g');
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
  return fixtureSlides(FIXTURE).flatMap((slide) => {
    const footer = /@footer\npattern:\s*([a-z0-9-]+)/.exec(slide);
    if (!footer) return [];
    return [
      {
        pattern: footer[1],
        slide,
        composes: extractBlocks(slide, 'compose', 'compose'),
      },
    ];
  });
}

const PATTERNS = loadPatterns();

function pattern(id: string) {
  const found = PATTERNS.find((item) => item.pattern === id);
  assert.ok(found, `missing pattern ${id}`);
  return found;
}

function firstCompose(id: string): CompositionScene {
  const item = pattern(id);
  const block = item.composes[0];
  assert.ok(block, `pattern ${id} has no compose`);
  return parseComposition(block.body, block.options);
}

function arrowsOf(scene: CompositionScene): ArrowAnnotation[] {
  return scene.annotations.filter((mark): mark is ArrowAnnotation => mark.kind === 'arrow');
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

const NEEDED = [
  'end-wide',
  'end-medium',
  'end-narrow',
  'end-min',
  'end-left',
  'both-wide',
  'both-medium',
  'both-narrow',
  'both-min',
  'row-switch',
  'column-end',
  'column-both',
  'column-up',
  'column-narrow',
  'target-sides',
  'target-reverse',
  'length-scale',
  'length-scale-both',
  'size-cap-small',
  'size-cap-large',
  'span-top',
  'span-right',
  'span-bottom',
  'span-left',
  'tones',
  'labels-both',
  'node-to-box',
  'diagrams',
  'align-start',
  'align-end',
  'with-cross',
  'offset',
];

test('annotation-arrow fixture lists distinct connecting, axis, span and scale patterns', () => {
  const ids = PATTERNS.map((item) => item.pattern);
  assert.ok(ids.length >= 30, `expected many patterns, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of NEEDED) assert.ok(ids.includes(id), `missing ${id}`);
});

test('every annotation-arrow pattern parses arrows without errors', () => {
  for (const item of PATTERNS) {
    assert.ok(item.composes.length >= 1, `${item.pattern}: missing compose`);
    const scene = parseComposition(item.composes[0].body, item.composes[0].options);
    const arrows = arrowsOf(scene);
    assert.ok(arrows.length >= 1, `${item.pattern}: missing arrows`);
    for (const mark of arrows) {
      assert.match(mark.arrows, /^(end|both)$/, `${item.pattern} ${mark.id}`);
      assert.ok(mark.size >= 16, `${item.pattern} ${mark.id} size`);
    }
    const { root, close } = render(item.slide);
    try {
      assert.equal(root.querySelector('.block-error'), null, item.pattern);
      assert.ok(root.querySelector('.milo-composition'), item.pattern);
    } finally {
      close();
    }
  }
});

test('row-switch mixes one-way connectors with a short bidirectional switch', () => {
  const scene = firstCompose('row-switch');
  assert.deepEqual(
    scene.parts.map((part) => part.id),
    ['scan', 'pick', 'lock', 'say'],
  );
  const marks = Object.fromEntries(arrowsOf(scene).map((mark) => [mark.id, mark]));
  assert.equal(marks.into.arrows, 'end');
  assert.equal(marks.out.arrows, 'end');
  assert.equal(marks.switch.arrows, 'both');
  assert.equal(marks.switch.label, '切替');
});

test('length-scale uses the same size cap on short, mid and long targets', () => {
  const marks = arrowsOf(firstCompose('length-scale'));
  assert.deepEqual(
    marks.map((mark) => mark.id),
    ['scale-short', 'scale-mid', 'scale-long'],
  );
  assert.ok(marks.every((mark) => mark.size === 88));
  assert.ok(marks.every((mark) => 'target' in mark && mark.side === 'top'));
});

test('target-sides covers every edge, reverse covers opposite directions', () => {
  const sides = Object.fromEntries(
    arrowsOf(firstCompose('target-sides')).map((mark) => [mark.id, mark]),
  );
  assert.equal('side' in sides.top && sides.top.side, 'top');
  assert.equal('side' in sides.right && sides.right.side, 'right');
  assert.equal('side' in sides.bottom && sides.bottom.side, 'bottom');
  assert.equal('side' in sides.left && sides.left.side, 'left');
  const reverse = Object.fromEntries(
    arrowsOf(firstCompose('target-reverse')).map((mark) => [mark.id, mark]),
  );
  assert.equal('direction' in reverse.leftward && reverse.leftward.direction, 'left');
  assert.equal('direction' in reverse.upward && reverse.upward.direction, 'up');
});

test('tones, labels, crosses and offsets stay available on annotation arrows', () => {
  const tones = Object.fromEntries(arrowsOf(firstCompose('tones')).map((mark) => [mark.id, mark]));
  assert.equal(tones.accent.tone, 'accent');
  assert.equal(tones.default.tone, 'default');
  assert.equal(tones.muted.tone, 'muted');
  const labeled = arrowsOf(firstCompose('labels-both'))[0];
  assert.equal(labeled.arrows, 'both');
  assert.equal(labeled.label, 'トレードオフ');
  const crossed = firstCompose('with-cross');
  assert.equal(arrowsOf(crossed)[0].id, 'proposal');
  assert.equal(
    crossed.annotations.some((mark) => mark.kind === 'cross' && mark.target === 'proposal'),
    true,
  );
  const offset = Object.fromEntries(
    arrowsOf(firstCompose('offset')).map((mark) => [mark.id, mark]),
  );
  assert.equal('offset' in offset.near && offset.near.offset, 8);
  assert.equal('offset' in offset.far && offset.far.offset, 48);
});

test('narrow connecting gaps keep a similar block-arrow instead of a bowtie', () => {
  for (const [gap, arrows] of [
    [220, 'end'],
    [120, 'end'],
    [64, 'end'],
    [48, 'end'],
    [220, 'both'],
    [64, 'both'],
    [48, 'both'],
  ] as const) {
    const length = gap - 24;
    const geometry = arrowGeometry({ x: 0, y: 0 }, { x: length, y: 0 }, 88, arrows);
    const thickness = geometry.vertical ? geometry.box.width : geometry.box.height;
    const expected = arrowThickness(length, 88);
    assert.ok(
      Math.abs(thickness - expected) < 0.5,
      `${arrows} gap=${gap}: thickness ${thickness} expected ${expected}`,
    );
    assert.ok(thickness / length <= ARROW_THICKNESS_RATIO + 0.02, `${arrows} gap=${gap} too thick`);
    if (arrows === 'both')
      assert.ok(geometry.length > thickness * 0.35, `${arrows} gap=${gap} bowtie`);
  }
});
