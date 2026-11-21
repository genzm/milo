import type { Check } from '../types';

export const brokenImage: Check = ({ content }, report) => {
  for (const image of content.querySelectorAll('img')) {
    if (image.complete && image.naturalWidth > 0) continue;
    const alt = image.getAttribute('alt') || '';
    report({
      message: `画像を読み込めません: ${alt || (image.getAttribute('src') || '').slice(0, 80)}`,
      text: alt || undefined,
    });
  }
};
