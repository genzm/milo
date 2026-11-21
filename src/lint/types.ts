import catalog from './rules.json';

export type RuleId = keyof typeof catalog;
export type Severity = 'error' | 'warning' | 'info';

export interface RuleInfo {
  severity: Severity;
  summary: string;
  hint: string;
}

export const RULES = catalog as Record<RuleId, RuleInfo>;

/** One problem on one rendered slide, worded for the author (human or agent). */
export interface Finding {
  rule: RuleId;
  severity: Severity;
  /** 1-based slide number. */
  slide: number;
  message: string;
  hint: string;
  /** Visible text near the problem. The CLI uses it to find the source line. */
  text?: string;
  metrics?: Record<string, number>;
}

/** A slide that has been rendered and laid out at its final size. */
export interface SlideView {
  index: number;
  slide: HTMLElement;
  content: HTMLElement;
}

export interface Report {
  (finding: Pick<Finding, 'message' | 'text' | 'metrics'> & { hint?: string }): void;
}

/** Checks only observe the DOM. They never import renderer internals. */
export type Check = (view: SlideView, report: Report) => void;
