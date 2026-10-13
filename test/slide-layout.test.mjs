import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slideLayout, setSlideLayout, LAYOUTS } from '../src/slide-layout.mjs';
import { slideLayout as cliLayout } from '../cli/compile.mjs';

test('CLI and editor share metadata validation and supported layouts', () => {
  assert.equal(cliLayout, slideLayout);
  assert.equal(slideLayout('# Title'), undefined);
  for (const layout of LAYOUTS) {
    for (const value of [layout, `"${layout}"`, `'${layout}'`]) {
      assert.equal(slideLayout(`<!-- milo: layout=${value} -->\n# Title`), layout);
    }
  }
  assert.throws(() => slideLayout('<!-- milo: layout=unknown -->'), /未対応/);
  assert.throws(() => slideLayout('<!-- milo: layout=cover stray -->'), /解釈/);
});

test('changing layout preserves quotes, spacing, other attributes and CRLF', () => {
  const source = `<!-- milo: note="layout=essay" other-layout=lab layout = 'cover' -->\r\n\r\n# Title`;
  assert.equal(setSlideLayout(source, 'section'), source.replace("'cover'", "'section'"));
  assert.equal(
    setSlideLayout('# Title\r\n', 'lab'),
    '<!-- milo: layout=lab -->\r\n\r\n# Title\r\n',
  );
  assert.equal(
    slideLayout(setSlideLayout('<!-- milo: note="layout=essay" -->\n# Title', 'media')),
    'media',
  );
});
