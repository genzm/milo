import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { layoutDiagram, parseDiagram, resolvedLinks } from '../src/diagram.ts';
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
    `@item a title="問題"
@item b title="原因"
@item c title="打ち手"
@link a -- b
@link b -> c label="選択"
@link a <-> c label="影響"`,
    'layout=flow direction=right',
  );
  assert.equal(scene.links[0].kind, 'undirected');
  assert.equal(scene.links[1].kind, 'forward');
  assert.equal(scene.links[1].label, '選択');
  assert.equal(scene.links[2].kind, 'both');
});

test('ring places three items as a triangle and four as a diamond', () => {
  const three = layoutDiagram(
    parseDiagram(
      `@item a title="品質"
@item b title="速度"
@item c title="コスト"`,
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
      `@item a title="品質"
@item b title="速度"
@item c title="コスト"
@item d title="安全性"`,
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

test('radial keeps the center item inward of its satellites', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="顧客の課題"
@item cost title="コスト"
@item time title="時間"
@item quality title="品質"
@item support title="サポート"
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
@item problem title="問題" shape=card
@item cause title="原因" shape=card
@item solution title="打ち手" shape=card
@link problem -> cause label="分析"
@link cause -> solution label="選択"
@enddiagram`);
  try {
    assert.equal(root.querySelectorAll('.canvas-node').length, 3);
    assert.equal(root.querySelectorAll('.canvas-edge').length, 2);
    assert.match(root.querySelector('.canvas-edge')?.getAttribute('marker-end') || '', /^url\(#/);
    assert.match(root.querySelector('.canvas-edge-label')?.textContent || '', /分析|選択/);
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
