import { access, readFile } from 'node:fs/promises';
import { bundleRuntime, sourceBlock } from './compile.mjs';
import slideSize from '../src/slide-size.json' with { type: 'json' };

/** A page that holds the deck sources and runs one headless entry, without the editor. */
export async function createHeadlessHtml(entry, deck, parts) {
  const [bundle, css] = await Promise.all([
    bundleRuntime(entry),
    readFile(new URL('./pdf.css', import.meta.url), 'utf8'),
  ]);
  const runtime = bundle.outputFiles[0].text;
  if (/<\/script[\s>]/i.test(runtime)) throw new Error(`Unsafe script terminator in ${entry}`);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<style>${parts.mathCSS}</style><style>${parts.css}</style>
<style>@page { size: ${slideSize.width}px ${slideSize.height}px; margin: 0; }\n${css}</style>
</head><body class="milo-pdf">
${deck.blocks.map(sourceBlock).join('\n')}
<script>${runtime}</script>
</body></html>`;
}

export async function loadChromium() {
  const { chromium } = await import('playwright');
  try {
    await access(chromium.executablePath());
  } catch {
    throw new Error(
      'Chromiumが見つかりません。npx playwright install chromium を実行してください。',
    );
  }
  return chromium;
}

/** Wait until the entry publishes `window[name]`; reject if it published `{ error }`. */
export async function waitForResult(page, name, timeout = 30_000) {
  await page.waitForFunction((key) => window[key] !== undefined && window[key] !== false, name, {
    timeout,
  });
  const value = await page.evaluate((key) => window[key], name);
  if (value && typeof value === 'object' && 'error' in value)
    throw new Error(value.error || '描画が完了しませんでした。');
  return value;
}

/** Open the headless page offline at slide size and hand it to `use`. */
export async function withDeckPage({ chromium, html, timeout = 30_000 }, use) {
  const browser = await chromium.launch({ headless: true, timeout });
  try {
    const page = await browser.newPage({ viewport: slideSize });
    let runtimeError;
    page.on('pageerror', (error) => {
      runtimeError = error;
    });
    await page.route('**/*', (route) => route.abort());
    await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
    await page.setContent(html, { waitUntil: 'load', timeout });
    const result = await use(page);
    if (runtimeError) throw runtimeError;
    return result;
  } finally {
    await browser.close();
  }
}
