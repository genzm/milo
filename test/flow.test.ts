import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { canvasDiagnostics, canvasHeight, layoutCanvas, parseCanvas } from '../src/canvas.ts';
import { parseDiagram } from '../src/diagram.ts';
import { layoutFlowFromCanvas } from '../src/flow/layout.ts';
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
    assert.equal(canvas.style.aspectRatio.replace(/\s/g, ''), '1000/480');
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
  const widths = new Set(frames.map((frame) => frame.width));
  assert.equal(widths.size === 1 || widths.size === 4, true);
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
