import { clips, isHidden, isOpaque, round, snippet } from '../dom';
import type { Check } from '../types';

// Sub-pixel line boxes routinely exceed clientHeight by a pixel or two.
const TOLERANCE = 2;

/** Elements that clip or scroll their own content, other than the slide itself. */
export const boxOverflow: Check = ({ content }, report) => {
  for (const element of content.querySelectorAll<HTMLElement>('*')) {
    // Figures report their own overflow; see figure-overflow.
    if (element.closest('svg, .milo-canvas, .milo-diagram') || isOpaque(element)) continue;
    if (isHidden(element)) continue;
    if (!clips(element)) continue;
    const y = element.scrollHeight - element.clientHeight,
      x = element.scrollWidth - element.clientWidth;
    if (y <= TOLERANCE && x <= TOLERANCE) continue;
    const parts = [
      y > TOLERANCE ? `縦に${round(y)}px` : '',
      x > TOLERANCE ? `横に${round(x)}px` : '',
    ]
      .filter(Boolean)
      .join('、');
    report({
      message: `枠の中で内容が${parts}切れています`,
      text: snippet(element) || undefined,
      metrics: {
        ...(y > TOLERANCE && { vertical: round(y) }),
        ...(x > TOLERANCE && { horizontal: round(x) }),
      },
    });
  }
};
