import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { layoutCanvas, parseCanvas } from '../src/canvas.ts';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

test('canvas parses Markdown nodes and sequential arrows', () => {
  const scene = parseCanvas(
    `@node problem tone=accent\n### 問題\n\n普通の **Markdown**。\n\n-->\n\n@node solution shape=round\n### 解決\n\n- 項目A\n- 項目B\n`,
    'layout=flow direction=right route=elbow',
  );
  assert.equal(scene.nodes.length, 2);
  assert.equal(scene.nodes[0].id, 'problem');
  assert.match(scene.nodes[0].markdown, /\*\*Markdown\*\*/);
  assert.deepEqual(
    scene.edges.map(({ from, to }) => [from, to]),
    [['problem', 'solution']],
  );
  assert.equal(scene.options.route, 'elbow');
});

test('canvas accepts loose Markdown as nodes around arrow shorthand', () => {
  const scene = parseCanvas('### Before\n\n説明。\n\n-->\n\n### After\n\n説明。');
  assert.equal(scene.nodes.length, 2);
  assert.equal(scene.edges[0].from, 'node-1');
  assert.equal(scene.edges[0].to, 'node-2');
});

test('flow, free and hybrid node placement share one frame model', () => {
  const flow = parseCanvas('@node a\nA\n@node b dx=12 dy=5\nB\n@edge a --> b', 'direction=down');
  const frames = layoutCanvas(flow, [80, 90]);
  assert.ok(frames[1].y > frames[0].y);
  assert.equal(frames[1].height, 90);

  const free = parseCanvas(
    '@node a frame=10,20,210,100\nA\n@node b x=300 y=40 pinned\nB',
    'layout=free',
  );
  assert.deepEqual(layoutCanvas(free)[0], { x: 10, y: 20, width: 210, height: 100 });
  assert.equal(layoutCanvas(free)[1].x, 300);
});

test('canvas reports structural and reference errors', () => {
  assert.throws(() => parseCanvas('-->\ntext'), /前にnode/);
  assert.throws(() => parseCanvas('@node a\nA\n@edge a --> missing'), /接続先/);
  assert.throws(() => parseCanvas('@node a\nA\n@node a\nB'), /重複/);
});

test('canvas control words inside fenced code stay Markdown', () => {
  const scene = parseCanvas('@node example\n```text\n@node not-a-node\n@endcanvas\n```');
  assert.equal(scene.nodes.length, 1);
  assert.match(scene.nodes[0].markdown, /@node not-a-node/);
});

test('a single arrow remains ordinary node content', () => {
  const scene = parseCanvas('@node example\n入力 -> 出力\n\n->\n');
  assert.equal(scene.nodes.length, 1);
  assert.match(scene.nodes[0].markdown, /入力 -> 出力/);
  assert.match(scene.nodes[0].markdown, /^->$/m);
});

test('slide renderer mounts Markdown as HTML over an SVG connection layer', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document,
    originalResizeObserver = globalThis.ResizeObserver;
  Object.assign(globalThis, {
    document: window.document,
    ResizeObserver: window.ResizeObserver,
  });
  try {
    const root = window.document.createElement('div');
    const rendered = renderSlide(
      root as unknown as HTMLElement,
      `# Canvas\n\n@canvas layout=flow direction=right\n@node input tone=accent\n### 入力\n\n通常の **Markdown** と $x^2$。\n\n-->\n\n@node output shape=round\n### 出力\n\n@box\n既存のボックス\n@endbox\n@endcanvas\n`,
      {
        store: new SourceStore({ html: null, blocks: [] }),
        present: () => false,
        parameters: () => ({}),
        setParameter: () => {},
        inspect: () => {},
      },
    );
    assert.equal(root.querySelectorAll('.canvas-node').length, 2);
    assert.equal(root.querySelector('[data-canvas-node="input"] strong')?.textContent, 'Markdown');
    assert.ok(root.querySelector('[data-canvas-node="input"] .katex'));
    assert.equal(
      root.querySelector('.canvas-node .box-block')?.textContent.trim(),
      '既存のボックス',
    );
    assert.match(root.querySelector('.canvas-edge')?.getAttribute('d') || '', /^M /);
    assert.match(root.querySelector('.canvas-edge')?.getAttribute('marker-end') || '', /^url\(#/);
    rendered.dispose();

    const broken = window.document.createElement('div');
    renderSlide(broken as unknown as HTMLElement, '@canvas\n### 閉じていない', {
      store: new SourceStore({ html: null, blocks: [] }),
      present: () => false,
      parameters: () => ({}),
      setParameter: () => {},
      inspect: () => {},
    });
    assert.match(broken.querySelector('.block-error')?.textContent || '', /閉じる/);

    const legacy = window.document.createElement('div');
    renderSlide(legacy as unknown as HTMLElement, ':::canvas\nold\n:::', {
      store: new SourceStore({ html: null, blocks: [] }),
      present: () => false,
      parameters: () => ({}),
      setParameter: () => {},
      inspect: () => {},
    });
    assert.equal(legacy.querySelector('.milo-canvas'), null);

    const boxes = window.document.createElement('div');
    renderSlide(
      boxes as unknown as HTMLElement,
      '@box tone=dark\n### 外側\n\n@box tone=muted\n内側\n@endbox\n@endbox',
      {
        store: new SourceStore({ html: null, blocks: [] }),
        present: () => false,
        parameters: () => ({}),
        setParameter: () => {},
        inspect: () => {},
      },
    );
    assert.equal(boxes.querySelectorAll('.box-block').length, 2);
    assert.ok(boxes.querySelector('.box-tone-dark .box-tone-muted'));

    const brokenBox = window.document.createElement('div');
    renderSlide(brokenBox as unknown as HTMLElement, '@box\n閉じていない', {
      store: new SourceStore({ html: null, blocks: [] }),
      present: () => false,
      parameters: () => ({}),
      setParameter: () => {},
      inspect: () => {},
    });
    assert.match(brokenBox.querySelector('.block-error')?.textContent || '', /@endbox/);
  } finally {
    Object.assign(globalThis, {
      document: originalDocument,
      ResizeObserver: originalResizeObserver,
    });
    window.close();
  }
});
