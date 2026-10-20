import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { resolveAssetRef } from '../src/directives.ts';
import { renderSlide } from '../src/render.ts';
import { SourceStore } from '../src/source.ts';

function fixture() {
  return new SourceStore({
    html: null,
    blocks: [
      { id: 'slide-a', kind: 'slide', name: 'slide.md', text: '# Slide' },
      {
        id: 'asset-a',
        kind: 'asset',
        name: 'a/logo.svg',
        text: 'mime: image/svg+xml\n\n<svg id="a"/>',
      },
      {
        id: 'asset-b',
        kind: 'asset',
        name: 'b/logo.svg',
        text: 'mime: image/svg+xml\n\n<svg id="b"/>',
      },
      {
        id: 'asset-photo',
        kind: 'asset',
        name: 'images/photo.png',
        text: 'mime: image/png\n\nAA==',
      },
    ],
  });
}

test('exact asset paths win over basename matches in other directories', () => {
  const store = fixture();
  assert.equal(resolveAssetRef(store, 'a/logo.svg'), 'asset-a');
  assert.equal(resolveAssetRef(store, './a/logo.svg'), 'asset-a');
  assert.equal(resolveAssetRef(store, 'a\\logo.svg'), 'asset-a');
  assert.equal(resolveAssetRef(store, 'b/logo.svg'), 'asset-b');
  assert.equal(resolveAssetRef(store, 'photo.png'), 'asset-photo');
  for (const ref of ['asset:asset-a', 'asset:a', 'asset-a', 'a']) {
    assert.equal(resolveAssetRef(store, ref), 'asset-a');
  }
});

test('ambiguous or missing images are reported and other source kinds cannot resolve as images', () => {
  const store = fixture();
  assert.throws(() => resolveAssetRef(store, 'logo.svg'), /複数に一致/);
  assert.throws(() => resolveAssetRef(store, 'missing.png'), /見つかりません/);
  assert.throws(() => resolveAssetRef(store, 'slide-a'), /見つかりません/);
  assert.throws(() => resolveAssetRef(store, 'asset:'), /参照が空/);
  store.add({ id: 'asset-duplicate', kind: 'asset', name: 'a/logo.svg', text: '' });
  assert.throws(() => resolveAssetRef(store, 'a/logo.svg'), /複数に一致/);
});

test('Markdown images and image directives render different same-named assets by their paths', () => {
  const window = new Window();
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: window.document });
  try {
    const root = window.document.createElement('div');
    const rendered = renderSlide(
      root as unknown as HTMLElement,
      '![A](a/logo.svg)\n\n::image{asset="b/logo.svg" alt="B"}',
      { store: fixture(), present: () => false, inspect: () => {} },
    );
    assert.equal(root.querySelector('.inline-error, .block-error'), null);
    const images = [...root.querySelectorAll('img')];
    assert.equal(images.length, 2);
    assert.equal(images[0].alt, 'A');
    assert.equal(images[1].alt, 'B');
    assert.match(decodeURIComponent(images[0].src), /id="a"/);
    assert.match(decodeURIComponent(images[1].src), /id="b"/);
    rendered.dispose();
  } finally {
    Object.assign(globalThis, { document: originalDocument });
    window.close();
  }
});
