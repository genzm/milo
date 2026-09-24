import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { canvasHeight, layoutCanvas, parseCanvas } from '../src/canvas.ts';
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
  assert.equal(flow.options.autoHeight, true);
  assert.equal(canvasHeight(flow, [80, 90]), 292);
  assert.ok(frames[1].y > frames[0].y);
  assert.equal(frames[1].height, 90);

  const free = parseCanvas(
    '@node a frame=10,20,210,100\nA\n@node b x=300 y=40 pinned\nB',
    'layout=free',
  );
  assert.deepEqual(layoutCanvas(free)[0], { x: 10, y: 20, width: 210, height: 100 });
  assert.equal(free.options.autoHeight, false);
  assert.equal(canvasHeight(free), 420);
  assert.equal(layoutCanvas(free)[1].x, 300);

  const fixedFlow = parseCanvas('A\n-->\nB', 'height=300');
  assert.equal(fixedFlow.options.autoHeight, false);
  assert.equal(canvasHeight(fixedFlow), 300);
});

test('canvas reports structural and reference errors', () => {
  assert.throws(() => parseCanvas('-->\ntext'), /前にnode/);
  assert.throws(() => parseCanvas('@node a\nA\n@edge a --> missing'), /接続先/);
  assert.throws(() => parseCanvas('@node a\nA\n@node a\nB'), /重複/);
  assert.throws(() => parseCanvas('A', 'layout=free height=auto'), /数値/);
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

test('footer uses a paired @footer block and ignores markers in code fences', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  const context = {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    parameters: () => ({}),
    setParameter: () => {},
    inspect: () => {},
  };
  try {
    const root = window.document.createElement('div');
    renderSlide(
      root as unknown as HTMLElement,
      '# 本文\n\n@footer\n出典：**資料A**\n@endfooter\n\n本文の続き\n\n```md\n@footer\nコード内\n@endfooter\n```',
      context,
    );
    assert.ok(root.classList.contains('has-slide-footer'));
    assert.equal(root.querySelectorAll('.slide-footer-content').length, 1);
    assert.equal(root.querySelector('.slide-footer-content strong')?.textContent, '資料A');
    assert.match(root.textContent, /本文の続き/);

    const aligned = window.document.createElement('div');
    renderSlide(
      aligned as unknown as HTMLElement,
      '# 本文\n\n@footer\n## 中央 @align=center\n\n右寄せ。 @align=right\n\nそのまま。\n@endfooter',
      context,
    );
    const footer = aligned.querySelector('.slide-footer-content');
    assert.equal(footer?.querySelector('h2')?.className, 'align-center');
    assert.equal(footer?.querySelector('h2')?.textContent, '中央');
    assert.equal(footer?.querySelector('p')?.className, 'align-right');
    assert.equal(footer?.querySelector('p')?.textContent, '右寄せ。');
    assert.equal(footer?.querySelectorAll('p')[1]?.className, '');
    assert.equal(footer?.querySelectorAll('p')[1]?.textContent, 'そのまま。');
    assert.match(root.querySelector('code')?.textContent || '', /@footer/);

    const legacy = window.document.createElement('div');
    renderSlide(legacy as unknown as HTMLElement, '本文\n\n::footer\n\n旧記法', context);
    assert.ok(!legacy.classList.contains('has-slide-footer'));
    assert.equal(legacy.querySelector('.slide-footer-content'), null);

    const broken = window.document.createElement('div');
    renderSlide(broken as unknown as HTMLElement, '@footer\n閉じていない', context);
    assert.match(broken.querySelector('.block-error')?.textContent || '', /@endfooter/);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});

test('columns render two or more Markdown columns with nested structural content', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  const context = {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    parameters: () => ({}),
    setParameter: () => {},
    inspect: () => {},
  };
  try {
    const root = window.document.createElement('div');
    renderSlide(
      root as unknown as HTMLElement,
      `# 比較

@columns
@column
## 左

通常の **Markdown**。
@endcolumn
@column
## 中央

@box tone=muted
ボックスも配置できます。
@endbox
@endcolumn
@column
## 右

- 項目A
- 項目B
@endcolumn
@endcolumns`,
      context,
    );
    const group = root.querySelector('.columns-block') as unknown as HTMLElement | null;
    assert.equal(group?.style.getPropertyValue('--column-count'), '3');
    assert.equal(root.querySelectorAll('.column-block').length, 3);
    assert.equal(root.querySelector('.column-block strong')?.textContent, 'Markdown');
    assert.equal(
      root.querySelector('.column-block .box-block')?.textContent.trim(),
      'ボックスも配置できます。',
    );
    assert.equal(root.querySelectorAll('.column-block li').length, 2);

    const fenced = window.document.createElement('div');
    renderSlide(
      fenced as unknown as HTMLElement,
      '@columns\n@column\n```md\n@endcolumn\n```\n左\n@endcolumn\n@column\n右\n@endcolumn\n@endcolumns',
      context,
    );
    assert.equal(fenced.querySelectorAll('.column-block').length, 2);
    assert.match(fenced.querySelector('code')?.textContent || '', /@endcolumn/);

    const broken = window.document.createElement('div');
    renderSlide(
      broken as unknown as HTMLElement,
      '@columns\n@column\nひとつだけ\n@endcolumn\n@endcolumns',
      context,
    );
    assert.match(broken.querySelector('.block-error')?.textContent || '', /2つ以上/);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});

test('strong, accent emphasis and impact provide three distinct emphasis levels', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  const context = {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    parameters: () => ({}),
    setParameter: () => {},
    inspect: () => {},
  };
  try {
    const root = window.document.createElement('div');
    renderSlide(
      root as unknown as HTMLElement,
      '通常の **黒字強調** と ==アクセント強調==。\n\n@impact\n売上が **2.4倍** に\n@endimpact',
      context,
    );
    assert.equal(root.querySelector('p strong')?.textContent, '黒字強調');
    assert.equal(root.querySelector('.accent-emphasis')?.textContent, 'アクセント強調');
    assert.equal(root.querySelector('.impact-block')?.textContent.trim(), '売上が 2.4倍 に');
    assert.equal(root.querySelector('.impact-block strong')?.textContent, '2.4倍');

    const literal = window.document.createElement('div');
    renderSlide(
      literal as unknown as HTMLElement,
      '`==code==` と $a == b$ と a == b == c',
      context,
    );
    assert.equal(literal.querySelector('.accent-emphasis'), null);

    const broken = window.document.createElement('div');
    renderSlide(broken as unknown as HTMLElement, '@impact\n閉じていない', context);
    assert.match(broken.querySelector('.block-error')?.textContent || '', /@endimpact/);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});

test('task items keep source offsets through structural Markdown and toggle one source character', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  const source = `<!-- milo: layout=lab -->

- [ ] ルート
- [x] 完了済み

@columns
@column
- [ ] 左
@endcolumn
@column
@box
- [ ] 右のボックス
@endbox
@endcolumn
@endcolumns`;
  const patches: { from: number; to: number; replacement: string }[] = [];
  try {
    const root = window.document.createElement('div');
    const rendered = renderSlide(root as unknown as HTMLElement, source, {
      store: new SourceStore({ html: null, blocks: [] }),
      present: () => false,
      parameters: () => ({}),
      setParameter: () => {},
      patchSource: (from, to, replacement) => patches.push({ from, to, replacement }),
      inspect: () => {},
    });
    assert.equal(root.querySelectorAll('.task-marker').length, 4);
    assert.equal(root.querySelector('[data-task="0"]')?.getAttribute('aria-checked'), 'false');
    assert.equal(root.querySelector('[data-task="1"]')?.getAttribute('aria-checked'), 'true');

    (root.querySelector('[data-task="0"]') as any).click();
    (root.querySelector('[data-task="3"]') as any).click();
    assert.deepEqual(
      patches.map(({ from, to, replacement }) => [source.slice(from, to), replacement]),
      [
        [' ', 'x'],
        [' ', 'x'],
      ],
    );
    assert.equal(root.querySelector('[data-task="0"]')?.getAttribute('aria-checked'), 'true');
    rendered.dispose();
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});

test('align marks headings and paragraphs inside the slide, boxes, columns and nodes', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  const context = {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    parameters: () => ({}),
    setParameter: () => {},
    inspect: () => {},
  };
  try {
    const root = window.document.createElement('div');
    renderSlide(
      root as unknown as HTMLElement,
      `# 中央の見出し @align=center

省略した段落。

明示した左寄せ。 @align=left

右寄せの **一文**。 @align=right

文中の @align=center はそのまま残る。

@box
## 箱の中 @align=right
@endbox

@columns
@column
### 列の見出し @align=center
@endcolumn
@column
列の本文 @align=left
@endcolumn
@endcolumns

@canvas
@node one
#### ノード @align=center

ノードの本文 @align=right
@endcanvas`,
      context,
    );
    const heading = root.querySelector('h1');
    assert.equal(heading?.className, 'align-center');
    assert.equal(heading?.textContent, '中央の見出し');
    assert.equal(root.querySelector('p')?.className, '');
    assert.equal(root.querySelector('p')?.textContent, '省略した段落。');
    const paragraphs = [...root.querySelectorAll(':scope > p')];
    assert.equal(paragraphs[1]?.className, 'align-left');
    assert.equal(paragraphs[1]?.textContent, '明示した左寄せ。');
    assert.equal(paragraphs[2]?.className, 'align-right');
    assert.equal(paragraphs[2]?.querySelector('strong')?.textContent, '一文');
    assert.equal(paragraphs[3]?.className, '');
    assert.match(paragraphs[3]?.textContent || '', /@align=center/);
    assert.equal(root.querySelector('.box-block h2')?.className, 'align-right');
    assert.equal(root.querySelector('.box-block h2')?.textContent, '箱の中');
    assert.equal(root.querySelector('.column-block h3')?.className, 'align-center');
    assert.equal(root.querySelector('.column-block p')?.className, 'align-left');
    assert.equal(root.querySelector('.column-block p')?.textContent, '列の本文');
    assert.equal(root.querySelector('.canvas-node h4')?.className, 'align-center');
    assert.equal(root.querySelector('.canvas-node h4')?.textContent, 'ノード');
    assert.equal(root.querySelector('.canvas-node p')?.className, 'align-right');
    assert.equal(root.querySelector('.canvas-node p')?.textContent, 'ノードの本文');
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});
