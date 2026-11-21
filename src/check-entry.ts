import { renderDeck } from './headless';
import { lintSlide, type Finding } from './lint';

declare global {
  interface Window {
    __miloCheck?: { findings: Finding[] } | { error: string };
  }
}

async function check() {
  const { slides, dispose } = await renderDeck();
  try {
    window.__miloCheck = { findings: slides.flatMap((slide) => lintSlide(slide)) };
  } finally {
    dispose();
  }
}

void check().catch((error: unknown) => {
  window.__miloCheck = { error: error instanceof Error ? error.message : String(error) };
});
