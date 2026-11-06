import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  estimateCardSize,
  estimateNoteSize,
  layoutDiagram,
  NESTED_DIAGRAM_FRAME,
  parseDiagram,
  resolvedLinks,
  VERTEX_R,
} from '../src/diagram.ts';
import { overlaps } from '../src/diagram/geometry-ring.ts';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

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
    rendered,
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

const triangle = `@diagram layout=ring connect=cycle start=top order=ccw
@item access title="誰でも引ける" badge=1 level=high
@item speed title="速く引ける" badge=2 level=high
@item history title="遡って引ける" badge=3 level=low
@enddiagram`;

test('diagram parses items, cycle links and semantic levels', () => {
  const scene = parseDiagram(
    `@item access title="誰でも引ける" badge=1 level=high
@item speed title="速く引ける" badge=2 level=high
@item history title="遡って引ける" badge=3 level=low`,
    'layout=ring connect=cycle start=top order=ccw',
  );
  assert.equal(scene.options.layout, 'ring');
  assert.equal(scene.options.connect, 'cycle');
  assert.equal(scene.items.length, 3);
  assert.equal(scene.items[0].id, 'access');
  assert.equal(scene.items[0].level, 'high');
  assert.equal(scene.items[2].level, 'low');
  assert.equal(scene.items[2].badge, '3');
  const links = resolvedLinks(scene);
  assert.equal(links.length, 3);
  assert.ok(links.every((link) => link.kind === 'undirected'));
});

test('link arrows distinguish relation, direction and both', () => {
  const scene = parseDiagram(
    `@item a title="始点"
@item b title="中点"
@item c title="終点"
@link a -- b
@link b -> c label="ラベルA"
@link a <-> c label="ラベルB"`,
    'layout=flow direction=right',
  );
  assert.equal(scene.links[0].kind, 'undirected');
  assert.equal(scene.links[1].kind, 'forward');
  assert.equal(scene.links[1].label, 'ラベルA');
  assert.equal(scene.links[2].kind, 'both');
});

test('ring places three items as a triangle and four as a diamond', () => {
  const three = layoutDiagram(
    parseDiagram(
      `@item a title="節点A"
@item b title="節点B"
@item c title="節点C"`,
      'layout=ring connect=cycle start=top order=ccw',
    ),
  );
  const top = three.items[0];
  const left = three.items[1];
  const right = three.items[2];
  assert.ok(top.y < left.y && top.y < right.y);
  assert.ok(left.x + left.width / 2 < top.x + top.width / 2);
  assert.ok(right.x + right.width / 2 > top.x + top.width / 2);
  assert.equal(three.links.length, 3);

  const four = layoutDiagram(
    parseDiagram(
      `@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"`,
      'layout=ring',
    ),
  );
  assert.equal(four.items.length, 4);
  assert.equal(four.links.length, 4);
  const cx = four.items.map((item) => item.x + item.width / 2);
  const cy = four.items.map((item) => item.y + item.height / 2);
  assert.ok(cy[0] < cy[1] && cy[0] < cy[3]);
  assert.ok(cx[1] < cx[0]);
  assert.ok(cx[3] > cx[0]);
});

test('ring labels sit outside vertices and stay inside the frame', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item a title="とても長い日本語のラベルを外側へ"
@item b title="もう一つの長い説明"
@item c title="重ならないこと"`,
      'layout=ring',
    ),
  );
  const cx = layout.width / 2;
  const cy = layout.height / 2;
  for (const item of layout.items) {
    assert.ok(item.label);
    const vertex = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const label = {
      x: item.label.x + item.label.width / 2,
      y: item.label.y + item.label.height / 2,
    };
    const vertexDist = Math.hypot(vertex.x - cx, vertex.y - cy);
    const labelDist = Math.hypot(label.x - cx, label.y - cy);
    assert.ok(labelDist > vertexDist);
    assert.ok(item.x >= 0 && item.x + item.width <= layout.width);
    assert.ok(item.label.x >= 0 && item.label.x + item.label.width <= layout.width);
    assert.ok(item.label.y >= 0 && item.label.y + item.label.height <= layout.height);
  }
});

test('radial hub stays wide enough for a long Japanese title', () => {
  const scene = parseDiagram(
    `@item issue title="これは幅を測るための長い日本語タイトル"
@item material title="枝A"
@item fermentation title="枝B"
@item oxidation title="枝C"
@link issue -- material
@link issue -- fermentation
@link issue -- oxidation`,
    'layout=radial center=issue width=1000 height=590',
  );
  const layout = layoutDiagram(scene);
  const hub = layout.items.find((item) => item.id === 'issue')!;
  const needed = estimateCardSize(scene.items[0], true);
  assert.ok(hub.width >= needed.width);
  assert.equal(hub.width, needed.width);
});

test('radial cards stay centered after resize observers remeasure', () => {
  const { root, close } = render(`@diagram layout=radial center=problem
@item problem title="中心"
@item cost title="枝A"
@item time title="枝B"
@item quality title="枝C"
@item support title="枝D"
@link problem -- cost
@link problem -- time
@link problem -- quality
@link problem -- support
@enddiagram`);
  try {
    const hub = root.querySelector('[data-diagram-item="problem"]') as HTMLElement | null;
    const satellite = root.querySelector('[data-diagram-item="cost"]') as HTMLElement | null;
    assert.equal(hub?.style.left, '50%');
    assert.equal(hub?.style.top, '50%');
    assert.match(hub?.style.transform || '', /translate\(-50%,\s*-50%\)/);
    assert.match(satellite?.style.transform || '', /translate\(-50%,\s*-50%\)/);
    assert.equal(root.querySelectorAll('.diagram-edge').length, 4);
  } finally {
    close();
  }
});

test('radial keeps the center item inward of its satellites', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="中心"
@item cost title="枝A"
@item time title="枝B"
@item quality title="枝C"
@item support title="枝D"
@link problem -- cost
@link problem -- time
@link problem -- quality
@link problem -- support`,
      'layout=radial center=problem',
    ),
  );
  const hub = layout.items.find((item) => item.id === 'problem')!;
  const hubCenter = { x: hub.x + hub.width / 2, y: hub.y + hub.height / 2 };
  assert.ok(Math.abs(hubCenter.x - layout.width / 2) < 8);
  assert.ok(Math.abs(hubCenter.y - layout.height / 2) < 8);
  for (const item of layout.items.filter((entry) => entry.id !== 'problem')) {
    const point = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    assert.ok(Math.hypot(point.x - hubCenter.x, point.y - hubCenter.y) > 80);
  }
  assert.equal(layout.links.length, 4);
});

test('slide renderer mounts ring vertices, levels and undirected edges', () => {
  const { root, close } = render(triangle);
  try {
    assert.equal(root.querySelectorAll('.diagram-vertex').length, 3);
    assert.equal(
      root.querySelector('[data-diagram-item="access"] .diagram-badge')?.textContent,
      '1',
    );
    assert.equal(root.querySelector('[data-diagram-label="history"]')?.textContent, '遡って引ける');
    assert.ok(
      root.querySelector('[data-diagram-item="access"]')?.className.includes('diagram-level-high'),
    );
    assert.ok(
      root.querySelector('[data-diagram-item="history"]')?.className.includes('diagram-level-low'),
    );
    assert.equal(root.querySelectorAll('.diagram-edge').length, 3);
    assert.equal(root.querySelector('.diagram-edge')?.getAttribute('marker-end'), null);
  } finally {
    close();
  }
});

test('flow diagrams reuse canvas nodes and directed arrows', () => {
  const { root, close } = render(`@diagram layout=flow direction=right
@item problem title="始点" shape=card
@item cause title="中点" shape=card
@item solution title="終点" shape=card
@link problem -> cause label="ラベルA"
@link cause -> solution label="ラベルB"
@enddiagram`);
  try {
    assert.equal(root.querySelectorAll('.canvas-node').length, 3);
    assert.equal(root.querySelectorAll('.canvas-edge').length, 2);
    assert.match(root.querySelector('.canvas-edge')?.getAttribute('marker-end') || '', /^url\(#/);
    assert.match(root.querySelector('.canvas-edge-label')?.textContent || '', /ラベルA|ラベルB/);
  } finally {
    close();
  }
});

function centers(items: { x: number; y: number; width: number; height: number }[]) {
  return items.map((item) => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 }));
}

function assertRegularPolygon(
  items: { x: number; y: number; width: number; height: number }[],
  count: number,
) {
  assert.equal(items.length, count);
  const points = centers(items);
  const cx = points.reduce((sum, point) => sum + point.x, 0) / count;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / count;
  const radii = points.map((point) => Math.hypot(point.x - cx, point.y - cy));
  for (const radius of radii) assert.ok(Math.abs(radius - radii[0]) < 1e-6);
  const chords = points.map((point, i) => {
    const next = points[(i + 1) % count];
    return Math.hypot(point.x - next.x, point.y - next.y);
  });
  for (const chord of chords) assert.ok(Math.abs(chord - chords[0]) < 1e-6);
}

function parseLine(path: string) {
  const match = /M\s+([-\d.]+)\s+([-\d.]+)\s+L\s+([-\d.]+)\s+([-\d.]+)/.exec(path);
  assert.ok(match, path);
  return { x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) };
}

const annotatedTriangle = `@item clear title="節点A" badge=1 level=high
少し長い本文を外側に置く。
@item concise title="節点B" badge=2 level=high
少し長い本文を外側に置く。
@item unique title="節点C" badge=3 level=high
少し長い本文を外側に置く。`;

test('ring note attributes default to inline and opt into outside notes', () => {
  const inline = parseDiagram(
    `@item a title="節点A"
@item b title="節点B"
@item c title="節点C"`,
    'layout=ring',
  );
  assert.equal(inline.options.geometry, 'regular');
  assert.equal(inline.options.noteMode, 'inline');
  assert.equal(inline.options.noteStyle, 'plain');
  assert.equal(inline.options.noteLink, 'none');
  assert.equal(inline.options.height, 500);
  assert.equal(inline.items[0].noteSide, 'auto');

  const outside = parseDiagram(annotatedTriangle, 'layout=ring connect=none note=outside');
  assert.equal(outside.options.noteMode, 'outside');
  assert.equal(outside.options.noteStyle, 'plain');
  assert.equal(outside.options.noteLink, 'arrow');
  assert.equal(outside.options.height, 620);
  assert.equal(outside.options.geometry, 'regular');
});

test('ring keeps a regular polygon for 3 to 6 vertices, even with long notes', () => {
  const titles = ['節点A', '節点B', '節点C', '節点D', '節点E', '節点F'];
  for (const count of [3, 4, 5, 6]) {
    const source = titles
      .slice(0, count)
      .map(
        (title, i) =>
          `@item n${i} title="${title}"\n長い日本語の補足を外側に置いても頂点は動かない。`,
      )
      .join('\n');
    const plain = layoutDiagram(parseDiagram(source, 'layout=ring connect=none'));
    const noted = layoutDiagram(parseDiagram(source, 'layout=ring connect=none note=outside'));
    assertRegularPolygon(plain.items, count);
    assertRegularPolygon(noted.items, count);
  }
});

test('inline ring labels sit outside every vertex', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item a title="節点A"
@item b title="節点B"
@item c title="節点C"`,
      'layout=ring connect=cycle',
    ),
  );
  assert.equal(layout.overflow, false);
  for (const vertex of layout.items) {
    assert.ok(vertex.label);
    assert.equal(overlaps(vertex, vertex.label, 0), false);
  }
});

test('a ring that is too short reports overflow instead of covering a vertex with its label', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item a title="節点A"
@item b title="節点B"
@item c title="節点C"`,
      'layout=ring connect=cycle width=560 height=260',
    ),
  );
  assert.equal(layout.overflow, true);
});

test('outside notes sit on the outward rays with diagonal arrows from the lower vertices', () => {
  const layout = layoutDiagram(
    parseDiagram(annotatedTriangle, 'layout=ring connect=none note=outside note-link=arrow'),
  );
  assert.equal(layout.overflow, false);
  assert.equal(layout.links.length, 0);
  assert.equal(layout.noteLinks.length, 3);
  assert.ok(layout.noteLinks.every((link) => link.kind === 'arrow'));
  assertRegularPolygon(layout.items, 3);

  const [top, left, right] = layout.items;
  const origin = { x: layout.width / 2, y: layout.height / 2 };
  const topCenter = { x: top.x + top.width / 2, y: top.y + top.height / 2 };
  const leftCenter = { x: left.x + left.width / 2, y: left.y + left.height / 2 };
  const rightCenter = { x: right.x + right.width / 2, y: right.y + right.height / 2 };
  assert.ok(topCenter.y < leftCenter.y && topCenter.y < rightCenter.y);
  assert.ok(leftCenter.x < origin.x);
  assert.ok(rightCenter.x > origin.x);

  const topNote = {
    x: top.label!.x + top.label!.width / 2,
    y: top.label!.y + top.label!.height / 2,
  };
  const leftNote = {
    x: left.label!.x + left.label!.width / 2,
    y: left.label!.y + left.label!.height / 2,
  };
  const rightNote = {
    x: right.label!.x + right.label!.width / 2,
    y: right.label!.y + right.label!.height / 2,
  };
  assert.ok(topNote.y < topCenter.y);
  assert.ok(leftNote.x < leftCenter.x && leftNote.y > leftCenter.y);
  assert.ok(rightNote.x > rightCenter.x && rightNote.y > rightCenter.y);
  assert.ok(
    Math.hypot(topNote.x - origin.x, topNote.y - origin.y) >
      Math.hypot(topCenter.x - origin.x, topCenter.y - origin.y),
  );

  const byId = Object.fromEntries(
    layout.noteLinks.map((link) => [link.itemId, parseLine(link.path)]),
  );
  for (const [item, line] of [
    [top, byId.clear],
    [left, byId.concise],
    [right, byId.unique],
  ] as const) {
    const point = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    assert.ok(Math.abs(Math.hypot(line.x1 - point.x, line.y1 - point.y) - VERTEX_R) < 1.5);
  }
  assert.ok(byId.clear.y2 < byId.clear.y1);
  assert.ok(byId.concise.x2 < byId.concise.x1 && byId.concise.y2 > byId.concise.y1);
  assert.ok(byId.unique.x2 > byId.unique.x1 && byId.unique.y2 > byId.unique.y1);
});

test('note-link switches between none, leader and arrow', () => {
  const none = layoutDiagram(
    parseDiagram(annotatedTriangle, 'layout=ring connect=none note=outside note-link=none'),
  );
  const leader = layoutDiagram(
    parseDiagram(annotatedTriangle, 'layout=ring connect=none note=outside note-link=leader'),
  );
  assert.equal(none.noteLinks.length, 0);
  assert.equal(leader.noteLinks.length, 3);
  assert.ok(leader.noteLinks.every((link) => link.kind === 'leader'));
});

test('long Japanese notes wrap instead of staying on one line', () => {
  const size = estimateNoteSize(
    'これは折り返しを確認するための長い日本語の本文です。一行に収まらず高さが増えること。',
    220,
  );
  assert.ok(size.height > 40);
  assert.ok(size.width <= 220);
});

test('slide renderer mounts frameless outside notes and a separate note-link layer', () => {
  const { root, close } = render(`@diagram layout=ring connect=none note=outside
${annotatedTriangle}
@enddiagram`);
  try {
    assert.equal(root.querySelectorAll('.diagram-vertex').length, 3);
    assert.equal(root.querySelectorAll('.diagram-note').length, 3);
    assert.equal(root.querySelectorAll('.diagram-label').length, 0);
    assert.equal(root.querySelectorAll('.diagram-note-link').length, 3);
    assert.match(
      root.querySelector('.diagram-note-link')?.getAttribute('marker-end') || '',
      /^url\(#/,
    );
    assert.equal(root.querySelector('.diagram-edge'), null);
    assert.match(root.querySelector('[data-diagram-note="clear"]')?.textContent || '', /節点A/);
    assert.match(root.querySelector('[data-diagram-note="clear"]')?.textContent || '', /長い本文/);
    assert.equal(
      root.querySelector('.diagram-note')?.className.includes('diagram-note-plain'),
      true,
    );
  } finally {
    close();
  }
});

test('diagram reports structural errors', () => {
  for (const [source, pattern] of [
    ['@diagram\n@item a title="A"\n', /閉じる/],
    ['@diagram\n@enddiagram', /@item/],
    ['@diagram\n@item a\n本文\n@enddiagram', /title/],
    ['@diagram layout=tree\n@item a title="A"\n@enddiagram', /@canvas/],
    ['@diagram\n@item a title="A"\n@link a -- missing\n@enddiagram', /接続先/],
  ] as const) {
    const { root, close } = render(source);
    try {
      assert.match(root.querySelector('.block-error')?.textContent ?? '', pattern);
    } finally {
      close();
    }
  }
});

test('radial links follow center rays and meet rounded card outlines', async () => {
  const { rimPoint } = await import('../src/diagram/geometry.ts');
  const scene = parseDiagram(
    '@item hub title="中心"\n@item a title="枝A"\n@item b title="枝B"\n@item c title="枝C"\n@link hub -- a\n@link hub -- b\n@link hub -- c',
    'layout=radial center=hub',
  );
  const layout = layoutDiagram(scene);
  for (const link of layout.links) {
    const from = layout.items.find((item) => item.id === link.from)!;
    const to = layout.items.find((item) => item.id === link.to)!;
    const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    const n = link.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    for (const [x, y] of [
      [n[0], n[1]],
      [n[2], n[3]],
    ])
      assert.ok(Math.abs((x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)) < 0.001);
  }
  const box = { x: 0, y: 0, width: 200, height: 80 };
  const point = rimPoint(box, { x: 300, y: 110 }, 'capsule');
  assert.ok(Math.abs(Math.hypot(point.x - 160, point.y - 40) - 40) < 0.001);
});

test('dense radial layouts preserve separation instead of clamping cards into each other', () => {
  const scene = parseDiagram(
    '@item hub title="中心"\n' +
      Array.from({ length: 10 }, (_, i) => `@item n${i} title="観察の入口${i}"`).join('\n'),
    'layout=radial center=hub width=1000 height=580',
  );
  const layout = layoutDiagram(scene, {
    cards: scene.items.map(() => ({ width: 240, height: 100 })),
  });
  for (let i = 0; i < layout.items.length; i++)
    for (let j = 0; j < i; j++) {
      const a = layout.items[i],
        b = layout.items[j];
      assert.ok(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      );
    }
  assert.ok(layout.fitScale! <= 1);
  if (layout.fitScale! < 18 / 27) assert.equal(layout.overflowReason, 'read');
});

test('rings and radials in a panel fill a nested frame unless size is authored', () => {
  const nested = parseDiagram(
    '@item a title="節点A"\n@item b title="節点B"\n@item c title="節点C"',
    `layout=ring connect=cycle width=${NESTED_DIAGRAM_FRAME.width} height=${NESTED_DIAGRAM_FRAME.height}`,
  );
  assert.equal(layoutDiagram(nested).overflow, false);
  const { root, close } = render(`@grid columns=2
@panel
@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpanel
@panel
@diagram layout=radial center=hub width=400 height=320
@item hub title="中心"
@item a title="枝A"
@enddiagram
@endpanel
@endgrid`);
  try {
    const diagrams = [...root.querySelectorAll('.milo-diagram')] as unknown as HTMLElement[];
    assert.equal(diagrams[0].classList.contains('diagram-fill-frame'), true);
    assert.equal(
      diagrams[0].style.getPropertyValue('--diagram-display-width'),
      `${NESTED_DIAGRAM_FRAME.width}px`,
    );
    assert.equal(diagrams[1].classList.contains('diagram-fill-frame'), false);
    assert.equal(diagrams[1].style.getPropertyValue('--diagram-display-width'), '400px');
  } finally {
    close();
  }
});

test('flow exposes readable node widths and compact gaps without changing defaults', () => {
  const source = '@item a title="課題"\n@item b title="解決策"\n@link a -> b';
  const original = parseDiagram(source, 'layout=flow');
  assert.equal(original.options.gap, 48);
  assert.equal(original.options.nodeWidth, undefined);
  const compact = parseDiagram(source, 'layout=flow gap=24 node-width=220');
  assert.equal(compact.options.gap, 24);
  assert.equal(compact.options.nodeWidth, 220);
  assert.throws(() => parseDiagram(source, 'layout=flow gap=-1'), /gap/);
  assert.throws(() => parseDiagram(source, 'layout=flow node-width=100'), /node-width/);
  assert.throws(() => parseDiagram(source, 'layout=ring gap=24'), /layout=flow/);
});
