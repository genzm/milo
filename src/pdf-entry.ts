import { SourceStore } from './source';
import { renderSlide, type Rendered } from './render';
import { slideLayout } from './slide-layout.mjs';
import { slideFrameMarkup, slideNumber } from './slide-frame';
import size from './slide-size.json';

declare global {
  interface Window {
    __miloPdfReady: boolean | { error: string };
  }
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function renderPdf() {
  window.__miloPdfReady = false;
  const store = SourceStore.fromDOM(document);
  const slides = store.list('slide');
  if (!slides.length) throw new Error('スライドがありません。');
  document.documentElement.style.setProperty('--slide-width', `${size.width}px`);
  document.documentElement.style.setProperty('--slide-height', `${size.height}px`);
  const rendered: Rendered[] = [];
  for (const [index, block] of slides.entries()) {
    const slide = document.createElement('article');
    slide.className = `slide layout-${slideLayout(block.text) ?? 'lab'}`;
    slide.innerHTML = slideFrameMarkup();
    slide.querySelector('.slide-series')!.textContent = slideNumber(index, slides.length);
    document.body.append(slide);
    rendered.push(
      renderSlide(slide.querySelector<HTMLElement>('.slide-content')!, block.text, {
        store,
        present: () => true,
        parameters: (_, model) => model.parameters,
        setParameter: () => {},
        inspect: () => {},
      }),
    );
  }
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map(async (image) => {
      try {
        await image.decode();
      } catch {
        throw new Error(`画像を読み込めません: ${image.alt || image.src.slice(0, 100)}`);
      }
    }),
  );

  // Reuse renderer updates after fonts/images load, then wait for the Canvas
  // ResizeObservers to settle. Readiness must reflect the final print layout.
  let previous = '',
    stable = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    rendered.forEach((slide) => slide.update());
    await frame();
    const geometry = JSON.stringify(
      [...document.querySelectorAll('.milo-canvas, .canvas-node')].map((element) => {
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height, element.scrollHeight];
      }),
    );
    stable = geometry === previous ? stable + 1 : 0;
    previous = geometry;
    if (stable >= 2) {
      const error = document.querySelector('.block-error, .inline-error');
      const missingValue = [...document.querySelectorAll('.live-value')].some(
        (value) => value.textContent === '?',
      );
      if (error || missingValue)
        throw new Error(error?.textContent || 'モデルの値を表示できません。');
      rendered.forEach((slide) => slide.dispose());
      window.__miloPdfReady = true;
      return;
    }
  }
  throw new Error('Canvasの配置が安定しません。');
}

void renderPdf().catch((error: unknown) => {
  window.__miloPdfReady = { error: error instanceof Error ? error.message : String(error) };
});
