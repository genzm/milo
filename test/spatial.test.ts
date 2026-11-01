import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { layoutDiagram, parseDiagram, usesSpatialRadial } from '../src/diagram.ts';
import { semanticToDisplay, spatialFrame } from '../src/diagram/spatial.ts';
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
  assert.ok(Math.hypot(near.x - hub.x, near.y - hub.y) < Math.hypot(mid.x - hub.x, mid.y - hub.y));
  const hubBox = layout.items.find((item) => item.id === 'problem')!;
  const nearBox = layout.items.find((item) => item.id === 'nearL')!;
  const farBox = layout.items.find((item) => item.id === 'farT')!;
  assert.ok(nearBox.x + nearBox.width <= hubBox.x + 1);
  assert.ok(farBox.y >= 0);
  assert.equal(layout.links.length, 3);
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

test('zones and clusters decorate field space without moving items', () => {
  const source = `@zone internal label="内部・長期" x="-1:0" y="0:1"
@cluster business title="事業" tone=accent
@item a title="コスト" x=-0.5 y=0.6 cluster=business
@item b title="品質" x=0.6 y=0.5 cluster=product`;
  const plain = layoutDiagram(parseDiagram(source, 'layout=field guide=axes'));
  const halo = layoutDiagram(parseDiagram(source, 'layout=field guide=axes cluster-region=halo'));
  const a = centerOf(plain.items.find((item) => item.id === 'a')!);
  const aHalo = centerOf(halo.items.find((item) => item.id === 'a')!);
  assert.equal(Math.round(a.x), Math.round(aHalo.x));
  assert.equal(Math.round(a.y), Math.round(aHalo.y));
  assert.equal(plain.regions.filter((region) => region.kind === 'zone').length, 1);
  assert.ok(halo.regions.some((region) => region.kind === 'cluster'));
  assert.deepEqual(
    plain.legend.map((entry) => entry.id),
    ['business', 'product'],
  );
  const zone = plain.regions.find((region) => region.id === 'internal')!;
  assert.ok(zone.box.x < a.x && a.x < zone.box.x + zone.box.width);
  assert.ok(zone.box.y < a.y && a.y < zone.box.y + zone.box.height);
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
    assert.equal(root.querySelectorAll('.diagram-field-label').length, 2);
    assert.ok(root.querySelector('.diagram-axis'));
    assert.ok(root.querySelector('.diagram-region.is-zone'));
    assert.match(
      root.querySelector('.diagram-legend')?.textContent || '',
      /business|プロダクト|product/,
    );
    assert.equal(root.querySelector('.diagram-edge'), null);
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
