import { brokenImage } from './rules/broken-image';
import { boxOverflow } from './rules/box-overflow';
import { figureOverflow } from './rules/figure-overflow';
import { orphanLine } from './rules/orphan-line';
import { renderError } from './rules/render-error';
import { slideOverflow } from './rules/slide-overflow';
import { RULES, type Check, type Finding, type RuleId, type SlideView } from './types';

export { RULES } from './types';
export type { Check, Finding, RuleId, RuleInfo, Severity, SlideView } from './types';

/** Every rule in rules.json must have a check here. */
export const CHECKS: Record<RuleId, Check> = {
  'render-error': renderError,
  'broken-image': brokenImage,
  'slide-overflow': slideOverflow,
  'box-overflow': boxOverflow,
  'figure-overflow': figureOverflow,
  'orphan-line': orphanLine,
};

export function lintSlide(view: SlideView, checks: Partial<Record<RuleId, Check>> = CHECKS) {
  const findings: Finding[] = [];
  const slide = view.index + 1;
  for (const [rule, check] of Object.entries(checks) as [RuleId, Check][]) {
    const { severity, hint } = RULES[rule];
    try {
      check(view, (found) =>
        findings.push({
          rule,
          severity,
          slide,
          message: found.message,
          hint: found.hint ?? hint,
          ...(found.text && { text: found.text }),
          ...(found.metrics && Object.keys(found.metrics).length && { metrics: found.metrics }),
        }),
      );
    } catch (error) {
      // A broken check must not hide the other findings.
      findings.push({
        rule,
        severity: 'error',
        slide,
        message: `検査を実行できませんでした: ${error instanceof Error ? error.message : String(error)}`,
        hint: 'milo の不具合です。このスライドは目視で確認してください。',
      });
    }
  }
  return findings;
}
