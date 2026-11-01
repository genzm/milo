import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from '../cli/compile.mjs';
import { createPdfHtml, waitForPdfReady } from '../cli/pdf.mjs';

// Check actual DOM/SVG geometry in screen coordinates, including transforms.
async function inspect(page) {
  return page.evaluate(() => {
    const errors = [];
    const diagrams = [...document.querySelectorAll('.milo-diagram,.milo-canvas')];
    const overlap = (a, b) =>
      a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const diagram of diagrams) {
      const nodes = [...diagram.querySelectorAll('[data-canvas-node],[data-diagram-item]')];
      const bounds = diagram.getBoundingClientRect();
      const footer = diagram
        .closest('.slide')
        .querySelector('.slide-footer-content')
        ?.getBoundingClientRect();
      if (footer && bounds.bottom > footer.top + 1) errors.push('diagram overlaps footer');
      if (
        diagram.hasAttribute('data-canvas-overflow') ||
        diagram.hasAttribute('data-diagram-overflow')
      )
        errors.push('overflow warning');
      for (const [i, node] of nodes.entries()) {
        const box = node.getBoundingClientRect();
        if (node.scrollHeight > node.clientHeight + 1)
          errors.push('clipped node ' + node.textContent);
        if (
          box.left < bounds.left - 1 ||
          box.right > bounds.right + 1 ||
          box.top < bounds.top - 1 ||
          box.bottom > bounds.bottom + 1
        )
          errors.push('node leaves frame');
        for (const other of nodes.slice(0, i)) {
          const b = other.getBoundingClientRect();
          if (node.classList.contains('diagram-vertex')) {
            if (
              Math.hypot(
                box.x + box.width / 2 - b.x - b.width / 2,
                box.y + box.height / 2 - b.y - b.height / 2,
              ) <
              (box.width + b.width) / 2 - 1
            )
              errors.push('circles overlap');
          } else if (overlap(box, b)) errors.push('cards overlap');
        }
      }
      const find = (id) =>
        nodes.find((n) => (n.dataset.canvasNode || n.dataset.diagramItem) === id);
      if (find('ferment')) {
        const centerY = (id) => {
          const b = find(id).getBoundingClientRect();
          return b.y + b.height / 2;
        };
        if (Math.abs(centerY('issue') - centerY('ferment')) > 0.1)
          errors.push('main branch is not level');
        if (Math.abs(centerY('raw') - centerY('wheat')) > 0.1)
          errors.push('nested branch is not level');
      }
      const boundaryError = (node, p) => {
        const b = node.getBoundingClientRect();
        if (node.classList.contains('diagram-card')) {
          const r = Math.min(b.width, b.height) / 2;
          const dx = Math.max(0, Math.abs(p.x - b.x - b.width / 2) - (b.width / 2 - r));
          const dy = Math.max(0, Math.abs(p.y - b.y - b.height / 2) - (b.height / 2 - r));
          return Math.abs(Math.hypot(dx, dy) - r);
        }
        return Math.min(
          ...[
            [Math.abs(p.x - b.left), p.y >= b.top - 1 && p.y <= b.bottom + 1],
            [Math.abs(p.x - b.right), p.y >= b.top - 1 && p.y <= b.bottom + 1],
            [Math.abs(p.y - b.top), p.x >= b.left - 1 && p.x <= b.right + 1],
            [Math.abs(p.y - b.bottom), p.x >= b.left - 1 && p.x <= b.right + 1],
          ]
            .filter(([, on]) => on)
            .map(([d]) => d),
        );
      };
      for (const path of diagram.querySelectorAll('.canvas-edge,.diagram-edge')) {
        const len = path.getTotalLength(),
          matrix = path.getScreenCTM();
        const screen = (t) => path.getPointAtLength(t).matrixTransform(matrix);
        const from = find(path.dataset.edgeFrom),
          to = find(path.dataset.edgeTo);
        const role = path.dataset.edgeRole || 'edge';
        if (path.dataset.edgeFrom === 'dislike') {
          if (Math.abs(screen(0).y - screen(len).y) > 0.1) errors.push('same-row edge slopes');
        }
        if (path.dataset.edgeTo === 'lunch') {
          const tip = screen(len),
            approach = screen(len - 10);
          if (Math.abs(tip.y - approach.y) > 0.1 || tip.x <= approach.x)
            errors.push('arrow lacks a horizontal approach');
        }
        if (role === 'edge' && boundaryError(from, screen(0)) > 1)
          errors.push('detached source ' + path.dataset.edgeFrom);
        if (
          (role === 'edge' || path.hasAttribute('marker-end')) &&
          boundaryError(to, screen(len)) > 1
        )
          errors.push('detached target ' + path.dataset.edgeTo);
        for (const node of nodes.filter((n) => n !== from && n !== to)) {
          const b = node.getBoundingClientRect();
          for (let k = 1; k < 40; k++) {
            const p = screen((len * k) / 40);
            if (p.x > b.left + 2 && p.x < b.right - 2 && p.y > b.top + 2 && p.y < b.bottom - 2) {
              errors.push('edge crosses unrelated node');
              break;
            }
          }
        }
      }
      const dashed = diagram.querySelector('.canvas-edge.is-dashed');
      if (dashed) {
        const text = diagram.querySelector('.canvas-edge-label').getBoundingClientRect();
        const point = dashed
          .getPointAtLength(dashed.getTotalLength() / 2)
          .matrixTransform(dashed.getScreenCTM());
        if (
          Math.abs(point.x - (text.x + text.width / 2)) > 2 ||
          Math.abs(point.y - text.bottom) > 25
        )
          errors.push('curve label detached');
      }
    }
    return { count: diagrams.length, errors };
  });
}

test(
  'five real diagram types keep their geometry in PDF, editor resize and presentation',
  { timeout: 90_000 },
  async (t) => {
    const { chromium } = await import('playwright');
    let executablePath = chromium.executablePath();
    if (!existsSync(executablePath))
      executablePath = executablePath.replace('chrome-mac-x64', 'chrome-mac-arm64');
    if (!existsSync(executablePath)) return t.skip('Chromium is not installed');
    const dir = await mkdtemp(join(tmpdir(), 'milo-diagram-regression-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const result = await compile({
      input: fileURLToPath(new URL('./fixtures/diagram-regressions.md', import.meta.url)),
      out: join(dir, 'slides.html'),
    });
    const browser = await chromium.launch({ executablePath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.setContent(await createPdfHtml(result.deck, result.parts));
    await waitForPdfReady(page);
    assert.deepEqual(await inspect(page), { count: 5, errors: [] }, 'print geometry');
    await page.goto(pathToFileURL(result.outPath).href);
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1100, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      for (let i = 0; i < 5; i++) {
        await page.locator('.slide-thumb').nth(i).click();
        await page.waitForTimeout(120);
        assert.deepEqual(
          await inspect(page),
          { count: 1, errors: [] },
          `editor slide ${i + 1} at ${viewport.width}`,
        );
      }
    }
    await page.locator('#present').click();
    await page.waitForTimeout(150);
    assert.deepEqual(await inspect(page), { count: 1, errors: [] }, 'presentation');
    await page.keyboard.press('Escape');
  },
);
