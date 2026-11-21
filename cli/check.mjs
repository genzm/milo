import { relative } from 'node:path';
import { slideStyles } from './compile.mjs';
import { createHeadlessHtml, loadChromium, waitForResult, withDeckPage } from './headless.mjs';
import rules from '../src/lint/rules.json' with { type: 'json' };

export const SEVERITIES = ['error', 'warning', 'info'];

export function ruleCatalog() {
  return Object.entries(rules).map(([id, rule]) => ({ id, ...rule }));
}

// Rendered text loses Markdown punctuation, so compare both sides without it.
const plain = (text) => text.replace(/[\s*_=+`#>|[\]()!~\\-]/g, '');

/** Longest slice of `needle` that occurs in `line`, measured in characters. */
function containedLength(needle, line) {
  const chars = [...needle];
  if (!chars.length || !line) return 0;
  if (line.includes(needle)) return chars.length;
  let best = 0;
  for (let size = chars.length - 1; size >= 4 && size > best; size--) {
    for (let start = 0; start + size <= chars.length; start++) {
      if (line.includes(chars.slice(start, start + size).join(''))) {
        best = size;
        break;
      }
    }
  }
  return best;
}

function bestFit(needle, lines) {
  const width = [...needle].length;
  // One character matches almost every line. A partial match needs four.
  if (width < 2) return { index: -1, score: 0 };
  let best = { index: -1, score: 0 };
  for (let index = 0; index < lines.length; index++) {
    const score = containedLength(needle, lines[index]);
    if ((score === width || score >= 4) && score > best.score) best = { index, score };
  }
  return best;
}

/**
 * Source line for a finding. `text` is an authored phrase; `message` is the
 * fallback when that phrase is not in the slide (render errors quote the
 * diagnostic, which still contains a token from the source).
 */
export function locateLine(slideText, startLine, text, message) {
  if (startLine === undefined) return undefined;
  const lines = slideText.split('\n').map(plain);
  const fromText = bestFit(plain((text || '').replace(/…$/, '')), lines);
  const fromMessage = bestFit(plain(message || ''), lines);
  const best = fromText.score >= fromMessage.score ? fromText : fromMessage;
  if (best.index < 0) return startLine;
  return startLine + best.index;
}

export function summarize(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

export async function checkDeck({ deck, resources, timeout = 30_000 }) {
  const chromium = await loadChromium();
  const html = await createHeadlessHtml('check-entry.ts', deck, await slideStyles(resources));
  const { findings } = await withDeckPage({ chromium, html, timeout }, (page) =>
    waitForResult(page, '__miloCheck', timeout),
  );
  const slides = deck.blocks.filter((block) => block.kind === 'slide');
  const located = findings.map((finding) => ({
    ...finding,
    line: locateLine(
      slides[finding.slide - 1]?.text ?? '',
      deck.slideLines?.[finding.slide - 1],
      finding.text,
      finding.message,
    ),
  }));
  return {
    file: deck.slidesFile,
    slides: slides.length,
    counts: summarize(located),
    findings: located,
  };
}

export function formatJson(report, cwd = process.cwd()) {
  return JSON.stringify(
    {
      ...report,
      file: report.file ? relative(cwd, report.file) : undefined,
      findings: report.findings.map(
        ({ rule, severity, slide, line, message, hint, text, metrics }) => ({
          rule,
          severity,
          slide,
          line,
          message,
          hint,
          text,
          metrics,
        }),
      ),
    },
    null,
    2,
  );
}

export function formatText(report, cwd = process.cwd()) {
  const file = report.file ? relative(cwd, report.file) : '';
  const lines = report.findings.map((finding) => {
    const where = file && finding.line ? `${file}:${finding.line}` : `スライド ${finding.slide}`;
    const quote = finding.text ? `\n  「${finding.text}」` : '';
    return `${where}  ${finding.severity}  ${finding.rule}  スライド ${finding.slide}: ${finding.message}${quote}\n  → ${finding.hint}`;
  });
  const { error, warning, info } = report.counts;
  lines.push(
    `${report.slides} slides: ${error} errors, ${warning} warnings${info ? `, ${info} info` : ''}`,
  );
  return lines.join('\n\n');
}

export function formatCatalog() {
  return ruleCatalog()
    .map((rule) => `${rule.id}  ${rule.severity}\n  ${rule.summary}\n  → ${rule.hint}`)
    .join('\n\n');
}
