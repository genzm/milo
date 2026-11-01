import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from '../cli/compile.mjs';
import { createPdfHtml, waitForPdfReady } from '../cli/pdf.mjs';
import slideSize from '../src/slide-size.json' with { type: 'json' };

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/same-side-radial.md');

function resolveChromium(executablePath) {
  if (existsSync(executablePath)) return executablePath;
  const arm = executablePath.replace('chrome-mac-x64', 'chrome-mac-arm64');
  return existsSync(arm) ? arm : '';
}

test('same-side radial overlap warning is visible in Chromium', { timeout: 60_000 }, async (t) => {
  const { chromium } = await import('playwright');
  const executablePath = resolveChromium(chromium.executablePath());
  if (!executablePath) {
    t.skip('Chromium is not installed');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'milo-radial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await compile({ input: fixture, out: join(dir, 'slides.html') });
  const html = await createPdfHtml(result.deck, result.parts);
  const browser = await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: slideSize });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
  await waitForPdfReady(page, 30_000);
  const measured = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.diagram-card')].map((card) => {
      const box = card.getBoundingClientRect();
      return {
        id: card.dataset.diagramItem,
        center: card.classList.contains('is-center'),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });
    const hint = document.querySelector('.diagram-overflow-hint');
    const diagram = document.querySelector('.milo-diagram');
    return {
      cards,
      hint: hint?.textContent || '',
      hintHidden: hint instanceof HTMLElement ? hint.hidden : true,
      overflow: diagram?.getAttribute('data-diagram-overflow') === 'true',
    };
  });
  const hub = measured.cards.find((card) => card.center || card.id === 'problem');
  const satellites = measured.cards.filter((card) => card !== hub);
  assert.ok(hub);
  assert.equal(satellites.length, 4);
  for (const card of satellites) {
    assert.ok(card.y + card.height / 2 < hub.y + hub.height / 2, `${card.id} left the top side`);
  }
  assert.equal(measured.overflow, true);
  assert.equal(measured.hintHidden, false);
  assert.match(measured.hint, /重なって/);
});
