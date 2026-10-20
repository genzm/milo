import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readImageAsset } from '../src/assets.ts';

test('SVG import preserves image data and rejects active or external content', async () => {
  const window = new Window();
  const originalParser = globalThis.DOMParser;
  Object.assign(globalThis, { DOMParser: window.DOMParser });
  const svg = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
  try {
    const text = svg('<defs><path id="shape" d="M0 0h10v10Z"/></defs><use href="#shape"/>');
    assert.equal(
      await readImageAsset(new File([text], 'image.svg')),
      `mime: image/svg+xml\n\n${text}`,
    );
    for (const content of [
      '<script>alert(1)</script>',
      '<foreignObject/>',
      '<path onclick="alert(1)"/>',
      '<image href="https://example.com/image.png"/>',
      '<style>@import "https://example.com/style.css";</style>',
    ]) {
      await assert.rejects(
        readImageAsset(new File([svg(content)], 'image.svg', { type: 'image/svg+xml' })),
        /外部参照やスクリプト/,
      );
    }
  } finally {
    Object.assign(globalThis, { DOMParser: originalParser });
    window.close();
  }
});

test('image import rejects unsupported types and files larger than the size limit', async () => {
  await assert.rejects(
    readImageAsset(new File(['text'], 'notes.txt', { type: 'text/plain' })),
    /選んで/,
  );
  await assert.rejects(
    readImageAsset(
      new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
    ),
    /12MB/,
  );
});
