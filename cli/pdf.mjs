import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { bundleRuntime, sourceBlock } from './compile.mjs';
import slideSize from '../src/slide-size.json' with { type: 'json' };

export function pdfOutputPath(htmlPath) {
  const extension = extname(htmlPath);
  const path = extension ? htmlPath.slice(0, -extension.length) + '.pdf' : htmlPath + '.pdf';
  if (resolve(path) === resolve(htmlPath))
    throw new Error('HTMLの出力先には.pdf以外の拡張子を指定してください。');
  return path;
}

export async function createPdfHtml(deck, parts) {
  const [bundle, css] = await Promise.all([
    bundleRuntime('pdf-entry.ts'),
    readFile(new URL('./pdf.css', import.meta.url), 'utf8'),
  ]);
  const runtime = bundle.outputFiles[0].text;
  if (/<\/script[\s>]/i.test(runtime)) throw new Error('Unsafe script terminator in PDF runtime');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<style>${parts.mathCSS}</style><style>${parts.css}</style>
<style>@page { size: ${slideSize.width}px ${slideSize.height}px; margin: 0; }\n${css}</style>
</head><body class="milo-pdf">
${deck.blocks.map(sourceBlock).join('\n')}
<script>${runtime}</script>
</body></html>`;
}

export async function waitForPdfReady(page, timeout = 30_000) {
  await page.waitForFunction(
    () => window.__miloPdfReady !== undefined && window.__miloPdfReady !== false,
    null,
    { timeout },
  );
  const status = await page.evaluate(() => window.__miloPdfReady);
  if (status !== true) throw new Error(status?.error || 'PDFの描画が完了しませんでした。');
}

export async function renderPdf({ deck, parts, outPath, timeout = 30_000 }) {
  const { chromium } = await import('playwright');
  try {
    await access(chromium.executablePath());
  } catch {
    throw new Error(
      'PDF出力用のChromiumが見つかりません。npx playwright install chromium を実行してください。',
    );
  }
  const html = await createPdfHtml(deck, parts);
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
    await waitForPdfReady(page, timeout);
    if (runtimeError) throw runtimeError;
    const pdf = await page.pdf({
      width: `${slideSize.width}px`,
      height: `${slideSize.height}px`,
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout,
    });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, pdf);
    return outPath;
  } catch (error) {
    throw new Error(`PDF出力に失敗しました: ${error.message}`, { cause: error });
  } finally {
    await browser.close();
  }
}
