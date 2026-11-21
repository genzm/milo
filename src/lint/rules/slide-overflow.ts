import { clips, contentBox, isHidden, isOpaque, round, snippet } from '../dom';
import type { Check } from '../types';

const TOLERANCE = 1;
const SIDES = [
  ['bottom', '下'],
  ['right', '右'],
  ['left', '左'],
  ['top', '上'],
] as const;

function hasOwnText(element: Element) {
  return [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim(),
  );
}

/** `.slide-content` clips its children; anything past its content box is cut off or hits the footer. */
export const slideOverflow: Check = ({ content }, report) => {
  const area = contentBox(content);
  const worst = { bottom: 0, right: 0, left: 0, top: 0 };
  const clipped = new Map<Element, boolean>();
  const insideClip = (element: Element): boolean => {
    const parent = element.parentElement;
    if (!parent || parent === content) return false;
    let value = clipped.get(parent);
    if (value === undefined) clipped.set(parent, (value = clips(parent) || insideClip(parent)));
    return value;
  };
  let firstText: Element | null = null,
    firstAny: Element | null = null;
  for (const element of content.querySelectorAll('*')) {
    if (element.matches('.slide-footer-content') || element.closest('.slide-footer-content'))
      continue;
    if (isOpaque(element) || isHidden(element) || insideClip(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const out = {
      bottom: rect.bottom - area.bottom,
      right: rect.right - area.right,
      left: area.left - rect.left,
      top: area.top - rect.top,
    };
    if (Math.max(out.bottom, out.right, out.left, out.top) <= TOLERANCE) continue;
    for (const [side] of SIDES) worst[side] = Math.max(worst[side], out[side]);
    firstAny ??= element;
    if (!firstText && hasOwnText(element)) firstText = element;
  }
  if (!firstAny) return;
  const sides = SIDES.filter(([side]) => worst[side] > TOLERANCE);
  report({
    message: `本文が${sides.map(([side, label]) => `${label}に${round(worst[side])}px`).join('、')}はみ出しています`,
    text: snippet(firstText ?? firstAny) || undefined,
    metrics: Object.fromEntries(sides.map(([side]) => [side, round(worst[side])])),
  });
};
