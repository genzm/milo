import { lineBoxes, piecesText, round, snippet, textBlocks } from '../dom';
import type { Check } from '../types';

// A wrapped run whose last line holds at most this many characters and spans at
// most this fraction of its widest line. Both must hold, so narrow cards with
// few characters per line are not flagged.
const MAX_CHARS = 4;
const MAX_RATIO = 0.3;

export const orphanLine: Check = ({ content }, report) => {
  for (const block of textBlocks(content)) {
    // Preformatted lines break where the author put a newline.
    if (getComputedStyle(block.element).whiteSpace.match(/^pre|break-spaces/)) continue;
    for (const segment of block.segments) {
      const lines = lineBoxes(segment);
      if (lines.length < 2) continue;
      const last = lines[lines.length - 1];
      const chars = [...last.text].length;
      const widest = Math.max(...lines.map((line) => line.right - line.left));
      const ratio = widest > 0 ? (last.right - last.left) / widest : 1;
      if (chars > MAX_CHARS || ratio > MAX_RATIO) continue;
      report({
        message: `${lines.length}行目が「${last.text}」の${chars}文字だけです`,
        text: snippet(piecesText(segment)),
        metrics: { lines: lines.length, lastLineChars: chars, lastLineRatio: round(ratio, 2) },
      });
    }
  }
};
