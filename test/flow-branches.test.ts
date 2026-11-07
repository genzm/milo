import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { parseCanvas } from '../src/canvas.ts';
import { parseDiagram, resolvedLinks } from '../src/diagram.ts';
import { layoutFlowFromCanvas } from '../src/flow/layout.ts';
import { fromCanvasScene } from '../src/flow/normalize.ts';
import type { FlowDirection, FlowLayoutResult, FlowSceneInput } from '../src/flow/types.ts';
import {
  parseComposition,
  type ArrowAnnotation,
  type CompositionScene,
} from '../src/markdown/composition.mjs';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

const FIXTURE = readFileSync(new URL('./fixtures/flow-branches.md', import.meta.url), 'utf8');

type PatternCase = {
  pattern: string;
  allow: Set<string>;
  slide: string;
  diagrams: Array<{ options: string; body: string }>;
  canvases: Array<{ options: string; body: string }>;
  composes: Array<{ options: string; body: string }>;
};

function along(
  direction: FlowDirection,
  box: { x: number; y: number; width: number; height: number },
) {
  return direction === 'right' || direction === 'left' ? box.x : box.y;
}

function cross(
  direction: FlowDirection,
  box: { x: number; y: number; width: number; height: number },
) {
  return direction === 'right' || direction === 'left'
    ? box.y + box.height / 2
    : box.x + box.width / 2;
}

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
  const slides = fixtureSlides(FIXTURE);
  return slides.flatMap((slide: string) => {
    const header = /<!--\s*pattern:\s*([a-z0-9-]+)(?:\s+allow=([A-Z_,]+))?\s*-->/.exec(slide);
    if (!header) return [];
    return [
      {
        pattern: header[1],
        allow: new Set((header[2] || '').split(',').filter(Boolean)),
        slide,
        diagrams: extractBlocks(slide, 'diagram', 'diagram').filter((block) =>
          /\blayout=flow\b/.test(block.options),
        ),
        canvases: extractBlocks(slide, 'canvas', 'canvas'),
        composes: extractBlocks(slide, 'compose', 'compose'),
      },
    ];
  });
}

function diagramScene(body: string, options: string): FlowSceneInput {
  const scene = parseDiagram(body, options);
  const links = resolvedLinks(scene);
  return {
    options: {
      direction: scene.options.direction,
      width: scene.options.width,
      height: scene.options.height,
      autoHeight: scene.options.autoHeight,
      gap: scene.options.gap,
      route: scene.options.route,
    },
    nodes: scene.items.map((item) => ({
      id: item.id,
      markdown: item.markdown ? `### ${item.title}\n\n${item.markdown}` : `### ${item.title}`,
      shape: item.shape === 'vertex' ? 'ellipse' : 'card',
      width: scene.options.nodeWidth,
      dx: 0,
      dy: 0,
      pinned: false,
    })),
    edges: links.map((link) => ({
      from: link.from,
      to: link.to,
      label: link.label,
      arrows: link.kind === 'both' ? 'both' : link.kind === 'forward' ? 'end' : 'none',
    })),
  };
}

function layoutOf(block: { options: string; body: string }, kind: 'diagram' | 'canvas') {
  const scene =
    kind === 'diagram'
      ? diagramScene(block.body, block.options)
      : parseCanvas(block.body, block.options);
  return { scene, layout: layoutFlowFromCanvas(scene) };
}

function cases(): PatternCase[] {
  return loadPatterns();
}

function pattern(id: string) {
  const found = cases().find((item) => item.pattern === id);
  assert.ok(found, `missing pattern ${id}`);
  return found;
}

function firstLayout(id: string) {
  const item = pattern(id);
  const block = item.diagrams[0] || item.canvases[0];
  assert.ok(block, `pattern ${id} has no flow`);
  return layoutOf(block, item.diagrams[0] ? 'diagram' : 'canvas');
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

function hardFailures(layout: FlowLayoutResult, allow: Set<string>) {
  return layout.diagnostics.filter(
    (item) =>
      !allow.has(item.code) &&
      (item.code === 'NODE_OVERLAP' ||
        item.code === 'FRAME_OVERFLOW' ||
        item.code === 'EDGE_COLLISION' ||
        item.code === 'EDGE_LABEL_COLLISION' ||
        item.code === 'TEXT_OVERFLOW'),
  );
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

test('branch fixture lists distinct flow patterns', () => {
  const ids = cases().map((item) => item.pattern);
  assert.ok(ids.length >= 40, `expected many patterns, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const needed of [
    'fanout-3',
    'nested-tree',
    'diamond-2',
    'skip-edge',
    'compose-time',
    'compose-action',
    'compose-modes',
    'canvas-diamond',
    'grid-3',
    'grid-wrap',
    'columns-2',
    'compose-boxes',
    'compose-side',
    'compose-column',
  ])
    assert.ok(ids.includes(needed), needed);
});

test('every branch pattern lays out without overlap, overflow or edge hits', () => {
  for (const item of cases()) {
    const blocks = [
      ...item.diagrams.map((block) => ({ block, kind: 'diagram' as const })),
      ...item.canvases.map((block) => ({ block, kind: 'canvas' as const })),
    ];
    if (!blocks.length) {
      assert.ok(
        item.composes.length || /@(grid|columns)\b/.test(item.slide),
        `${item.pattern}: no flow`,
      );
      continue;
    }
    for (const { block, kind } of blocks) {
      const { layout } = layoutOf(block, kind);
      const failed = hardFailures(layout, item.allow);
      assert.equal(
        failed.length,
        0,
        `${item.pattern}: ${failed.map((item) => `${item.code}(${item.nodeIds.join(',')})`).join('; ')}`,
      );
      if (item.allow.has('CYCLE_DETECTED'))
        assert.ok(
          layout.diagnostics.some((diag) => diag.code === 'CYCLE_DETECTED'),
          `${item.pattern}: expected cycle`,
        );
    }
  }
});

test('branch pattern slides render without block errors', () => {
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

test('odd and even fan-outs keep parent alignment', () => {
  for (const [id, children] of [
    ['fanout-3', ['raw', 'ferment', 'oxid']],
    ['fanout-5', ['why', 'view', 'try', 'talk', 'read']],
    ['fanout-2', ['raw', 'oxid']],
    ['fanout-4', ['cost', 'time', 'quality', 'support']],
  ] as const) {
    const { scene, layout } = firstLayout(id);
    const direction = scene.options.direction;
    const parent =
      layout.nodeFrames.get('taste') ||
      layout.nodeFrames.get('core') ||
      layout.nodeFrames.get('issue')!;
    const boxes = children.map((id) => layout.nodeFrames.get(id)!);
    const primaries = boxes.map((box) => along(direction, box));
    assert.ok(
      primaries.every((value) => Math.abs(value - primaries[0]) < 1),
      id,
    );
    const crosses = boxes.map((box) => cross(direction, box)).sort((a, b) => a - b);
    if (children.length % 2)
      assert.ok(
        Math.abs(cross(direction, parent) - crosses[Math.floor(crosses.length / 2)]) < 1,
        id,
      );
    else
      assert.ok(
        Math.abs(
          cross(direction, parent) -
            (crosses[children.length / 2 - 1] + crosses[children.length / 2]) / 2,
        ) < 1,
        id,
      );
  }
});

test('nested trees keep the main branch level and the nested branch level', () => {
  for (const id of ['nested-tree', 'compact-nested']) {
    const { layout } = firstLayout(id);
    const y = (node: string) => {
      const box = layout.nodeFrames.get(node)!;
      return box.y + box.height / 2;
    };
    const x = (node: string) => layout.nodeFrames.get(node)!.x;
    assert.ok(Math.abs(y('issue') - y('process')) < 1, id);
    assert.ok(Math.abs(y('material') - y('wheat')) < 1, id);
    assert.ok(x('issue') < x('material'));
    assert.ok(x('material') < x('soy'));
    assert.ok(Math.abs(x('material') - x('process')) < 1);
    assert.ok(Math.abs(x('soy') - x('wheat')) < 1);
  }
});

test('diamond branch-merge stays on shared ranks without crossing', () => {
  for (const id of ['diamond-2', 'canvas-diamond']) {
    const { layout } = firstLayout(id);
    const start = layout.nodeFrames.get('start')!;
    const a = layout.nodeFrames.get('pathA') || layout.nodeFrames.get('a')!;
    const b = layout.nodeFrames.get('pathB') || layout.nodeFrames.get('b')!;
    const join = layout.nodeFrames.get('join')!;
    assert.ok(Math.abs(a.x - b.x) < 1, id);
    assert.ok(start.x + start.width < a.x, id);
    assert.ok(a.x + a.width < join.x, id);
    assert.ok(
      (a.y + a.height / 2 - (start.y + start.height / 2)) *
        (b.y + b.height / 2 - (start.y + start.height / 2)) <
        0,
      id,
    );
    assert.ok(
      layout.edgePaths.some((path) => path.role === 'bus' || path.role === 'stem'),
      id,
    );
  }
});

function pathPoints(path: string) {
  return [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

test('skip edges peel from the source trunk and merge at the destination', () => {
  for (const id of ['skip-edge', 'long-skip']) {
    const { layout } = firstLayout(id);
    const start = layout.nodeFrames.get('start')!;
    const endId = layout.nodeFrames.has('act') ? 'act' : 'end';
    const end = layout.nodeFrames.get(endId)!;
    assert.ok(start.x + start.width < end.x, id);
    assert.ok(
      layout.edgePaths.some(
        (path) => path.from === 'start' && (path.role === 'bus' || path.role === 'stem'),
      ),
      `${id}: skip should leave a source-side trunk`,
    );
    assert.ok(
      layout.edgePaths.some(
        (path) => path.to === endId && (path.role === 'bus' || path.role === 'stem'),
      ),
      `${id}: skip should join a destination-side trunk`,
    );
    const skip = layout.edgePaths.filter((path) => path.from === 'start' && path.to === endId);
    assert.ok(
      skip.some((path) => path.role === 'stub'),
      `${id}: skip should arrive as a fan-in stub`,
    );
    assert.equal(
      skip.some((path) => path.role === 'stem' || path.role === 'bus'),
      false,
      id,
    );
    const pts = pathPoints(skip.find((path) => path.role === 'stub')!.path);
    assert.ok(
      pts[0].x > start.x + start.width + 4,
      `${id}: skip should peel from the source trunk, not the node edge`,
    );
    assert.ok(pts[pts.length - 1].x < end.x + 1, id);
    const startY = start.y + start.height / 2;
    assert.ok(
      pts.every((point) => Math.abs(point.y - startY) > 8),
      `${id}: skip should leave the shared rank`,
    );
  }
});

test('a link between siblings pushes the target to a later rank', () => {
  const { layout } = firstLayout('sibling-link');
  const raw = layout.nodeFrames.get('raw')!;
  const oxid = layout.nodeFrames.get('oxid')!;
  const issue = layout.nodeFrames.get('issue')!;
  assert.ok(issue.x + issue.width < raw.x);
  assert.ok(raw.x + raw.width < oxid.x);
  assert.equal(
    layout.diagnostics.some((item) => item.code === 'CYCLE_DETECTED'),
    false,
  );
  const skip = layout.edgePaths.filter((path) => path.from === 'issue' && path.to === 'oxid');
  const stub = skip.find((path) => path.role === 'stub');
  assert.ok(stub, 'sibling skip should peel as a stub');
  assert.ok(pathPoints(stub.path)[0].x > issue.x + issue.width + 4);
  assert.ok(
    layout.edgePaths.some(
      (path) => path.from === 'issue' && (path.role === 'bus' || path.role === 'stem'),
    ),
  );
  assert.ok(
    layout.edgePaths.some(
      (path) => path.to === 'oxid' && (path.role === 'bus' || path.role === 'stem'),
    ),
  );
});

test('mixed-direction skip peels from the source trunk', () => {
  const { layout } = firstLayout('mixed-links');
  const problem = layout.nodeFrames.get('problem')!;
  const action = layout.nodeFrames.get('action')!;
  const skip = layout.edgePaths.filter((path) => path.from === 'problem' && path.to === 'action');
  const stub = skip.find((path) => path.role === 'stub');
  assert.ok(stub, 'mixed skip should peel as a stub');
  assert.ok(pathPoints(stub.path)[0].x > problem.x + problem.width + 4);
  assert.ok(pathPoints(stub.path)[pathPoints(stub.path).length - 1].x < action.x + 1);
  assert.ok(
    layout.edgePaths.some(
      (path) => path.from === 'problem' && (path.role === 'bus' || path.role === 'stem'),
    ),
  );
  assert.ok(
    layout.edgePaths.some(
      (path) => path.to === 'action' && (path.role === 'bus' || path.role === 'stem'),
    ),
  );
});

test('late merge keeps the longer branch on later ranks', () => {
  const { layout } = firstLayout('late-merge');
  const code = layout.nodeFrames.get('code')!;
  const run = layout.nodeFrames.get('run')!;
  const explain = layout.nodeFrames.get('explain')!;
  const join = layout.nodeFrames.get('join')!;
  const mid = (box: { y: number; height: number }) => box.y + box.height / 2;
  assert.ok(code.x < run.x);
  assert.ok(run.x < join.x);
  assert.ok(explain.x < join.x);
  assert.ok(Math.abs(code.x - explain.x) < 1);
  assert.ok(Math.abs(mid(join) - (mid(run) + mid(explain)) / 2) < 1);
  assert.ok(
    layout.edgePaths.some(
      (path) => path.to === 'join' && (path.role === 'bus' || path.role === 'stem'),
    ),
  );
});

test('nested uneven branches align the middle child in every fan', () => {
  const { layout } = firstLayout('nested-uneven');
  const box = (id: string) => layout.nodeFrames.get(id)!;
  const mid = (id: string) => {
    const frame = box(id);
    return frame.y + frame.height / 2;
  };
  assert.ok(Math.abs(mid('hub') - mid('b')) < 1);
  assert.ok(Math.abs(mid('a') - mid('a2')) < 1);
  assert.ok(Math.abs(mid('a2') - mid('a2y')) < 1);
  assert.ok(box('hub').x < box('a').x);
  assert.ok(box('a').x < box('a2').x);
  assert.ok(box('a2').x < box('a2y').x);
  assert.ok(Math.abs(box('a1').x - box('b1').x) < 1);
  assert.ok(Math.abs(box('a2x').x - box('a2z').x) < 1);
});

test('uncrossed authored edges keep sources and targets in matching order', () => {
  const { layout } = firstLayout('uncross');
  const y = (id: string) => {
    const box = layout.nodeFrames.get(id)!;
    return box.y + box.height / 2;
  };
  const topFrom = y('a') < y('b') ? 'a' : 'b';
  const topTo = y('c') < y('d') ? 'c' : 'd';
  assert.equal(topFrom === 'a', topTo === 'd');
});

test('down and left fans still share a rank axis', () => {
  const down = firstLayout('tree-down');
  assert.ok(
    Math.abs(down.layout.nodeFrames.get('raw')!.y - down.layout.nodeFrames.get('ferment')!.y) < 1,
  );
  assert.ok(down.layout.nodeFrames.get('issue')!.y < down.layout.nodeFrames.get('raw')!.y);
  const left = firstLayout('fanout-left');
  const issue = left.layout.nodeFrames.get('issue')!;
  const raw = left.layout.nodeFrames.get('raw')!;
  assert.ok(raw.x + raw.width < issue.x);
  assert.ok(
    Math.abs(left.layout.nodeFrames.get('raw')!.x - left.layout.nodeFrames.get('ferment')!.x) < 1,
  );
});

test('compose slides keep two independent flows', () => {
  for (const id of ['compose-time', 'compose-modes', 'compose-column']) {
    const entry = pattern(id);
    assert.equal(entry.diagrams.length, 2, id);
    for (const block of entry.diagrams) {
      const { layout } = layoutOf(block, 'diagram');
      assert.equal(hardFailures(layout, entry.allow).length, 0, id);
    }
  }
  const action = pattern('compose-action');
  assert.equal(action.diagrams.length, 1);
  assert.match(action.slide, /from=causes\.oxid to=solution/);
});

test('route=auto diamond uses a shared trunk while curve does not', () => {
  const entry = pattern('route-compare');
  assert.equal(entry.diagrams.length, 2);
  const auto = layoutOf(entry.diagrams[0], 'diagram').layout;
  const curve = layoutOf(entry.diagrams[1], 'diagram').layout;
  assert.ok(auto.edgePaths.some((path) => path.role === 'bus' || path.role === 'stem'));
  assert.equal(
    curve.edgePaths.some((path) => path.role === 'bus' || path.role === 'stem'),
    false,
  );
});

test('three-column grid keeps serial, fan-out and diamond flows', () => {
  const entry = pattern('grid-3');
  assert.equal(entry.diagrams.length, 3);
  const serial = layoutOf(entry.diagrams[0], 'diagram').layout;
  const fan = layoutOf(entry.diagrams[1], 'diagram').layout;
  const diamond = layoutOf(entry.diagrams[2], 'diagram').layout;
  assert.ok(serial.nodeFrames.get('a')!.y < serial.nodeFrames.get('c')!.y);
  assert.ok(Math.abs(fan.nodeFrames.get('a')!.y - fan.nodeFrames.get('b')!.y) < 1);
  assert.ok(Math.abs(diamond.nodeFrames.get('a')!.y - diamond.nodeFrames.get('b')!.y) < 1);
  assert.ok(Math.abs(diamond.nodeFrames.get('a')!.x - diamond.nodeFrames.get('b')!.x) > 8);
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

test('mixed grid keeps a right fan-out beside a down diamond', () => {
  const entry = pattern('grid-mixed');
  assert.equal(entry.diagrams.length, 2);
  const right = layoutOf(entry.diagrams[0], 'diagram');
  const down = layoutOf(entry.diagrams[1], 'diagram');
  assert.equal(right.scene.options.direction, 'right');
  assert.equal(down.scene.options.direction, 'down');
  assert.ok(right.layout.nodeFrames.get('issue')!.x < right.layout.nodeFrames.get('raw')!.x);
  assert.ok(down.layout.nodeFrames.get('start')!.y < down.layout.nodeFrames.get('join')!.y);
});

test('stacked grid nests a flow above a caption in each panel', () => {
  const entry = pattern('grid-stack');
  assert.equal(entry.diagrams.length, 2);
  const { root, close } = render(entry.slide);
  try {
    const grid = root.querySelector('.grid-block') as unknown as HTMLElement;
    assert.equal(grid?.style.getPropertyValue('--grid-columns'), '2');
    assert.equal(root.querySelectorAll('.stack-block').length, 2);
    assert.equal(root.querySelectorAll('.milo-diagram').length, 2);
    assert.equal(root.querySelectorAll('.stack-block .box-block').length, 2);
  } finally {
    close();
  }
});

test('two equal columns keep a fan-out and a diamond', () => {
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
  const diamond = layoutOf(entry.diagrams[1], 'diagram').layout;
  assert.ok(diamond.edgePaths.some((path) => path.role === 'bus' || path.role === 'stem'));
});

test('three equal columns keep three independent serial flows', () => {
  const entry = pattern('columns-3');
  assert.equal(entry.diagrams.length, 3);
  const { root, close } = render(entry.slide);
  try {
    const columns = root.querySelector('.columns-block') as unknown as HTMLElement;
    assert.equal(columns?.style.getPropertyValue('--column-count'), '3');
    assert.equal(root.querySelectorAll('.column-block').length, 3);
    assert.equal(root.querySelectorAll('.milo-diagram').length, 3);
  } finally {
    close();
  }
  for (const block of entry.diagrams) {
    const { layout } = layoutOf(block, 'diagram');
    assert.ok(layout.nodeFrames.get('a')!.y < layout.nodeFrames.get('c')!.y);
  }
});

test('mixed columns put a fan-out beside stacked boxes', () => {
  const entry = pattern('columns-mixed');
  const { layout } = firstLayout('columns-mixed');
  assert.ok(layout.nodeFrames.get('issue')!.x < layout.nodeFrames.get('raw')!.x);
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

test('compose side puts axis arrows on a nested flow', () => {
  const scene = firstCompose('compose-side');
  assert.equal(scene.parts.length, 1);
  const depth = arrow(scene, 'depth');
  const breadth = arrow(scene, 'breadth');
  assert.equal('from' in depth && depth.from, 'causes.issue');
  assert.equal('to' in depth && depth.to, 'causes.material');
  assert.equal('side' in depth && depth.side, 'top');
  assert.equal('from' in breadth && breadth.from, 'causes.a1');
  assert.equal('to' in breadth && breadth.to, 'causes.a3');
  assert.equal('side' in breadth && breadth.side, 'right');
  assert.equal(breadth.tone, 'default');
  const { layout } = firstLayout('compose-side');
  const mid = (id: string) => {
    const box = layout.nodeFrames.get(id)!;
    return box.y + box.height / 2;
  };
  assert.ok(Math.abs(mid('issue') - mid('process')) < 1);
  assert.ok(layout.nodeFrames.get('material')!.x < layout.nodeFrames.get('a2')!.x);
});

test('compose column stacks flows from top to bottom', () => {
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
    assert.equal(root.querySelectorAll('.milo-diagram').length, 2);
  } finally {
    close();
  }
});

test('asymmetric skip still connects every stem after grouping by rank', async () => {
  const { routeEdges } = await import('../src/flow/route.ts');
  const scene = parseCanvas(
    `@node start\nStart\n@node mid\nMid\n@node end\nEnd
@edge start --> mid
@edge mid --> end
@edge start --> end`,
    'direction=right route=auto',
  );
  const layout = layoutFlowFromCanvas(scene);
  const paths = routeEdges(fromCanvasScene(scene), layout.nodeFrames);
  assert.equal(
    paths.some(
      (path) =>
        path.from === 'start' && path.to === 'end' && (path.role === 'stem' || path.role === 'bus'),
    ),
    false,
  );
  assert.ok(paths.some((path) => path.from === 'start' && path.to === 'end'));
  assert.ok(paths.some((path) => path.from === 'start' && path.to === 'mid'));
});
