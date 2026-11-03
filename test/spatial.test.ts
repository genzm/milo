import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { DIAGRAM_FRAME, layoutDiagram, parseDiagram, usesSpatialRadial } from '../src/diagram.ts';
import { clusterHaloContains, leaderPath, overlaps } from '../src/diagram/geometry.ts';
import { textBox } from '../src/diagram/labels.ts';
import { semanticToDisplay, spatialFrame, unreadablySmall } from '../src/diagram/spatial.ts';
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

function centerOf(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('classic radial stays on the default path when side and distance are omitted', () => {
  const scene = parseDiagram(
    `@item problem title="顧客の課題"
@item cost title="コスト"
@item time title="時間"`,
    'layout=radial center=problem',
  );
  assert.equal(usesSpatialRadial(scene), false);
  assert.equal(scene.options.guide, 'none');
});

test('radial side and distance keep direction and near < mid < far', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="顧客の課題"
@item nearL title="近い" side=left distance=near
@item midR title="中くらい" side=right distance=mid
@item farT title="遠い" side=top distance=far
@link problem -- nearL
@link problem -- midR
@link problem -- farT`,
      'layout=radial center=problem',
    ),
  );
  const hub = centerOf(layout.items.find((item) => item.id === 'problem')!);
  const near = centerOf(layout.items.find((item) => item.id === 'nearL')!);
  const mid = centerOf(layout.items.find((item) => item.id === 'midR')!);
  const far = centerOf(layout.items.find((item) => item.id === 'farT')!);
  assert.ok(near.x < hub.x);
  assert.ok(mid.x > hub.x);
  assert.ok(far.y < hub.y);
  const nearDist = Math.hypot(near.x - hub.x, near.y - hub.y);
  const midDist = Math.hypot(mid.x - hub.x, mid.y - hub.y);
  const farDist = Math.hypot(far.x - hub.x, far.y - hub.y);
  assert.ok(nearDist < midDist);
  assert.ok(midDist < farDist);
  assert.ok(Math.abs(midDist / nearDist - 0.72 / 0.5) < 0.08);
  assert.ok(Math.abs(farDist / nearDist - 1 / 0.5) < 0.08);
  assert.equal(layout.links.length, 3);
});

test('slide 14 keeps a shared near < mid < far scale across axes', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="顧客の課題" level=high
@item cost title="コスト" side=top distance=far
@item time title="時間" side=left distance=near
@item quality title="品質" side=bottom distance=far
@item support title="サポート" side=right distance=mid
@link problem -- cost
@link problem -- time
@link problem -- quality
@link problem -- support`,
      'layout=radial center=problem',
    ),
  );
  const hub = centerOf(layout.items.find((item) => item.id === 'problem')!);
  const dist = (id: string) => {
    const point = centerOf(layout.items.find((item) => item.id === id)!);
    return Math.hypot(point.x - hub.x, point.y - hub.y);
  };
  assert.ok(dist('time') < dist('support'));
  assert.ok(dist('support') < dist('cost'));
  assert.ok(Math.abs(dist('cost') - dist('quality')) < 1);
  const hubBox = layout.items.find((item) => item.id === 'problem')!;
  const timeBox = layout.items.find((item) => item.id === 'time')!;
  assert.ok(timeBox.x + timeBox.width <= hubBox.x + 1);
  assert.ok((layout.fitScale ?? 1) <= 1);
  assert.ok((layout.fitScale ?? 1) > 0.5);
});

test('same-side radial uses card size and warns when cards cannot fan out', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="中心"
@item a title="非常に長い原因カードA" side=top distance=near
@item b title="非常に長い原因カードB" side=top distance=near
@item c title="非常に長い原因カードC" side=top distance=near
@item d title="非常に長い原因カードD" side=top distance=near`,
      'layout=radial center=problem',
    ),
  );
  const hub = centerOf(layout.items.find((item) => item.id === 'problem')!);
  const cards = ['a', 'b', 'c', 'd'].map((id) => layout.items.find((item) => item.id === id)!);
  for (const card of cards) {
    assert.ok(centerOf(card).y < hub.y, `${card.id} left the top side`);
  }
  const xs = cards.map((card) => centerOf(card).x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 20);
  assert.equal(layout.overflow, true);
  assert.equal(layout.overflowReason, 'overlap');
  const { root, close } = render(`@diagram layout=radial center=problem
@item problem title="中心"
@item a title="非常に長い原因カードA" side=top distance=near
@item b title="非常に長い原因カードB" side=top distance=near
@item c title="非常に長い原因カードC" side=top distance=near
@item d title="非常に長い原因カードD" side=top distance=near
@enddiagram`);
  try {
    assert.equal(
      root.querySelector('.milo-diagram')?.getAttribute('data-diagram-overflow'),
      'true',
    );
    assert.match(root.querySelector('.diagram-overflow-hint')?.textContent || '', /重なって/);
  } finally {
    close();
  }
});

test('same-side radial items stay on that side and spread apart', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="中心"
@item a title="上1" side=top distance=mid
@item b title="上2" side=top distance=mid
@link problem -- a
@link problem -- b`,
      'layout=radial center=problem',
    ),
  );
  const hub = centerOf(layout.items.find((item) => item.id === 'problem')!);
  const a = centerOf(layout.items.find((item) => item.id === 'a')!);
  const b = centerOf(layout.items.find((item) => item.id === 'b')!);
  assert.ok(a.y < hub.y && b.y < hub.y);
  assert.ok(Math.abs(a.x - b.x) > 8);
});

test('field places items by semantic XY and discrete aliases', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item a title="施策A" x=-0.7 y=0.6
@item b title="施策B" x=right y=bottom
@item c title="原点" x=0 y=0`,
      'layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"',
    ),
  );
  const a = centerOf(layout.items.find((item) => item.id === 'a')!);
  const b = centerOf(layout.items.find((item) => item.id === 'b')!);
  const c = centerOf(layout.items.find((item) => item.id === 'c')!);
  assert.ok(a.x < c.x && a.y < c.y);
  assert.ok(b.x > c.x && b.y > c.y);
  assert.ok(layout.guides.some((guide) => guide.kind === 'axis'));
  assert.match(layout.guides.map((guide) => guide.text).join(' '), /内部/);
  const expected = semanticToDisplay(
    { x: -0.7, y: 0.6 },
    spatialFrame(layout.width, layout.height),
  );
  assert.ok(Math.hypot(a.x - expected.x, a.y - expected.y) < 8);
});

test('field keeps data points fixed while labels can move', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item a title="とても長い日本語のラベルA" x=0.1 y=0.1
@item b title="とても長い日本語のラベルB" x=0.12 y=0.08`,
      'layout=field',
    ),
  );
  const a = layout.items.find((item) => item.id === 'a')!;
  const b = layout.items.find((item) => item.id === 'b')!;
  assert.ok(Math.abs(centerOf(a).x - centerOf(b).x) < 20);
  assert.ok(a.label && b.label);
  assert.ok(
    Math.hypot(
      centerOf(a.label).x - centerOf(b.label).x,
      centerOf(a.label).y - centerOf(b.label).y,
    ) > 4,
  );
});

test('field omits nearby leaders and keeps the marker size', () => {
  const lonely = layoutDiagram(parseDiagram(`@item a title="施策A" x=-0.7 y=0.6`, 'layout=field'));
  assert.equal(lonely.noteLinks.length, 0);
  assert.equal(
    leaderPath({ x: 100, y: 100, width: 12, height: 12 }, { x: 118, y: 92, width: 40, height: 20 }),
    null,
  );
  assert.ok(
    leaderPath({ x: 100, y: 100, width: 12, height: 12 }, { x: 160, y: 70, width: 40, height: 20 }),
  );
  const { root, close } = render(`@diagram layout=field
@item a title="施策A" x=-0.7 y=0.6
@enddiagram`);
  try {
    const dot = root.querySelector('.diagram-dot');
    assert.ok(dot);
    assert.ok(!String(dot.getAttribute('style') || '').includes('max-content'));
  } finally {
    close();
  }
});

test('zones and clusters decorate field space without moving items', () => {
  const source = `@zone internal label="内部・長期" x="-1:0" y="0:1"
@cluster business title="事業" tone=accent
@item a title="コスト" x=-0.5 y=0.6 cluster=business
@item c title="時間" x=-0.4 y=-0.3 cluster=business
@item b title="品質" x=0.6 y=0.5 cluster=product`;
  const plain = layoutDiagram(parseDiagram(source, 'layout=field guide=axes'));
  const halo = layoutDiagram(parseDiagram(source, 'layout=field guide=axes cluster-region=halo'));
  const a = centerOf(plain.items.find((item) => item.id === 'a')!);
  const aHalo = centerOf(halo.items.find((item) => item.id === 'a')!);
  assert.equal(Math.round(a.x), Math.round(aHalo.x));
  assert.equal(Math.round(a.y), Math.round(aHalo.y));
  assert.equal(plain.regions.filter((region) => region.kind === 'zone').length, 1);
  assert.equal(plain.regions.filter((region) => region.kind === 'cluster').length, 0);
  const haloMarks = halo.regions.filter((region) => region.kind === 'cluster');
  assert.equal(haloMarks.length, 2);
  const business = haloMarks.find((region) => region.id === 'business')!;
  assert.ok(business.path);
  assert.match(business.path || '', /A /);
  assert.equal((business.marks || []).length, 0);
  const time = centerOf(halo.items.find((item) => item.id === 'c')!);
  assert.ok(time.y < business.box.y + business.box.height);
  assert.ok(time.y > business.box.y);
  assert.deepEqual(
    plain.legend.map((entry) => entry.id),
    ['business', 'product'],
  );
  const zone = plain.regions.find((region) => region.id === 'internal')!;
  assert.ok(zone.box.x < a.x && a.x < zone.box.x + zone.box.width);
  assert.ok(zone.box.y < a.y && a.y < zone.box.y + zone.box.height);
});

test('field zone and axis labels stay clear of each other', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@zone internal label="内部・長期" x="-1:0" y="0:1"
@zone external label="外部・長期" x="0:1" y="0:1"
@item a title="コスト" x=-0.6 y=0.55 cluster=business
@item c title="品質" x=0.55 y=0.65 cluster=product`,
      'layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"',
    ),
  );
  const boxes = [
    ...layout.regions
      .filter((region) => region.kind === 'zone' && region.labelBox)
      .map((region) => region.labelBox!),
    ...layout.guides
      .filter((guide) => guide.text)
      .map((guide) =>
        textBox(guide.text || '', guide.x || 0, guide.y || 0, guide.anchor || 'middle'),
      ),
    ...layout.items.flatMap((item) => (item.label ? [item.label] : [])),
  ];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.equal(overlaps(boxes[i], boxes[j], 0), false, `${i} overlaps ${j}`);
    }
  }
});

test('field renderer mounts dots, axes, zones and a cluster legend', () => {
  const { root, close } =
    render(`@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期" cluster-region=halo
@zone internal label="内部・長期" x="-1:0" y="0:1"
@item a title="コスト" x=-0.5 y=0.6 cluster=business
@item b title="品質" x=0.6 y=-0.4 cluster=product
@enddiagram`);
  try {
    assert.equal(root.querySelectorAll('.diagram-dot').length, 2);
    assert.ok(
      root.querySelector('[data-diagram-item="b"]')?.classList.contains('is-cluster-muted'),
    );
    assert.ok(root.querySelector('.diagram-legend-item.is-muted'));
    assert.equal(root.querySelectorAll('.diagram-field-label').length, 2);
    assert.ok(root.querySelector('.diagram-axis'));
    assert.ok(root.querySelector('.diagram-region.is-zone'));
    assert.ok(root.querySelector('path.diagram-region.is-cluster'));
    assert.match(
      root.querySelector('.diagram-legend')?.textContent || '',
      /business|プロダクト|product/,
    );
    assert.equal(root.querySelector('.diagram-edge'), null);
  } finally {
    close();
  }
});

test('field cards keep the title on the card and skip the floating label', () => {
  const layout = layoutDiagram(
    parseDiagram(
      `@item a title="酸化防止" x=0.65 y=0.70 shape=card cluster=focus
@item b title="ラベル変更" x=0.40 y=-0.65 shape=card
@item c title="点" x=-0.5 y=0.4`,
      'layout=field',
    ),
  );
  const card = layout.items.find((item) => item.id === 'a')!;
  const mixed = layout.items.find((item) => item.id === 'c')!;
  assert.equal(card.kind, 'card');
  assert.equal(card.label, undefined);
  assert.ok(!layout.noteLinks.some((link) => link.itemId === 'a' || link.itemId === 'b'));
  assert.ok(card.width > 40);
  assert.equal(mixed.kind, 'dot');
  assert.ok(mixed.label);
  const { root, close } = render(`@diagram layout=field
@cluster focus title="施策候補" tone=accent
@item a title="酸化防止" x=0.65 y=0.70 shape=card cluster=focus
@item b title="ラベル変更" x=0.40 y=-0.65 shape=card
@item c title="点" x=-0.5 y=0.4
@enddiagram`);
  try {
    assert.equal(root.querySelectorAll('.diagram-card').length, 2);
    assert.equal(root.querySelectorAll('.diagram-field-label').length, 1);
    assert.equal(
      root.querySelector('[data-diagram-item="a"] .diagram-card-title')?.textContent,
      '酸化防止',
    );
    assert.equal(root.querySelectorAll('[data-diagram-label="a"]').length, 0);
    assert.ok(
      root.querySelector('[data-diagram-item="a"]')?.classList.contains('is-cluster-accent'),
    );
    assert.equal(root.querySelector('[data-diagram-item="c"] .diagram-card-title'), null);
    assert.equal(root.querySelector('[data-diagram-label="c"]')?.textContent, '点');
  } finally {
    close();
  }
});

test('each diagram layout can set its own display frame', () => {
  const field = parseDiagram('@item a title="A" x=0 y=0', 'layout=field');
  const radial = parseDiagram('@item a title="A"', 'layout=radial');
  const flow = parseDiagram('@item a title="A"', 'layout=flow');
  const wide = parseDiagram('@item a title="A" x=0 y=0', 'layout=field width=1400 height=700');
  assert.equal(field.options.width, DIAGRAM_FRAME.field.width);
  assert.equal(field.options.height, DIAGRAM_FRAME.field.height);
  assert.equal(radial.options.width, DIAGRAM_FRAME.radial.width);
  assert.equal(flow.options.width, DIAGRAM_FRAME.flow.width);
  assert.equal(DIAGRAM_FRAME.flow.width, 1280);
  assert.equal(wide.options.width, 1400);
  const { root, close } = render(`@diagram layout=field width=1400 height=700
@item a title="施策A" x=-0.7 y=0.6
@enddiagram`);
  try {
    const diagram = root.querySelector('.milo-diagram') as unknown as HTMLElement;
    assert.equal(diagram.style.getPropertyValue('--diagram-display-width'), '1400px');
    assert.equal(diagram.style.getPropertyValue('--diagram-display-height'), '700px');
  } finally {
    close();
  }
});

test('cluster halo drops a hull that swallows another group point', () => {
  assert.equal(
    clusterHaloContains({ x: 0, y: 0 }, [
      { x: -80, y: 0 },
      { x: 80, y: 0 },
    ]),
    true,
  );
  assert.equal(
    clusterHaloContains({ x: 0, y: 80 }, [
      { x: -80, y: 0 },
      { x: 80, y: 0 },
    ]),
    false,
  );
  const layout = layoutDiagram(
    parseDiagram(
      `@cluster business title="事業"
@cluster product title="プロダクト"
@item a title="コスト" x=-0.8 y=0.7 cluster=business
@item b title="時間" x=0.8 y=0.7 cluster=business
@item c title="品質" x=0 y=0.7 cluster=product`,
      'layout=field cluster-region=halo',
    ),
  );
  const clusters = layout.regions.filter((region) => region.kind === 'cluster');
  assert.equal(
    clusters.some((region) => region.id === 'business'),
    false,
  );
  assert.equal(
    clusters.some((region) => region.id === 'product'),
    true,
  );
  assert.equal(layout.overflow, true);
});

test('shrunk radial warns when titles become unreadable', () => {
  assert.equal(unreadablySmall(0.6), true);
  assert.equal(unreadablySmall(0.7), false);
  const layout = layoutDiagram(
    parseDiagram(
      `@item problem title="顧客の課題"
@item a title="とても長いカードのタイトルです" side=top distance=far
@item b title="とても長いカードのタイトルです" side=right distance=far
@item c title="とても長いカードのタイトルです" side=bottom distance=far
@item d title="とても長いカードのタイトルです" side=left distance=far`,
      'layout=radial center=problem width=360 height=200',
    ),
  );
  assert.ok((layout.fitScale ?? 1) * 27 < 18);
  assert.equal(layout.overflow, true);
  assert.equal(layout.overflowReason, 'read');
  const { root, close } = render(`@diagram layout=radial center=problem width=360 height=200
@item problem title="顧客の課題"
@item a title="とても長いカードのタイトルです" side=top distance=far
@item b title="とても長いカードのタイトルです" side=right distance=far
@item c title="とても長いカードのタイトルです" side=bottom distance=far
@item d title="とても長いカードのタイトルです" side=left distance=far
@enddiagram`);
  try {
    assert.match(root.querySelector('.diagram-overflow-hint')?.textContent || '', /読めません/);
  } finally {
    close();
  }
});

test('field reports missing coordinates and keeps ring notes working', () => {
  const { root, close } = render(`@diagram layout=field
@item a title="欠落"
@enddiagram`);
  try {
    assert.match(root.querySelector('.block-error')?.textContent || '', /x と y/);
  } finally {
    close();
  }
});
