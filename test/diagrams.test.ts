import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

function render(source: string) {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
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
      Object.assign(globalThis, { document: originalDocument });
      window.close();
    },
  };
}

test('dark cards keep markdown text on the card color instead of .slide p ink', () => {
  const slides = readFileSync(new URL('../src/styles/slides.css', import.meta.url), 'utf8');
  const components = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  assert.match(components, /\.card-tone-dark \{[^}]*color: var\(--white\)/s);
  assert.match(slides, /\.slide-card :is\([^)]*\bp\b[^)]*\) \{\s*color: inherit;/);
});

test('rounded cards use white, gray and pink outline instead of a pale pink fill', () => {
  const { root, close } = render(
    '@box\n白\n@endbox\n\n@box tone=muted\nグレー\n@endbox\n\n@box tone=accent\n強調\n@endbox',
  );
  try {
    const [plain, muted, accent] = [...root.querySelectorAll('.box-block')];
    assert.equal(plain.className, 'box-block slide-card card-tone-default');
    assert.equal(muted.className, 'box-block slide-card card-tone-muted');
    assert.equal(accent.className, 'box-block slide-card card-tone-accent');
    assert.equal(root.querySelector('.box-tone-accent, .card-tone-pale'), null);
  } finally {
    close();
  }
});

test('grid, stack and panel nest and stretch as equal-height layout', () => {
  const { root, close } = render(`@grid columns=2
@panel
### 左
@stack
@box tone=default
上
@endbox
@box tone=dark
下
@endbox
@endstack
@endpanel
@panel tone=accent
### 右
本文
@endpanel
@endgrid`);
  try {
    const grid = root.querySelector('.grid-block') as unknown as HTMLElement;
    assert.equal(grid?.style.getPropertyValue('--grid-columns'), '2');
    assert.equal(root.querySelectorAll('.panel-block').length, 2);
    assert.ok(root.querySelector('.panel-block.card-tone-muted'));
    assert.ok(root.querySelector('.panel-block.card-tone-accent'));
    assert.equal(root.querySelectorAll('.stack-block .box-block').length, 2);
    assert.equal(root.querySelector('.card-tone-dark')?.textContent.trim(), '下');
  } finally {
    close();
  }
});

test('steps lay out numbered cards, arrows and a highlighted current step', () => {
  const { root, close } = render(`@steps highlight=2
@step title="考え方"
目的と制約
トレードオフ・決め方
@step title="3つのケース"
アプリ / セキュリティ / Runnerログ
@step title="まとめ"
全体像
@endsteps`);
  try {
    const cards = [...root.querySelectorAll('.step-card')];
    assert.equal(cards.length, 3);
    assert.equal(root.querySelectorAll('.step-arrow').length, 2);
    assert.equal(cards[0].querySelector('.step-badge')?.textContent, '1');
    assert.equal(cards[1].querySelector('.step-title')?.textContent, '3つのケース');
    assert.equal(cards[1].classList.contains('is-highlight'), true);
    assert.equal(cards[0].classList.contains('is-highlight'), false);
    assert.match(cards[2].textContent, /全体像/);
    assert.ok(cards[0].querySelector('.step-body br'));
  } finally {
    close();
  }
});

test('steps report missing endings, titles and highlight range', () => {
  for (const [source, pattern] of [
    ['@steps\n@step title="A"\n本文\n', /@endsteps/],
    ['@steps\n本文だけ\n@endsteps', /@step/],
    ['@steps\n@step\n本文\n@endsteps', /title/],
    ['@steps highlight=4\n@step title="A"\nA\n@step title="B"\nB\n@endsteps', /1〜2/],
  ] as const) {
    const { root, close } = render(source);
    try {
      assert.match(root.querySelector('.block-error')?.textContent ?? '', pattern);
    } finally {
      close();
    }
  }
});
