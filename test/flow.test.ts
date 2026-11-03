import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { canvasDiagnostics, canvasHeight, layoutCanvas, parseCanvas } from '../src/canvas.ts';
import { parseDiagram } from '../src/diagram.ts';
import { layoutFlowFromCanvas } from '../src/flow/layout.ts';
import { estimateEdgeLabel, estimateHeightAtWidth } from '../src/flow/measure.ts';
import { fromCanvasScene } from '../src/flow/normalize.ts';
import { FLOW } from '../src/flow/types.ts';
import { validateFlow } from '../src/flow/validate.ts';
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

test('flow edges use the thin gray arrows from outside notes', () => {
  const { root, close } = render(`@diagram layout=flow
@item a title="入力"
@item b title="実行"
@link a -> b
@enddiagram`);
  try {
    const canvas = root.querySelector('.milo-canvas') as unknown as HTMLElement;
    const marker = root.querySelector('marker') as unknown as SVGMarkerElement;
    assert.ok(canvas.classList.contains('canvas-layout-flow'));
    assert.equal(marker?.getAttribute('markerWidth'), '5');
    assert.equal(marker?.getAttribute('markerHeight'), '5');
    assert.ok(root.querySelector('.canvas-edge')?.getAttribute('marker-end'));
  } finally {
    close();
  }
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

test('edge labels collide using their measured text size', () => {
  const long = estimateEdgeLabel('フィードバック');
  const short = estimateEdgeLabel('戻');
  assert.ok(long.width > 48);
  assert.ok(long.width > short.width);
  const scene = parseCanvas(
    `@node a\n### A\n@node b\n### B\n@edge a --> b label="フィードバック"\n@edge a --> b label="フィードバック"`,
    'layout=flow',
  );
  const graph = fromCanvasScene(scene);
  const frames = layoutFlowFromCanvas(scene).nodeFrames;
  const diagnostics = validateFlow(
    graph,
    frames,
    [
      { index: 0, from: 'a', to: 'b', path: 'M 0 0 L 10 0', label: { x: 200, y: 80 } },
      { index: 1, from: 'a', to: 'b', path: 'M 0 10 L 10 10', label: { x: 260, y: 80 } },
    ],
    [],
  );
  assert.ok(diagnostics.some((item) => item.code === 'EDGE_LABEL_COLLISION'));
});

test('parallel edges between the same nodes keep distinct paths', () => {
  const scene = parseCanvas(
    `@node a\n### 入力\n@node b\n### 実行\n@edge a --> b label="通常"\n@edge a --> b label="例外"`,
    'layout=flow direction=right',
  );
  const layout = layoutFlowFromCanvas(scene);
  assert.equal(layout.edgePaths.length, 2);
  assert.equal(layout.edgePaths[0].index, 0);
  assert.equal(layout.edgePaths[1].index, 1);
  assert.notEqual(layout.edgePaths[0].path, layout.edgePaths[1].path);
  const { root, close } = render(`@canvas layout=flow
@node a
### 入力
@node b
### 実行
@edge a --> b label="通常"
@edge a --> b label="例外"
@endcanvas`);
  try {
    assert.equal(root.querySelectorAll('.canvas-edge').length, 2);
    assert.equal(root.querySelectorAll('.canvas-edge-label').length, 2);
  } finally {
    close();
  }
});

test('auto routing keeps three ranks, parallel edges and a long return clear', () => {
  const scene = parseCanvas(
    `@node in\n### 入力
@node a1\n### 経路A
@node a2\n### 経路B
@node mid\n### 一次統合
@node b1\n### 詳細A
@node b2\n### 詳細B
@node out\n### 最終統合
@edge in --> a1
@edge in --> a2
@edge a1 --> mid
@edge a2 --> mid
@edge mid --> b1
@edge mid --> b2
@edge b1 --> out
@edge b2 --> out
@edge a1 --> mid label="並行"
@edge out --> in label="計画を見直して入力条件を更新する"`,
    'layout=flow direction=right route=auto width=1280',
  );
  const layout = layoutFlowFromCanvas(scene);
  assert.ok(layout.edgePaths.some((path) => path.role === 'bus' || path.role === 'stem'));
  assert.ok(layout.edgePaths.some((path) => path.from === 'out' && path.to === 'in'));
  assert.equal(
    layout.diagnostics.some(
      (item) =>
        item.code === 'NODE_OVERLAP' ||
        item.code === 'EDGE_COLLISION' ||
        item.code === 'FRAME_OVERFLOW',
    ),
    false,
  );
});

test('three-rank branch-merge and a long return stay layered', () => {
  const scene = parseCanvas(
    `@node in\n### 入力
@node a1\n### 経路A
@node a2\n### 経路B
@node mid\n### 一次統合
@node b1\n### 詳細A
@node b2\n### 詳細B
@node out\n### 最終統合
@edge in --> a1
@edge in --> a2
@edge a1 --> mid
@edge a2 --> mid
@edge mid --> b1
@edge mid --> b2
@edge b1 --> out
@edge b2 --> out
@edge out --> in label="計画を見直して入力条件を更新する"`,
    'layout=flow direction=right route=curve width=1280',
  );
  const layout = layoutFlowFromCanvas(scene);
  const frame = (id: string) => layout.nodeFrames.get(id)!;
  assert.ok(frame('in').x < frame('a1').x);
  assert.ok(Math.abs(frame('a1').x - frame('a2').x) < 1);
  assert.ok(frame('a1').x < frame('mid').x);
  assert.ok(Math.abs(frame('b1').x - frame('b2').x) < 1);
  assert.ok(frame('mid').x < frame('b1').x);
  assert.ok(frame('b1').x < frame('out').x);
  const back = layout.edgePaths.find((path) => path.from === 'out' && path.to === 'in')!;
  assert.ok(back.label.y > frame('mid').y + frame('mid').height);
  assert.match(layout.edgePaths[0].path, / C | L /);
  assert.equal(
    layout.diagnostics.some(
      (item) =>
        item.code === 'NODE_OVERLAP' ||
        item.code === 'EDGE_COLLISION' ||
        item.code === 'FRAME_OVERFLOW',
    ),
    false,
  );
});

test('flow ranks stay packed and centered in the frame', () => {
  const layout = layoutFlowFromCanvas(
    parseCanvas(
      `@node a\n### 入力\n-->\n@node b\n### 分析\n-->\n@node c\n### 判断\n-->\n@node d\n### 実行`,
      'layout=flow direction=right width=1280',
    ),
  );
  const frames = [...layout.nodeFrames.values()].sort((a, b) => a.x - b.x);
  const gaps = frames.slice(1).map((frame, i) => frame.x - (frames[i].x + frames[i].width));
  assert.ok(gaps.every((value) => value <= FLOW.RANK_GAP + 1));
  assert.ok(gaps.every((value) => value >= FLOW.RANK_GAP - 1));
  const left = frames[0].x;
  const right = 1280 - (frames[frames.length - 1].x + frames[frames.length - 1].width);
  assert.ok(Math.abs(left - right) < 8);
  assert.ok(frames[0].x >= FLOW.PADDING);
});

test('route=auto keeps serial edges straight and shares a trunk on branch-merge', () => {
  const serial = layoutFlowFromCanvas(
    parseCanvas(
      `@node a\n### 入力\n-->\n@node b\n### 実行`,
      'layout=flow direction=right route=auto',
    ),
  );
  assert.match(serial.edgePaths[0].path, / L /);
  assert.equal(serial.edgePaths[0].path.includes(' C '), false);

  const scene = parseCanvas(
    `@node start\n### 入力
@node a\n### 経路A
@node b\n### 経路B
@node join\n### 統合
@edge start --> a
@edge start --> b
@edge a --> join
@edge b --> join`,
    'layout=flow direction=right route=auto',
  );
  const layout = layoutFlowFromCanvas(scene);
  const start = layout.nodeFrames.get('start')!;
  const a = layout.nodeFrames.get('a')!;
  const join = layout.nodeFrames.get('join')!;
  const vertical = (path: string) => {
    const pts = [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    }));
    const xs: number[] = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      if (Math.abs(pts[i].x - pts[i + 1].x) < 1 && Math.abs(pts[i].y - pts[i + 1].y) > 8) {
        xs.push(pts[i].x);
      }
    }
    return xs;
  };
  const splitXs = layout.edgePaths.flatMap((path) =>
    path.from === 'start' ? vertical(path.path) : [],
  );
  const mergeXs = layout.edgePaths.flatMap((path) =>
    path.to === 'join' ? vertical(path.path) : [],
  );
  assert.ok(layout.edgePaths.some((path) => path.role === 'bus' || path.role === 'stem'));
  assert.ok(splitXs.length);
  assert.ok(splitXs.every((x) => x > start.x + start.width && x < a.x));
  assert.ok(splitXs[0] - (start.x + start.width) >= FLOW.TRUNK_MIN - 1);
  assert.ok(a.x - splitXs[0] >= FLOW.TRUNK_MIN - 1);
  assert.equal(new Set(splitXs.map((x) => Math.round(x))).size, 1);
  assert.ok(mergeXs.length);
  assert.ok(mergeXs.every((x) => x > a.x + a.width && x < join.x));
  assert.equal(new Set(mergeXs.map((x) => Math.round(x))).size, 1);
  assert.equal(
    layout.diagnostics.some(
      (item) => item.code === 'NODE_OVERLAP' || item.code === 'EDGE_COLLISION',
    ),
    false,
  );

  const parsed = parseDiagram(
    `@item input title="入力"
@item a title="経路A"
@item b title="経路B"
@item merge title="統合"
@link input -> a
@link input -> b
@link a -> merge
@link b -> merge`,
    'layout=flow route=auto',
  );
  assert.equal(parsed.options.route, 'auto');
  const { root, close } = render(`@diagram layout=flow route=auto
@item input title="入力"
@item a title="経路A"
@item b title="経路B"
@item merge title="統合" level=high
@link input -> a
@link input -> b
@link a -> merge
@link b -> merge
@enddiagram`);
  try {
    const paths = [...root.querySelectorAll('.canvas-edge')].map(
      (path) => path.getAttribute('d') || '',
    );
    assert.ok(paths.length > 4);
    assert.ok(paths.every((path) => path.includes(' L ') || path.startsWith('M ')));
    assert.equal(
      [...root.querySelectorAll('.canvas-edge')].filter((path) => path.getAttribute('marker-end'))
        .length >= 3,
      true,
    );
  } finally {
    close();
  }
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

test('asymmetric branches and merges keep every stem connected in all four directions', async () => {
  const { routeEdges } = await import('../src/flow/route.ts');
  for (const direction of ['right', 'left', 'down', 'up'] as const) {
    for (const merge of [false, true]) {
      const scene = parseCanvas(
        `@node hub\nHub\n@node a\nA\n@node b\nB\n` +
          (merge ? '@edge a --> hub\n@edge b --> hub' : '@edge hub --> a\n@edge hub --> b'),
        `direction=${direction} route=auto`,
      );
      const graph = fromCanvasScene(scene);
      const horizontal = direction === 'right' || direction === 'left';
      const reverse = (direction === 'left' || direction === 'up') !== merge;
      const make = (primary: number, cross: number) => ({
        x: horizontal ? primary : cross,
        y: horizontal ? cross : primary,
        width: 80,
        height: 80,
      });
      const frames = new Map([
        ['hub', make(reverse ? 400 : 0, 0)],
        ['a', make(reverse ? 0 : 400, 160)],
        ['b', make(reverse ? 0 : 400, 300)],
      ]);
      const paths = routeEdges(graph, frames);
      const bus = paths.find((edge) => edge.role === 'bus')!;
      const stem = paths.find((edge) => edge.role === 'stem')!;
      assert.ok(bus && stem);
      const points = (path: string) =>
        [...path.matchAll(/([\d.-]+) ([\d.-]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
      const bp = points(bus.path);
      const joint = points(stem.path)[merge ? 0 : 1];
      const cross = (p: { x: number; y: number }) => (horizontal ? p.y : p.x);
      assert.ok(
        cross(joint) >= Math.min(...bp.map(cross)) && cross(joint) <= Math.max(...bp.map(cross)),
        `${direction} ${merge}: disconnected stem`,
      );
    }
  }
});

test('free curves have distinct merge ports, side-normal tangents and labels on the curve', async () => {
  const { routeFreeEdges, edgeHitsNode } = await import('../src/flow/route.ts');
  const scene = parseCanvas(
    `@node a frame=0,0,245,108\nA
@node b frame=0,328,245,108\nB
@node c frame=317,152,245,138\nC
@edge a --> c
@edge b --> c`,
    'layout=free route=curve',
  );
  const frames = new Map(scene.nodes.map((node, i) => [node.id, layoutCanvas(scene)[i]]));
  const paths = routeFreeEdges(fromCanvasScene(scene), frames);
  const ends: number[] = [];
  for (const edge of paths) {
    const commands = [...edge.path.matchAll(/([MLCQ])([^MLCQ]*)/g)].map((m) => ({
      kind: m[1],
      n: m[2].match(/-?\d+(?:\.\d+)?/g)!.map(Number),
    }));
    const [sx, sy] = commands[0].n;
    const [x0, y0] = commands[1].n;
    const [x3, y3] = commands.at(-2)!.n.slice(-2);
    const [ex, ey] = commands.at(-1)!.n;
    assert.equal(commands[1].kind, 'L');
    assert.equal(commands.at(-1)!.kind, 'L');
    assert.equal(sy, y0);
    assert.equal(y3, ey);
    assert.ok(x0 - sx >= 12 && ex - x3 >= 12, 'visible horizontal approach at both ends');
    assert.ok(edge.label.x > sx && edge.label.x < ex);
    assert.ok(edge.label.y + 10 > Math.min(sy, ey) && edge.label.y + 10 < Math.max(sy, ey));
    ends.push(ey);
    const other = frames.get(edge.from === 'a' ? 'b' : 'a')!;
    assert.equal(edgeHitsNode(edge.path, other), false);
  }
  assert.ok(Math.abs(ends[0] - ends[1]) > 20);
});

test('unequal nested branches and merges align on their middle neighbor in every direction', () => {
  for (const direction of ['right', 'left', 'down', 'up'] as const)
    for (const merge of [false, true]) {
      const edges = [
        ['hub', 'a'],
        ['hub', 'b'],
        ['hub', 'c'],
        ['a', 'a1'],
        ['a', 'a2'],
        ['a', 'a3'],
        ['b', 'b1'],
        ['c', 'c1'],
      ];
      const scene = parseCanvas(
        `@node hub width=160 height=130\nHub
@node a width=140 height=90\nA
@node b width=120 height=80\nB
@node c width=180 height=140\nC
@node a1 width=100 height=60\nA1
@node a2 width=120 height=70\nA2
@node a3 width=140 height=80\nA3
@node b1 width=130 height=80\nB1
@node c1 width=130 height=80\nC1\n` +
          edges.map(([a, b]) => (merge ? `@edge ${b} --> ${a}` : `@edge ${a} --> ${b}`)).join('\n'),
        `route=auto direction=${direction} width=1800`,
      );
      const layout = layoutFlowFromCanvas(scene);
      const horizontal = direction === 'right' || direction === 'left';
      const center = (id: string) => {
        const box = layout.nodeFrames.get(id)!;
        return horizontal ? box.y + box.height / 2 : box.x + box.width / 2;
      };
      assert.ok(
        Math.abs(center('hub') - center('b')) < 0.001,
        `${direction} ${merge}: main branch`,
      );
      assert.ok(
        Math.abs(center('a') - center('a2')) < 0.001,
        `${direction} ${merge}: nested branch`,
      );
      assert.equal(
        layout.diagnostics.some(
          (d) =>
            d.code === 'NODE_OVERLAP' || d.code === 'EDGE_COLLISION' || d.code === 'FRAME_OVERFLOW',
        ),
        false,
      );
    }
});

test('even branches center the parent between the two middle neighbors despite different sizes', () => {
  for (const count of [2, 4]) {
    const scene = parseCanvas(
      '@node hub width=120 height=130\nHub\n' +
        Array.from(
          { length: count },
          (_, i) => `@node n${i} width=120 height=${60 + i * 20}\nChild ${i}`,
        ).join('\n') +
        '\n' +
        Array.from({ length: count }, (_, i) => `@edge hub --> n${i}`).join('\n'),
      'route=auto',
    );
    const layout = layoutFlowFromCanvas(scene);
    const center = (id: string) => {
      const b = layout.nodeFrames.get(id)!;
      return b.y + b.height / 2;
    };
    assert.ok(
      Math.abs(center('hub') - (center(`n${count / 2 - 1}`) + center(`n${count / 2}`)) / 2) < 0.001,
    );
  }
});

test('free row and column connections stay straight when card centers differ slightly', async () => {
  const { routeFreeEdges } = await import('../src/flow/route.ts');
  for (const vertical of [false, true])
    for (const reverse of [false, true]) {
      const scene = parseCanvas(
        `@node a frame=${vertical ? '46,20,100,250' : '20,46,250,100'}\nA
@node b frame=${vertical ? '46,347,108,245' : '347,46,245,108'}\nB
@edge ${reverse ? 'b --> a' : 'a --> b'}`,
        'layout=free route=curve',
      );
      const frames = new Map(scene.nodes.map((n, i) => [n.id, layoutCanvas(scene)[i]]));
      const path = routeFreeEdges(fromCanvasScene(scene), frames)[0].path;
      assert.match(path, /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
      const [x0, y0, x1, y1] = path.match(/[\d.]+/g)!.map(Number);
      assert.equal(vertical ? x0 : y0, vertical ? x1 : y1);
    }
});

test('all branch arrow modes stay on node boundaries instead of bus junctions', () => {
  for (const arrows of ['none', 'start', 'end', 'both'])
    for (const merge of [false, true]) {
      const { root, close } = render(`@canvas route=auto
@node hub\nHub
@node a\nA
@node b\nB
@edge ${merge ? 'a --> hub' : 'hub --> a'} arrows=${arrows}
@edge ${merge ? 'b --> hub' : 'hub --> b'} arrows=${arrows}
@endcanvas`);
      try {
        const stem = root.querySelector('[data-edge-role="stem"]')!;
        const stubs = [...root.querySelectorAll('[data-edge-role="stub"]')];
        assert.equal(
          stem.hasAttribute(merge ? 'marker-end' : 'marker-start'),
          arrows === 'both' || arrows === (merge ? 'end' : 'start'),
        );
        assert.equal(stem.hasAttribute(merge ? 'marker-start' : 'marker-end'), false);
        for (const stub of stubs) {
          assert.equal(
            stub.hasAttribute(merge ? 'marker-start' : 'marker-end'),
            arrows === 'both' || arrows === (merge ? 'start' : 'end'),
          );
          assert.equal(stub.hasAttribute(merge ? 'marker-end' : 'marker-start'), false);
        }
        const bus = root.querySelector('[data-edge-role="bus"]')!;
        assert.equal(bus.hasAttribute('marker-start') || bus.hasAttribute('marker-end'), false);
      } finally {
        close();
      }
    }
});

test('simple flows stay centered with bounded edge length when the frame grows', () => {
  for (const direction of ['right', 'left', 'down', 'up']) {
    const horizontal = direction === 'right' || direction === 'left';
    const body =
      '@node a width=220 height=100\n### 課題\n@node b width=220 height=100\n### 解決策\n@edge a --> b';
    const small = layoutCanvas(
      parseCanvas(body, `layout=flow direction=${direction} width=1000 height=600`),
    );
    const large = layoutCanvas(
      parseCanvas(
        body,
        `layout=flow direction=${direction} width=${horizontal ? 1400 : 1000} height=${horizontal ? 600 : 1000}`,
      ),
    );
    for (let i = 0; i < 2; i++) {
      assert.equal(large[i][horizontal ? 'x' : 'y'] - small[i][horizontal ? 'x' : 'y'], 200);
      assert.equal(large[i][horizontal ? 'y' : 'x'], small[i][horizontal ? 'y' : 'x']);
    }
    const axis = horizontal ? 'x' : 'y',
      size = horizontal ? 'width' : 'height';
    const sorted = [...large].sort((a, b) => a[axis] - b[axis]);
    assert.ok(sorted[1][axis] - sorted[0][axis] - sorted[0][size] <= 88);
  }
});
