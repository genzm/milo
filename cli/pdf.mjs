import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { createHeadlessHtml, loadChromium, waitForResult, withDeckPage } from './headless.mjs';
import slideSize from '../src/slide-size.json' with { type: 'json' };

export function pdfOutputPath(htmlPath) {
  const extension = extname(htmlPath);
  const path = extension ? htmlPath.slice(0, -extension.length) + '.pdf' : htmlPath + '.pdf';
  if (resolve(path) === resolve(htmlPath))
    throw new Error('HTMLの出力先には.pdf以外の拡張子を指定してください。');
  return path;
}

export function createPdfHtml(deck, parts) {
  return createHeadlessHtml('pdf-entry.ts', deck, parts);
}

export async function waitForPdfReady(page, timeout = 30_000) {
  const status = await waitForResult(page, '__miloPdfReady', timeout);
  if (status !== true) throw new Error('PDFの描画が完了しませんでした。');
}

export async function renderPdf({ deck, parts, outPath, timeout = 30_000 }) {
  const chromium = await loadChromium();
  try {
    const html = await createPdfHtml(deck, parts);
    const pdf = await withDeckPage({ chromium, html, timeout }, async (page) => {
      await waitForPdfReady(page, timeout);
      return page.pdf({
        width: `${slideSize.width}px`,
        height: `${slideSize.height}px`,
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        timeout,
      });
    });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, pdf);
    return outPath;
  } catch (error) {
    throw new Error(`PDF出力に失敗しました: ${error.message}`, { cause: error });
  }
}
