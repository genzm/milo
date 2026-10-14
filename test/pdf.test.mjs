import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Window } from 'happy-dom';
import { bundleRuntime, compile } from '../cli/compile.mjs';
import { createPdfHtml, pdfOutputPath, waitForPdfReady } from '../cli/pdf.mjs';
import { SourceStore } from '../src/source.ts';
import size from '../src/slide-size.json' with { type: 'json' };

const exec = promisify(execFile);

test('PDF runtime shares the renderer without bundling editor, storage or Playwright', async () => {
  const { metafile } = await bundleRuntime('pdf-entry.ts');
  const inputs = Object.keys(metafile.inputs);
  for (const module of ['render.ts', 'directives.ts', 'canvas.ts', 'expression.ts']) {
    assert.ok(
      inputs.some((input) => input.endsWith(`/src/${module}`) || input === `src/${module}`),
    );
  }
  assert.ok(
    !inputs.some((input) => /@codemirror|playwright|src\/(app|cache|drafts|save)\.ts/.test(input)),
  );
});

test('PDF document embeds the same sources and styles with the configured page size', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'milo-pdf-'));
  const window = new Window({
    settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true },
  });
  try {
    const result = await compile({ input: 'content', out: join(dir, 'slides.html') });
    const html = await createPdfHtml(result.deck, result.parts);
    window.document.write(html);
    const sources = SourceStore.fromDOM(window.document);
    assert.deepEqual(sources.list(), result.blocks);
    assert.equal(sources.list('slide').length, 5);
    const styles = [...window.document.querySelectorAll('style')].map((style) => style.textContent);
    assert.equal(styles[0], result.parts.mathCSS);
    assert.equal(styles[1], result.parts.css);
    assert.ok(styles[2].includes(`size: ${size.width}px ${size.height}px`));
    assert.equal(window.document.querySelector('#app'), null);
    assert.equal(pdfOutputPath(result.outPath), join(dir, 'slides.pdf'));
    assert.throws(() => pdfOutputPath(join(dir, 'slides.pdf')), /HTML/);
  } finally {
    window.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('PDF readiness reports rendering errors and applies a bounded wait', async () => {
  let options;
  const page = {
    waitForFunction: async (_, __, value) => {
      options = value;
    },
    evaluate: async () => ({ error: '画像を読み込めません' }),
  };
  await assert.rejects(waitForPdfReady(page, 1234), /画像を読み込めません/);
  assert.equal(options.timeout, 1234);
  page.evaluate = async () => true;
  await waitForPdfReady(page);
});

test('HTML-only CLI works without Chromium; failed PDF output preserves identical HTML', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'milo-pdf-cli-'));
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(dir, 'missing-browsers') };
  const output = join(dir, 'slides.html');
  const args = ['cli/milo.mjs', 'content', '-o', output];
  try {
    await exec(process.execPath, args, { env });
    const original = await readFile(output, 'utf8');
    await assert.rejects(exec(process.execPath, [...args, '--pdf'], { env }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /npx playwright install chromium/);
      return true;
    });
    assert.equal(await readFile(output, 'utf8'), original);
    await assert.rejects(readFile(join(dir, 'slides.pdf')), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
