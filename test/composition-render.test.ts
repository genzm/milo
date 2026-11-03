import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderSlide } from '../src/render';
import { SourceStore } from '../src/source';

test('compositions mount nested Markdown and report missing annotation targets', () => {
  const window = new Window({ settings: { disableComputedStyleRendering: true } });
  const previous = globalThis.document;
  globalThis.document = window.document as unknown as Document;
  const ctx = {
    store: new SourceStore({ html: null, blocks: [] }),
    present: () => false,
    inspect: () => {},
  };
  try {
    const root = document.createElement('div');
    const body =
      '@compose\n@part a\n@box tone=accent\nHello\n@endbox\n@endpart\n@part b\nWorld\n@endpart\n';
    const rendered = renderSlide(
      root,
      body + '@arrow id=go from=a to=b\n@cross target=go\n@endcompose',
      ctx,
    );
    assert.equal(root.querySelectorAll('.composition-part').length, 2);
    assert.equal(root.querySelectorAll('.box-block').length, 1);
    assert.equal(root.querySelector('.block-error'), null);
    rendered.dispose();
    const broken = renderSlide(root, body + '@cross target=missing\n@endcompose', ctx);
    assert.match(root.querySelector('.block-error')?.textContent || '', /missing/);
    broken.dispose();
  } finally {
    globalThis.document = previous;
    window.close();
  }
});
