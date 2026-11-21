import { SourceStore } from './source';
import { renderSlide, type Rendered } from './render';
import { slideLayout } from './slide-layout.mjs';
import { slideFrameMarkup, slideNumber } from './slide-frame';
import size from './slide-size.json';

export interface HeadlessSlide {
  index: number;
  id: string;
  slide: HTMLElement;
  content: HTMLElement;
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Render every slide at print size and wait until the layout stops moving. */
export async function renderDeck(): Promise<{ slides: HeadlessSlide[]; dispose: () => void }> {
  const store = SourceStore.fromDOM(document);
  const blocks = store.list('slide');
  if (!blocks.length) throw new Error('スライドがありません。');
  document.documentElement.style.setProperty('--slide-width', `${size.width}px`);
  document.documentElement.style.setProperty('--slide-height', `${size.height}px`);
  const rendered: Rendered[] = [];
  const slides: HeadlessSlide[] = [];
  const dispose = () => rendered.forEach((slide) => slide.dispose());
  try {
    for (const [index, block] of blocks.entries()) {
      const slide = document.createElement('article');
      slide.className = `slide layout-${slideLayout(block.text) ?? 'lab'}`;
      slide.innerHTML = slideFrameMarkup();
      slide.querySelector('.slide-series')!.textContent = slideNumber(index, blocks.length);
      document.body.append(slide);
      const content = slide.querySelector<HTMLElement>('.slide-content')!;
      rendered.push(
        renderSlide(content, block.text, { store, present: () => true, inspect: () => {} }),
      );
      slides.push({ index, id: block.id, slide, content });
    }
    await document.fonts.ready;
    // Broken images are reported by the caller; decoding only waits for them.
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));

    // Reuse renderer updates after fonts/images load, then wait for the Canvas
    // ResizeObservers to settle. Readiness must reflect the final print layout.
    let previous = '',
      stable = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      rendered.forEach((slide) => slide.update());
      await frame();
      const geometry = JSON.stringify(
        [
          ...document.querySelectorAll(
            '.milo-canvas, .canvas-node, .milo-diagram, .diagram-vertex, .diagram-card, .diagram-dot, .diagram-label, .diagram-note',
          ),
        ].map((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height, element.scrollHeight];
        }),
      );
      stable = geometry === previous ? stable + 1 : 0;
      previous = geometry;
      if (stable >= 2) return { slides, dispose };
    }
    throw new Error('Canvasの配置が安定しません。');
  } catch (error) {
    dispose();
    throw error;
  }
}
