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

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/flow-v2.md');

function resolveChromium(executablePath) {
  if (existsSync(executablePath)) return executablePath;
  const arm = executablePath.replace('chrome-mac-x64', 'chrome-mac-arm64');
  return existsSync(arm) ? arm : '';
}

test('flow v2 stays readable and stable in Chromium', { timeout: 60_000 }, async (t) => {
  const { chromium } = await import('playwright');
  const executablePath = resolveChromium(chromium.executablePath());
  if (!executablePath) {
    t.skip('Chromium is not installed');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'milo-flow-'));
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
    const overlap = (a, b) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const slides = [...document.querySelectorAll('.slide')].map((slide, index) => {
      const nodes = [...slide.querySelectorAll('.canvas-node')].map((node) => {
        const box = node.getBoundingClientRect();
        const heading = node.querySelector('h3');
        return {
          id: node.dataset.canvasNode,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          fontSize: heading ? getComputedStyle(heading).fontSize : '',
          inlineFont: node.style.fontSize,
        };
      });
      const paths = [...slide.querySelectorAll('.canvas-edge')].map((path) => path.getAttribute('d') || '');
      let nodeOverlap = false;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          if (overlap(nodes[i], nodes[j])) nodeOverlap = true;
        }
      }
      return {
        index,
        nodes,
        paths,
        nodeOverlap,
        overflow: slide.querySelector('.milo-canvas')?.getAttribute('data-canvas-overflow') || '',
        hint: slide.querySelector('.canvas-overflow-hint')?.textContent || '',
      };
    });
    return slides;
  });
  const serial = measured[0];
  assert.equal(serial.nodes.length, 4);
  assert.equal(serial.nodeOverlap, false);
  for (const node of serial.nodes) {
    assert.ok(node.scrollHeight <= node.clientHeight + 2, `${node.id} clipped`);
    assert.equal(node.inlineFont, '');
    assert.ok(Number.parseFloat(node.fontSize) >= 18);
  }
  const branch = measured[1];
  assert.equal(branch.nodes.length, 4);
  assert.equal(branch.nodeOverlap, false);
  assert.ok(branch.paths.every((path) => path.startsWith('M ')));
  const fixed = measured[2];
  assert.ok(fixed.overflow);
  assert.match(fixed.hint, /収まりません|切れています|余白が足りません/);
});
