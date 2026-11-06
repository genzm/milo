import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchTestBrowser } from './helpers/browser.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../cli/compile.mjs';
import { createPdfHtml, waitForPdfReady } from '../cli/pdf.mjs';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/diagram-patterns.md');

test('diagram patterns stay readable in Chromium', { timeout: 90_000 }, async (t) => {
  const browser = await launchTestBrowser(t);
  if (!browser) return;
  const dir = await mkdtemp(join(tmpdir(), 'milo-diagram-patterns-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await compile({ input: fixture, out: join(dir, 'slides.html') });
  const html = await createPdfHtml(result.deck, result.parts);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
  await waitForPdfReady(page, 30_000);
  const measured = await page.evaluate(() => {
    const overlap = (a, b) =>
      a.x < b.x + b.width - 1 &&
      b.x < a.x + a.width - 1 &&
      a.y < b.y + b.height - 1 &&
      b.y < a.y + a.height - 1;
    return [...document.querySelectorAll('.slide')].map((slide) => {
      const figures = [...slide.querySelectorAll('.milo-canvas,.milo-diagram')];
      const layouts = [...slide.querySelectorAll('.grid-block,.columns-block,.milo-composition')];
      const footer = slide.querySelector('.slide-footer-content')?.textContent || '';
      const pattern = /pattern:\s*([a-z0-9-]+)/.exec(footer)?.[1] || '';
      const allowed = new Set(
        (/allow=([A-Z_,]+)/.exec(footer)?.[1] || '').split(',').filter(Boolean),
      );
      const errors = [];
      if (!figures.length && !layouts.length) errors.push('missing figure');
      if (
        slide.querySelector('.milo-composition') &&
        !slide.querySelector('.composition-arrow') &&
        !allowed.has('NO_EDGES')
      )
        errors.push('missing arrows');
      for (const figure of figures) {
        const nodes = [
          ...figure.querySelectorAll(
            '.canvas-node,[data-diagram-item],[data-canvas-node],.diagram-vertex,.diagram-dot,.diagram-card',
          ),
        ];
        const boxes = nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            id: node.dataset.canvasNode || node.dataset.diagramItem || '',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        });
        if (boxes.length < 1) errors.push('missing nodes');
        if (!allowed.has('OVERFLOW')) {
          for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
              if (overlap(boxes[i], boxes[j])) errors.push(`overlap ${boxes[i].id}/${boxes[j].id}`);
            }
          }
        }
        const overflow =
          figure.getAttribute('data-diagram-overflow') === 'true' ||
          /\b(NODE_OVERLAP|EDGE_COLLISION|FRAME_OVERFLOW|TEXT_OVERFLOW)\b/.test(
            figure.getAttribute('data-canvas-overflow') || '',
          );
        if (overflow && !allowed.has('OVERFLOW')) errors.push('overflow');
        if (!overflow && allowed.has('OVERFLOW')) errors.push('expected overflow');
        const paths = [...figure.querySelectorAll('.canvas-edge,.diagram-edge,.diagram-note-link')];
        const arrows = [...slide.querySelectorAll('.composition-arrow')];
        if (boxes.length && !paths.length && !arrows.length && !allowed.has('NO_EDGES'))
          errors.push('missing edges');
        for (const path of paths) {
          const d = path.getAttribute('d') || '';
          if (d && !d.startsWith('M ')) errors.push('bad path');
        }
      }
      return { pattern, figures: figures.length, layouts: layouts.length, errors };
    });
  });
  const patterned = measured.filter((slide) => slide.pattern);
  assert.ok(patterned.length >= 40, `expected many pattern slides, got ${patterned.length}`);
  for (const slide of patterned) {
    assert.ok(slide.figures >= 1 || slide.layouts >= 1, `${slide.pattern}: missing figure`);
    assert.deepEqual(slide.errors, [], slide.pattern);
  }
});
