import { collapse } from '../dom';
import type { Check } from '../types';

export const renderError: Check = ({ content }, report) => {
  for (const element of content.querySelectorAll<HTMLElement>(
    '.block-error, .inline-error, .manifest-error',
  )) {
    if (element.hidden) continue;
    report({ message: collapse(element.textContent) || '描画できません。' });
  }
};
