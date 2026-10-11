import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compile } from '../cli/compile.mjs';
import { compileMarpTheme } from '../cli/marp-theme.mjs';
import { loadBuildResources } from '../cli/resources.mjs';
import { embedSlideFonts, linkedSlideFonts } from '../cli/fonts.mjs';

test('embedded and linked slide fonts contain the same WOFF2 files and weights', async () => {
  const { fonts } = await loadBuildResources();
  const embedded = await embedSlideFonts(fonts);
  const outputDir = resolve('marp');
  const linked = linkedSlideFonts(fonts, outputDir);
  const urls = [...linked.matchAll(/url\('([^']+)'\)/g)];
  assert.ok(urls.length > 0);
  const bytes = await Promise.all(urls.map(([, url]) => readFile(resolve(outputDir, url))));
  let index = 0;
  const inlined = linked.replace(
    /url\('[^']+'\)/g,
    () => `url(data:font/woff2;base64,${bytes[index++].toString('base64')})`,
  );
  const normalize = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
  assert.equal(normalize(inlined), normalize(embedded.css));
  assert.doesNotMatch(embedded.css, /url\((?!data:)|format\('woff'\)/);
  for (const font of fonts) {
    assert.deepEqual(
      [...new Set([...font.css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1])))],
      [400, 800],
    );
  }
  assert.match(embedded.notice, /SIL OPEN FONT LICENSE/);
  assert.match(embedded.notice, /Yaku Han JP/);
});

test('HTML and Marp consume supplied resources and subsequent builds use current styles', async () => {
  const resources = await loadBuildResources();
  const dir = await mkdtemp(join(tmpdir(), 'milo-build-'));
  try {
    for (const accent of ['#123456', '#654321']) {
      const current = {
        ...resources,
        styles: resources.styles.replace('--accent: #d42d5a;', `--accent: ${accent};`),
      };
      const deck = await compile({
        input: 'content',
        out: join(dir, 'deck.html'),
        resources: current,
      });
      const theme = await compileMarpTheme(current);
      assert.ok(deck.html.includes(`--accent: ${accent};`));
      assert.ok(theme.includes(`--accent: ${accent};`));
      assert.equal(await readFile(deck.outPath, 'utf8'), deck.html);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
