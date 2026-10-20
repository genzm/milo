import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

test('removed model directives are unsupported while static math and literal references remain visible', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  try {
    const root = window.document.createElement('div');
    const rendered = renderSlide(
      root as unknown as HTMLElement,
      '$E=mc^2$\n\n$$x^2$$\n\n{{wave.gamma}}\n\n```milo:model wave\n{"input":"t"}\n```\n\n::plot{model="wave"}\n\n::slider{param="wave.gamma"}\n\n::equation{model="wave"}',
      {
        store: new SourceStore({ html: null, blocks: [] }),
        present: () => false,
        inspect: () => {},
      },
    );
    assert.equal(root.querySelectorAll('.katex').length, 2);
    assert.match(root.textContent, /\{\{wave\.gamma\}\}/);
    assert.equal(root.querySelector('code')?.textContent.trim(), '{"input":"t"}');
    const errors = [...root.querySelectorAll('.block-error')];
    assert.equal(errors.length, 3);
    for (const [index, name] of ['plot', 'slider', 'equation'].entries()) {
      assert.equal(errors[index].textContent, `未対応のディレクティブです: ${name}`);
    }
    rendered.dispose();
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});

test('paired blocks ignore closing markers inside long fences and report missing endings', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  const context = {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    inspect: () => {},
  };
  try {
    for (const name of ['box', 'impact', 'footer', 'canvas']) {
      const root = window.document.createElement('div');
      const rendered = renderSlide(
        root as unknown as HTMLElement,
        `@${name}\n\n~~~~\n@end${name}\n~~~\n~~~~\n\nStill inside\n@end${name}\n\nOutside`,
        context,
      );
      assert.match(root.querySelector('code')?.textContent ?? '', new RegExp(`@end${name}`));
      assert.match(root.textContent, /Still inside/);
      assert.match(root.textContent, /Outside/);
      assert.equal(root.querySelector('.block-error'), null);
      rendered.dispose();
      const broken = window.document.createElement('div');
      renderSlide(broken as unknown as HTMLElement, `@${name}\n\n~~~~\n@end${name}\n~~~~`, context);
      assert.match(
        broken.querySelector('.block-error')?.textContent ?? '',
        new RegExp(`@end${name}`),
      );
    }
    const nested = window.document.createElement('div');
    renderSlide(
      nested as unknown as HTMLElement,
      '@box\nOuter\n\n@box tone=muted\nInner\n@endbox\n\nOuter again\n@endbox',
      context,
    );
    assert.equal(nested.querySelectorAll('.box-block').length, 2);
    assert.match(nested.textContent, /Outer again/);
    const columns = window.document.createElement('div');
    renderSlide(
      columns as unknown as HTMLElement,
      '@columns\n@column\nA\n@endcolumn\n@column\nB\n@endcolumn\n\n~~~~\n@endcolumns\n~~~~',
      context,
    );
    assert.match(columns.querySelector('.block-error')?.textContent ?? '', /@endcolumns/);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});
