import { collapse, snippet } from '../dom';
import type { Check } from '../types';

// Canvas and diagram already detect overflow during layout and expose it on the
// figure element. This rule only relays those signals.
const FIGURE = '.milo-canvas, .milo-diagram';
const SKIP = '.canvas-overflow-hint, .diagram-overflow-hint, svg';

function ownText(element: Element) {
  return collapse(
    [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.nodeValue)
      .join(''),
  );
}

/** One label from the figure. A whole-figure concatenation is not a source line. */
function anchorText(root: Element | null | undefined) {
  if (!root) return undefined;
  let short: string | undefined;
  for (const element of root.querySelectorAll('*')) {
    if (element.closest(SKIP)) continue;
    const text = ownText(element);
    if (!text) continue;
    if ([...text].length >= 4) return snippet(text);
    short ??= text;
  }
  return short;
}

export const figureOverflow: Check = ({ content }, report) => {
  for (const figure of content.querySelectorAll(
    '[data-canvas-overflow], [data-diagram-overflow]',
  )) {
    const own = (selector: string) =>
      [...figure.querySelectorAll(selector)].find((element) => element.closest(FIGURE) === figure);
    const codes = figure.getAttribute('data-canvas-overflow');
    const message =
      collapse(own('.canvas-overflow-hint, .diagram-overflow-hint')?.textContent) ||
      '図が領域に収まりません';
    report({
      message: codes ? `${message} (${codes})` : message,
      text: anchorText(own('.canvas-content, .diagram-content')),
    });
  }
};
