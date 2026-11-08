import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchTestBrowser } from './helpers/browser.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../cli/compile.mjs';
import { createPdfHtml, waitForPdfReady } from '../cli/pdf.mjs';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/annotation-arrows.md');

test(
  'annotation arrows keep a similar block shape across lengths in Chromium',
  { timeout: 90_000 },
  async (t) => {
    const browser = await launchTestBrowser(t);
    if (!browser) return;
    const dir = await mkdtemp(join(tmpdir(), 'milo-annotation-arrows-'));
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
        const footer = slide.querySelector('.slide-footer-content')?.textContent || '';
        const pattern = /pattern:\s*([a-z0-9-]+)/.exec(footer)?.[1] || '';
        const errors = [];
        const composition = slide.querySelector('.milo-composition');
        if (!pattern) return { pattern, errors };
        if (!composition) errors.push('missing composition');
        const groups = [...slide.querySelectorAll('.composition-arrow')];
        if (!groups.length) errors.push('missing arrows');
        for (const error of slide.querySelectorAll('.block-error,.inline-error'))
          errors.push(error.textContent || 'error');
        for (const group of groups) {
          const id = group.getAttribute('data-annotation') || '';
          const arrows = group.getAttribute('data-arrows') || '';
          const path = group.querySelector('path');
          if (!path) {
            errors.push(`missing path ${id}`);
            continue;
          }
          const d = path.getAttribute('d') || '';
          if (!d.startsWith('M ') || d.includes('NaN')) errors.push(`bad path ${id}`);
          const box = path.getBoundingClientRect();
          const major = Math.max(box.width, box.height);
          const minor = Math.min(box.width, box.height);
          if (major < 8) errors.push(`tiny arrow ${id}`);
          if (minor / major > 0.55) errors.push(`fat arrow ${id} ${minor / major}`);
          if (arrows === 'both') {
            const points = [...d.matchAll(/[ML] ([\d.e+-]+) ([\d.e+-]+)/g)].map((match) => ({
              x: Number(match[1]),
              y: Number(match[2]),
            }));
            const svgBox = path.getBBox();
            const onTip = (x, y) =>
              points.some((point) => Math.abs(point.x - x) < 0.8 && Math.abs(point.y - y) < 0.8);
            const horizontal = svgBox.width >= svgBox.height;
            const tipA = horizontal
              ? [svgBox.x, svgBox.y + svgBox.height / 2]
              : [svgBox.x + svgBox.width / 2, svgBox.y];
            const tipB = horizontal
              ? [svgBox.x + svgBox.width, svgBox.y + svgBox.height / 2]
              : [svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height];
            if (!onTip(...tipA) || !onTip(...tipB)) errors.push(`both tips ${id}`);
          }
          const label = group.querySelector('text');
          if (label) {
            const r = label.getBoundingClientRect();
            if (label.classList.contains('is-inside')) errors.push(`label inside ${id}`);
            if (r.bottom > box.top + 1) errors.push(`label not above ${id}`);
          }
        }
        if (pattern === 'row-switch') {
          const into = slide
            .querySelector('[data-annotation="into"] path')
            ?.getBoundingClientRect();
          const both = slide
            .querySelector('[data-annotation="switch"] path')
            ?.getBoundingClientRect();
          if (into && both && both.height > into.height * 1.35)
            errors.push('switch thicker than one-way neighbors');
        }
        if (pattern === 'length-scale' || pattern === 'length-scale-both') {
          const short = slide
            .querySelector('[data-annotation="scale-short"] path')
            ?.getBoundingClientRect();
          const mid = slide
            .querySelector('[data-annotation="scale-mid"] path')
            ?.getBoundingClientRect();
          const long = slide
            .querySelector('[data-annotation="scale-long"] path')
            ?.getBoundingClientRect();
          if (!short || !mid || !long) errors.push('missing scale arrows');
          else {
            if (!(short.width < mid.width && mid.width < long.width))
              errors.push('scale widths not increasing');
            if (!(short.height <= mid.height + 1 && mid.height <= long.height + 1))
              errors.push('scale heights not increasing');
            if (short.height / short.width > 0.55) errors.push('short not length-scaled');
          }
        }
        if (pattern === 'with-cross') {
          const arrow = slide
            .querySelector('[data-annotation="proposal"] path')
            ?.getBoundingClientRect();
          const cross = slide
            .querySelector('[data-cross-target="proposal"]')
            ?.getBoundingClientRect();
          if (arrow && cross && !overlap(arrow, cross)) errors.push('cross missed arrow');
        }
        return { pattern, arrows: groups.length, errors };
      });
    });
    const patterned = measured.filter((slide) => slide.pattern);
    assert.ok(patterned.length >= 30, `expected many pattern slides, got ${patterned.length}`);
    for (const slide of patterned) {
      assert.ok(slide.arrows >= 1, `${slide.pattern}: missing arrows`);
      assert.deepEqual(slide.errors, [], slide.pattern);
    }
  },
);
