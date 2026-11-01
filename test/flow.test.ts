import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { canvasDiagnostics, canvasHeight, layoutCanvas, parseCanvas } from '../src/canvas.ts';
import { parseDiagram } from '../src/diagram.ts';
import { layoutFlowFromCanvas } from '../src/flow/layout.ts';
import { estimateHeightAtWidth } from '../src/flow/measure.ts';
import { FLOW } from '../src/flow/types.ts';
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

test('diagram flow keeps an explicit height and treats omitted height as auto', () => {
  const fixed = parseDiagram(
    `@item a title="入力"
@item b title="実行"
@link a -> b`,
    'layout=flow height=480',
  );
  assert.equal(fixed.options.autoHeight, false);
  assert.equal(fixed.options.height, 480);

  const omitted = parseDiagram(`@item a title="入力"`, 'layout=flow');
  assert.equal(omitted.options.autoHeight, true);

  const explicitAuto = parseDiagram(`@item a title="入力"`, 'layout=flow height=auto');
  assert.equal(explicitAuto.options.autoHeight, true);

  assert.throws(() => parseDiagram(`@item a title="A"`, 'layout=ring height=auto'), /layout=flow/);
});

test('fixed flow height stays 480 and reports when nodes leave the frame', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n-->\n@node b\n### 分析\n-->\n@node c\n### 判断\n-->\n@node d\n### 実行`,
    'layout=flow direction=down height=480',
  );
  assert.equal(scene.options.autoHeight, false);
  assert.equal(canvasHeight(scene, [60, 60, 60, 60]), 480);
  const layout = layoutFlowFromCanvas(scene, [60, 60, 60, 60]);
  assert.equal(layout.height, 480);
  assert.equal(
    layout.diagnostics.some((item) => item.code === 'FRAME_OVERFLOW'),
    false,
  );

  const tight = parseCanvas(
    `@node a\n### 入力\n-->\n@node b\n### 分析\n-->\n@node c\n### 判断\n-->\n@node d\n### 実行`,
    'layout=flow direction=down height=120',
  );
  const overflow = layoutFlowFromCanvas(tight, [80, 80, 80, 80]);
  assert.equal(overflow.height, 120);
  assert.ok(overflow.diagnostics.some((item) => item.code === 'FRAME_OVERFLOW'));
});

test('diagram height=480 is not overwritten by canvas auto-height', () => {
  const { root, close } = render(`@diagram layout=flow direction=right height=480
@item a title="入力"
@item b title="実行"
@link a -> b
@enddiagram`);
  try {
    const canvas = root.querySelector('.milo-canvas') as unknown as HTMLElement;
    assert.ok(canvas);
    assert.equal(canvas.style.aspectRatio.replace(/\s/g, ''), '1280/480');
    assert.equal(canvas.style.getPropertyValue('--diagram-display-width'), '1280px');
    assert.ok(canvas.classList.contains('diagram-layout-flow'));
  } finally {
    close();
  }
});

test('unreadable fixed-height flow still reports a diagnostic instead of succeeding silently', () => {
  const scene = parseCanvas('A\n-->\nB', 'height=40');
  const diagnostics = canvasDiagnostics(scene, [80, 90]);
  assert.ok(
    diagnostics.some((item) => item.code === 'FRAME_OVERFLOW' || item.code === 'TEXT_OVERFLOW'),
  );
  const { root, close } = render(`@canvas height=40
A
-->
B
@endcanvas`);
  try {
    assert.equal(
      root.querySelector('.milo-canvas')?.getAttribute('data-canvas-overflow') !== null,
      true,
    );
    assert.match(
      root.querySelector('.canvas-overflow-hint')?.textContent || '',
      /収まりません|切れています|余白が足りません/,
    );
  } finally {
    close();
  }
});

test('four serial flow nodes fit without clipping Japanese titles', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n-->\n@node b\n### 分析\n-->\n@node c\n### 判断\n-->\n@node d\n### 実行`,
    'layout=flow direction=right width=1000',
  );
  const layout = layoutFlowFromCanvas(scene);
  const frames = [...layout.nodeFrames.values()];
  assert.equal(frames.length, 4);
  for (const frame of frames) {
    assert.ok(frame.width >= 180 && frame.width <= 360);
    assert.ok(frame.x >= 0 && frame.x + frame.width <= 1000 + 1);
    assert.ok(frame.y >= 0);
  }
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  assert.ok(right <= 1000 + 1);
  assert.equal(
    layout.diagnostics.some(
      (item) => item.code === 'TEXT_OVERFLOW' || item.code === 'FRAME_OVERFLOW',
    ),
    false,
  );
});

test('long Japanese titles get a wider node than short ones', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n-->\n@node b\n### 顧客からの問い合わせ内容を分類し優先度をつけて担当へ渡す\n-->\n@node c\n### 実行`,
    'layout=flow direction=right',
  );
  const layout = layoutFlowFromCanvas(scene);
  const a = layout.nodeFrames.get('a')!;
  const b = layout.nodeFrames.get('b')!;
  const c = layout.nodeFrames.get('c')!;
  assert.ok(b.width > a.width);
  assert.ok(b.width > c.width);
  assert.ok(b.width - a.width <= FLOW.WIDTH_VARIANCE);
  assert.ok(b.height < estimateHeightAtWidth(scene.nodes[1].markdown, FLOW.MIN_WIDTH));
});

test('long flow body grows height instead of shrinking type', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n長い日本語の本文を折り返しても文字サイズは変えない。\n-->\n@node b\n### 実行\nこちらも説明を少し長く書く。`,
    'layout=flow direction=right',
  );
  const layout = layoutFlowFromCanvas(scene);
  const a = layout.nodeFrames.get('a')!;
  assert.ok(a.height >= 76);
  assert.equal(
    layout.diagnostics.some((item) => item.code === 'TEXT_OVERFLOW'),
    false,
  );
});

test('branch and merge stay on shared ranks without crossing', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n@node b\n### 経路A\n@node c\n### 経路B\n@node d\n### 統合\n@edge a --> b\n@edge a --> c\n@edge b --> d\n@edge c --> d`,
    'layout=flow direction=right',
  );
  const layout = layoutFlowFromCanvas(scene);
  const a = layout.nodeFrames.get('a')!;
  const b = layout.nodeFrames.get('b')!;
  const c = layout.nodeFrames.get('c')!;
  const d = layout.nodeFrames.get('d')!;
  assert.ok(Math.abs(b.x - c.x) < 1);
  assert.ok(a.x + a.width < b.x);
  assert.ok(b.x + b.width < d.x);
  const ab =
    (b.y + b.height / 2 - (a.y + a.height / 2)) * (c.y + c.height / 2 - (a.y + a.height / 2));
  assert.ok(ab < 0);
});

test('crossing edges are uncrossed by barycenter order', () => {
  const scene = parseCanvas(
    `@node a\nA\n@node b\nB\n@node c\nC\n@node d\nD\n@edge a --> d\n@edge b --> c`,
    'layout=flow direction=right',
  );
  const layout = layoutFlowFromCanvas(scene);
  const a = layout.nodeFrames.get('a')!;
  const b = layout.nodeFrames.get('b')!;
  const c = layout.nodeFrames.get('c')!;
  const d = layout.nodeFrames.get('d')!;
  const aAbove = a.y + a.height / 2 < b.y + b.height / 2;
  const dAbove = d.y + d.height / 2 < c.y + c.height / 2;
  assert.equal(aAbove, dAbove);
});

test('cycles become a ranked line plus a feedback diagnostic', () => {
  const scene = parseCanvas(
    `@node plan\n### 計画\n@node do\n### 実行\n@node see\n### 検証\n@edge plan --> do\n@edge do --> see\n@edge see --> plan`,
    'layout=flow direction=right',
  );
  const layout = layoutFlowFromCanvas(scene);
  assert.ok(layout.diagnostics.some((item) => item.code === 'CYCLE_DETECTED'));
  const xs = ['plan', 'do', 'see'].map((id) => layout.nodeFrames.get(id)!.x);
  assert.ok(xs[0] < xs[1]);
  assert.ok(xs[1] < xs[2]);
});

test('route=curve keeps a cubic for a two-point edge', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n-->\n@node b\n### 実行`,
    'layout=flow direction=right route=curve',
  );
  const layout = layoutFlowFromCanvas(scene);
  assert.match(layout.edgePaths[0].path, / C /);
  assert.equal(layout.edgePaths[0].path.includes(' L '), false);
});

test('diagram route=curve is forwarded to the flow engine', () => {
  const parsed = parseDiagram(
    `@item a title="入力"
@item b title="実行"
@link a -> b`,
    'layout=flow route=curve',
  );
  assert.equal(parsed.options.route, 'curve');
  const { root, close } = render(`@diagram layout=flow route=curve
@item a title="入力"
@item b title="実行"
@link a -> b
@enddiagram`);
  try {
    const path = root.querySelector('.canvas-edge')?.getAttribute('d') || '';
    assert.match(path, / C /);
  } finally {
    close();
  }
});

test('route=curve falls back when a smoothed detour would cut a node', () => {
  const scene = parseCanvas(
    `@node plan\n### 計画\n@node do\n### 実行\n@node see\n### 検証\n@edge plan --> do\n@edge do --> see\n@edge see --> plan`,
    'layout=flow direction=right route=curve',
  );
  const layout = layoutFlowFromCanvas(scene);
  const back = layout.edgePaths.find((path) => path.from === 'see' && path.to === 'plan')!;
  const mid = layout.nodeFrames.get('do')!;
  assert.equal(
    layout.diagnostics.some((item) => item.code === 'EDGE_COLLISION'),
    false,
  );
  assert.ok(back.label.y > mid.y + mid.height);
  assert.ok(Math.max(mid.y, back.label.y) > mid.y + mid.height);
});

test('flow edges leave from the node perimeter and avoid a third node', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n@node b\n### 経路A\n@node c\n### 経路B\n@node d\n### 統合\n@edge a --> b\n@edge a --> c\n@edge b --> d\n@edge c --> d`,
    'layout=flow direction=right route=elbow',
  );
  const layout = layoutFlowFromCanvas(scene);
  const a = layout.nodeFrames.get('a')!;
  const b = layout.nodeFrames.get('b')!;
  const first = layout.edgePaths.find((path) => path.from === 'a' && path.to === 'b')!;
  const nums = [...first.path.matchAll(/(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  assert.ok(Math.abs(nums[0] - (a.x + a.width)) < 2);
  assert.ok(Math.abs(nums[nums.length - 2] - b.x) < 2);
  assert.equal(
    layout.diagnostics.some((item) => item.code === 'EDGE_COLLISION'),
    false,
  );
});

test('feedback edges travel around the figure instead of through nodes', () => {
  const scene = parseCanvas(
    `@node plan\n### 計画\n@node do\n### 実行\n@node see\n### 検証\n@edge plan --> do\n@edge do --> see\n@edge see --> plan`,
    'layout=flow direction=right route=elbow',
  );
  const layout = layoutFlowFromCanvas(scene);
  const back = layout.edgePaths.find((path) => path.from === 'see' && path.to === 'plan')!;
  const mid = layout.nodeFrames.get('do')!;
  const ys = [...back.path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((match) =>
    Number(match[2]),
  );
  assert.ok(Math.max(...ys) > mid.y + mid.height + 24);
  assert.ok(back.label.y > mid.y + mid.height);
});

test('free canvas placement is unchanged by the flow engine', () => {
  const free = parseCanvas(
    '@node a frame=10,20,210,100\nA\n@node b x=300 y=40 pinned\nB',
    'layout=free',
  );
  assert.deepEqual(layoutCanvas(free)[0], { x: 10, y: 20, width: 210, height: 100 });
  assert.equal(free.options.autoHeight, false);
  assert.equal(canvasHeight(free), 420);
  assert.equal(layoutCanvas(free)[1].x, 300);
  assert.deepEqual(canvasDiagnostics(free), []);
});
