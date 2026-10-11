import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileMarpTheme } from '../cli/marp-theme.mjs';

test('marp theme is compiled from the current milo slide settings', async () => {
  const css = await compileMarpTheme();
  const saved = await readFile(join(import.meta.dirname, '../marp/milo.css'), 'utf8');
  assert.equal(css, saved);

  assert.match(css, /^\/\* @theme milo \*\//);
  assert.match(css, /section \{\n {2}width: 1600px;\n {2}height: 900px;\n\}\n$/);
  assert.match(css, /--accent: #d42d5a/);
  assert.match(css, /font-family: YakuHanJP/);
  assert.match(css, /font-family: 'Noto Sans JP'/);
  assert.match(
    css,
    /content: attr\(data-marpit-pagination\) ' \/ ' attr\(data-marpit-pagination-total\)/,
  );
  assert.match(css, /visibility: hidden/);
  assert.match(css, /left: var\(--slide-pad-x\)/);
  assert.match(css, /bottom: var\(--slide-pad-bottom\)/);
  assert.match(css, /--slide-space-footer: 4\.4cqw/);
  assert.match(
    css,
    /padding-bottom: calc\(var\(--slide-pad-bottom\) \+ var\(--slide-space-footer\)\)/,
  );
  assert.doesNotMatch(css, /(--[\w-]+): var\(\1\)/);
  // A standalone Marp theme must carry every token it references, including
  // dependencies of layout padding and color aliases.
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  for (const [, name] of css.matchAll(/var\((--[\w-]+)\)/g)) {
    assert.ok(defined.has(name), `Missing Marp token: ${name}`);
  }
  assert.equal((css.match(/&:has\(> footer\)/g) ?? []).length, 3);
  assert.doesNotMatch(css, /task-marker|plot-block|impact-block|columns-block|slider-block/);
  assert.doesNotMatch(css, /\.layout-|source-editor|slide-thumb|#d8d8d8/);
});
