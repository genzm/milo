import { renderDeck } from './headless';

declare global {
  interface Window {
    __miloPdfReady: boolean | { error: string };
  }
}

async function renderPdf() {
  window.__miloPdfReady = false;
  const { dispose } = await renderDeck();
  try {
    const broken = [...document.images].find((image) => !image.complete || !image.naturalWidth);
    if (broken) throw new Error(`画像を読み込めません: ${broken.alt || broken.src.slice(0, 100)}`);
    const error = document.querySelector('.block-error, .inline-error');
    if (error) throw new Error(error.textContent || 'スライドを描画できません。');
  } finally {
    dispose();
  }
  window.__miloPdfReady = true;
}

void renderPdf().catch((error: unknown) => {
  window.__miloPdfReady = { error: error instanceof Error ? error.message : String(error) };
});
