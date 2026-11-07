import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchTestBrowser } from './helpers/browser.mjs';
import { compile } from '../cli/compile.mjs';
import { createPdfHtml, waitForPdfReady } from '../cli/pdf.mjs';

async function inspect(page) {
  return page.evaluate(() => {
    const errors = [];
    const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    for (const slide of document.querySelectorAll('.slide')) {
      const bounds = slide.getBoundingClientRect();
      const scale = bounds.width / 1600;
      for (const error of slide.querySelectorAll('.block-error,.inline-error'))
        errors.push(error.textContent);
      for (const element of slide.querySelectorAll(
        '.canvas-node,.slide-card,.composition-arrow > path,.composition-cross,.composition-arrow-label',
      )) {
        const r = element.getBoundingClientRect();
        if (
          r.left < bounds.left - 1 ||
          r.right > bounds.right + 1 ||
          r.top < bounds.top - 1 ||
          r.bottom > bounds.bottom - 50 * scale + 1
        )
          errors.push(`clipped ${element.className.baseVal || element.className}`);
      }
      for (const label of slide.querySelectorAll('.composition-arrow-label')) {
        const r = label.getBoundingClientRect(),
          arrow = label.parentElement.querySelector('path').getBoundingClientRect();
        if (label.classList.contains('is-inside')) errors.push('label inside arrow');
        if (r.bottom > arrow.top + 1) errors.push('label not above arrow');
      }
      const composition = slide.querySelector('.milo-composition');
      if (!composition) continue;
      const part = (id) =>
        composition.querySelector(`[data-composition-part="${id}"]`).getBoundingClientRect();
      const arrow = (id) =>
        composition.querySelector(`[data-annotation="${id}"] > path`).getBoundingClientRect();
      if (composition.querySelector('[data-annotation="proposal"]')) {
        const a = part('problem'),
          b = part('solution'),
          line = arrow('proposal');
        if (
          Math.abs(line.left - a.right - 12 * scale) > 1 ||
          Math.abs(b.left - line.right - 12 * scale) > 1
        )
          errors.push('proposal detached');
        if (Math.abs((a.left + b.right) / 2 - center(bounds).x) > 1)
          errors.push('pair not centered');
        if (line.width > 190 * scale) errors.push('pair arrow stretched');
        const cross = composition.querySelector('[data-cross-target="proposal"]');
        if (cross) {
          const c = center(cross.getBoundingClientRect()),
            d = center(line);
          if (Math.abs(c.x - d.x) > 1 || Math.abs(c.y - d.y) > 1) errors.push('cross detached');
        }
      }
      if (composition.querySelector('[data-annotation="time"]')) {
        const a = part('now'),
          b = part('future'),
          line = arrow('time');
        if (line.left <= a.right || line.right >= b.left)
          errors.push('time arrow overlaps diagrams');
        const nowDiagram = composition
          .querySelector('[data-composition-part="now"] .milo-diagram')
          .getBoundingClientRect();
        if (Math.abs(center(line).y - center(nowDiagram).y) > 2)
          errors.push('time arrow not on diagrams');
      }
      if (composition.querySelector('[data-annotation="solve"]')) {
        const node = composition
          .querySelector('[data-canvas-node="store"]')
          .getBoundingClientRect();
        const line = arrow('solve'),
          box = part('solution');
        if (
          Math.abs(line.left - node.right - 12 * scale) > 1 ||
          Math.abs(box.left - line.right - 12 * scale) > 1
        )
          errors.push('node arrow detached');
        if (Math.abs(center(node).y - center(line).y) > 1) errors.push('node arrow is not level');
      }
      for (const group of composition.querySelectorAll(
        '.composition-arrow.annotation-tone-accent',
      )) {
        if (getComputedStyle(group.querySelector('path')).fill !== 'rgb(212, 45, 90)')
          errors.push('accent changed');
      }
    }
    return errors;
  });
}

test(
  'annotation examples fit, remain anchored on resize, and render in PDF and presentation',
  { timeout: 90_000 },
  async (t) => {
    const browser = await launchTestBrowser(t);
    if (!browser) return;
    const dir = await mkdtemp(join(tmpdir(), 'milo-annotations-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const result = await compile({
      input: fileURLToPath(new URL('../examples/annotations.md', import.meta.url)),
      out: join(dir, 'slides.html'),
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.setContent(await createPdfHtml(result.deck, result.parts));
    await waitForPdfReady(page);
    assert.equal(await page.locator('.composition-arrow').count(), 6);
    assert.equal(await page.locator('.composition-cross').count(), 2);
    assert.deepEqual(await inspect(page), [], 'PDF geometry');
    const pdf = await page.pdf({ width: '1600px', height: '900px', printBackground: true });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    await page.goto(pathToFileURL(result.outPath).href);
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1100, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      for (let i = 0; i < 6; i++) {
        await page.locator('.slide-thumb').nth(i).click();
        await page.waitForTimeout(180);
        assert.deepEqual(await inspect(page), [], `editor slide ${i + 1} at ${viewport.width}`);
      }
    }
    await page.locator('.slide-thumb').nth(3).click();
    await page.waitForTimeout(180);
    await page.evaluate(() =>
      document
        .querySelector('[data-composition-part="problem"]')
        .style.setProperty('--composition-part-width', '360px'),
    );
    await page.waitForTimeout(180);
    assert.deepEqual(await inspect(page), [], 'target width change');
    await page.locator('#present').click();
    await page.waitForTimeout(180);
    assert.deepEqual(await inspect(page), [], 'presentation');
    assert.deepEqual(runtimeErrors, []);
  },
);

test(
  'the trade-off example keeps both tips and its external label aligned in PDF and the editor',
  { timeout: 60_000 },
  async (t) => {
    const browser = await launchTestBrowser(t);
    if (!browser) return;
    const dir = await mkdtemp(join(tmpdir(), 'milo-tradeoff-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const result = await compile({
      input: fileURLToPath(new URL('../examples/tradeoff.md', import.meta.url)),
      out: join(dir, 'slides.html'),
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const check = async () => {
      const measured = await page.evaluate(() => {
        const group = document.querySelector('[data-annotation="trade"]');
        const path = group.querySelector('path');
        const label = group.querySelector('text');
        const p = path.getBoundingClientRect(),
          l = label.getBoundingClientRect();
        const a = document
          .querySelector('[data-composition-part="exploit"]')
          .getBoundingClientRect();
        const b = document
          .querySelector('[data-composition-part="explore"]')
          .getBoundingClientRect();
        const scale = document.querySelector('.slide').getBoundingClientRect().width / 1600;
        const points = [...path.getAttribute('d').matchAll(/[ML] ([\d.e+-]+) ([\d.e+-]+)/g)].map(
          (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
        );
        const box = path.getBBox();
        const onTip = (x, y) =>
          points.some((pt) => Math.abs(pt.x - x) < 0.01 && Math.abs(pt.y - y) < 0.01);
        return {
          both: group.dataset.arrows,
          tipLeft: onTip(box.x, box.y + box.height / 2),
          tipRight: onTip(box.x + box.width, box.y + box.height / 2),
          center: Math.abs(l.x + l.width / 2 - p.x - p.width / 2) / scale,
          leftGap: (p.left - a.right) / scale,
          rightGap: (b.left - p.right) / scale,
          labelAbove: l.bottom < p.top,
          labelOutside: !label.classList.contains('is-inside'),
          label: label.textContent,
          errors: document.querySelectorAll('.block-error,.inline-error').length,
        };
      });
      assert.equal(measured.both, 'both');
      assert.equal(measured.tipLeft, true);
      assert.equal(measured.tipRight, true);
      assert.ok(measured.center < 1);
      assert.ok(Math.abs(measured.leftGap - 12) < 1);
      assert.ok(Math.abs(measured.rightGap - 12) < 1);
      assert.equal(measured.labelAbove, true);
      assert.equal(measured.labelOutside, true);
      assert.equal(measured.label, 'トレードオフ');
      assert.equal(measured.errors, 0);
    };
    await page.setContent(await createPdfHtml(result.deck, result.parts));
    await waitForPdfReady(page);
    await check();
    await page.goto(pathToFileURL(result.outPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.waitForTimeout(180);
    await check();
    await page.locator('#present').click();
    await page.waitForTimeout(180);
    await check();
  },
);
