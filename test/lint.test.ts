import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { CHECKS, RULES, lintSlide, type SlideView } from '../src/lint/index.ts';
import rules from '../src/lint/rules.json' with { type: 'json' };

function withSlide(html: string, run: (view: SlideView) => void) {
  const window = new Window();
  const original = {
    document: globalThis.document,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
  };
  Object.assign(globalThis, {
    document: window.document,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
  try {
    window.document.body.innerHTML = `<article class="slide"><div class="slide-content">${html}</div></article>`;
    const slide = window.document.querySelector('.slide') as unknown as HTMLElement;
    const content = window.document.querySelector('.slide-content') as unknown as HTMLElement;
    run({ index: 2, slide, content });
  } finally {
    Object.assign(globalThis, original);
    window.close();
  }
}

test('every catalogued rule has a severity, wording for the author and a check', () => {
  assert.deepEqual(Object.keys(CHECKS).sort(), Object.keys(rules).sort());
  for (const [id, rule] of Object.entries(RULES)) {
    assert.ok(['error', 'warning', 'info'].includes(rule.severity), id);
    assert.ok(rule.summary.trim(), id);
    assert.ok(rule.hint.trim(), id);
  }
});

test('render errors are relayed with their message, skipping hidden ones', () => {
  withSlide(
    '<p>ok</p><div class="block-error">boxのtoneが不正です。</div><p class="composition-error block-error" hidden>old</p><span class="inline-error">数式が閉じていません</span>',
    (view) => {
      const findings = lintSlide(view, { 'render-error': CHECKS['render-error'] });
      assert.deepEqual(
        findings.map((finding) => [finding.rule, finding.severity, finding.slide, finding.message]),
        [
          ['render-error', 'error', 3, 'boxのtoneが不正です。'],
          ['render-error', 'error', 3, '数式が閉じていません'],
        ],
      );
      assert.equal(findings[0].hint, RULES['render-error'].hint);
      assert.equal('metrics' in findings[0], false);
    },
  );
});

test('figure overflow relays the renderer signal and its own hint, not a nested one', () => {
  withSlide(
    `<div class="milo-canvas" data-canvas-overflow="TEXT_OVERFLOW FRAME_OVERFLOW">
       <svg><text>edge label</text></svg>
       <div class="canvas-content"><section data-canvas-node="a">最初の箱</section>
         <div class="milo-diagram"><div class="diagram-content"><div class="diagram-overflow-hint">nested</div></div></div>
         <div class="canvas-overflow-hint">文字が切れています</div>
       </div>
     </div>
     <div class="milo-diagram" data-diagram-overflow="true"><div class="diagram-content"><div class="diagram-card-title">中心</div><div class="diagram-overflow-hint">同じ方向のカードが重なっています</div></div></div>`,
    (view) => {
      const findings = lintSlide(view, { 'figure-overflow': CHECKS['figure-overflow'] });
      assert.deepEqual(
        findings.map((finding) => finding.message),
        ['文字が切れています (TEXT_OVERFLOW FRAME_OVERFLOW)', '同じ方向のカードが重なっています'],
      );
      assert.equal(findings[0].text, '最初の箱');
      assert.equal(findings[1].text, '中心');
    },
  );
});

test('a failing check becomes an error finding without hiding the other checks', () => {
  withSlide('<div class="block-error">壊れた記法</div>', (view) => {
    const findings = lintSlide(view, {
      'orphan-line': () => {
        throw new Error('boom');
      },
      'render-error': CHECKS['render-error'],
    });
    assert.deepEqual(
      findings.map((finding) => [finding.rule, finding.severity]),
      [
        ['orphan-line', 'error'],
        ['render-error', 'error'],
      ],
    );
    assert.match(findings[0].message, /boom/);
  });
});
