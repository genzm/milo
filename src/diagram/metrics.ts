import { NOTE_MAX, TITLE_FONT, NOTE_FONT } from './constants';
import { type DiagramItem, type DiagramOptions, type DiagramNoteMode } from './types';

function cjkUnits(text: string) {
  let units = 0;
  for (const ch of text) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  return units;
}

function estimateWrapped(text: string, font: number, maxWidth: number, lineHeight: number) {
  const units = cjkUnits(text);
  const width = Math.min(maxWidth, Math.max(48, units * font + 8));
  const lines = Math.max(1, Math.ceil((units * font) / Math.max(32, width)));
  return { width, height: lines * font * lineHeight };
}

export function estimateTitleSize(title: string, maxWidth = NOTE_MAX) {
  return estimateWrapped(title.trim() || ' ', TITLE_FONT, maxWidth, 1.35);
}

export function estimateNoteSize(markdown: string, maxWidth = NOTE_MAX) {
  const plain = markdown.trim().replace(/[#*_`[\]]/g, '');
  if (!plain) return { width: 0, height: 0 };
  return estimateWrapped(plain, NOTE_FONT, maxWidth, 1.45);
}

export function resolvedNoteMode(item: DiagramItem, options: DiagramOptions): DiagramNoteMode {
  return item.noteMode ?? options.noteMode;
}

export function estimateLabelSize(item: DiagramItem) {
  const title = estimateTitleSize(item.title, 260);
  const extra = item.markdown.trim() ? Math.min(64, 22 + item.markdown.trim().length * 0.4) : 0;
  return { width: Math.max(96, title.width), height: title.height + extra };
}

export function estimateCardSize(item: DiagramItem, center: boolean) {
  const font = center ? 32 : 27;
  let units = 0;
  for (const ch of item.title) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  return {
    width: Math.max(center ? 280 : 168, units * font + (center ? 80 : 64)),
    height: font * 1.3 + 40,
  };
}
