export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Line extends Box {
  /** Visible characters on the line, without whitespace. */
  text: string;
}

/** Subtrees that hold no authored running text. */
const OPAQUE = 'svg, script, style, .katex-mathml';
/** Inline content measured as one piece instead of per character. */
const ATOMIC = '.katex, img';
const INLINE = new Set(['inline', 'contents']);

export function collapse(text: string | null | undefined) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/** Text as a reader sees it: without KaTeX's hidden MathML copy or SVG labels. */
export function visibleText(element: Element) {
  let text = '';
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (!node.parentElement?.closest(OPAQUE)) text += node.nodeValue;
  return text;
}

export function snippet(source: Element | string, max = 40) {
  const text = collapse(typeof source === 'string' ? source : visibleText(source));
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join('') + '…' : text;
}

export function round(value: number, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** The area children may occupy: the border box minus borders and padding. */
export function contentBox(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect(),
    style = getComputedStyle(element),
    px = (value: string) => Number.parseFloat(value) || 0;
  return {
    top: rect.top + px(style.borderTopWidth) + px(style.paddingTop),
    right: rect.right - px(style.borderRightWidth) - px(style.paddingRight),
    bottom: rect.bottom - px(style.borderBottomWidth) - px(style.paddingBottom),
    left: rect.left + px(style.borderLeftWidth) + px(style.paddingLeft),
  };
}

/** Subtrees whose geometry is not authored layout: SVG internals and KaTeX's MathML copy. */
export function isOpaque(element: Element) {
  return Boolean(element.parentElement?.closest('svg') || element.closest('.katex-mathml'));
}

export function isHidden(element: Element) {
  return (element as HTMLElement).hidden || getComputedStyle(element).display === 'none';
}

export function clips(element: Element) {
  const style = getComputedStyle(element);
  return style.overflowX !== 'visible' || style.overflowY !== 'visible';
}

/** Nearest ancestor-or-self that lays out its own lines. */
function lineContainer(element: Element, root: Element) {
  let current = element;
  while (current !== root && current.parentElement && INLINE.has(getComputedStyle(current).display))
    current = current.parentElement;
  return current as HTMLElement;
}

export type LinePiece = Text | Element;

export interface TextBlock {
  element: HTMLElement;
  /** Runs of inline content separated by explicit `<br>` breaks. */
  segments: LinePiece[][];
}

/** Every element under `root` that directly lays out visible text, in document order. */
export function textBlocks(root: HTMLElement): TextBlock[] {
  const blocks = new Map<HTMLElement, TextBlock>();
  const segmentOf = (container: HTMLElement) => {
    let block = blocks.get(container);
    if (!block) blocks.set(container, (block = { element: container, segments: [[]] }));
    return block.segments[block.segments.length - 1];
  };
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.parentElement?.closest(ATOMIC)) return NodeFilter.FILTER_REJECT;
        if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
        const element = node as Element;
        if (element.matches(OPAQUE) || isHidden(element)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue?.trim()) segmentOf(lineContainer(parent, root)).push(node as Text);
      continue;
    }
    const element = node as Element;
    if (element.tagName === 'BR') {
      const block = blocks.get(lineContainer(parent, root));
      if (block?.segments[block.segments.length - 1].length) block.segments.push([]);
    } else if (element.matches(ATOMIC)) {
      segmentOf(lineContainer(parent, root)).push(element);
    }
  }
  return [...blocks.values()].map((block) => ({
    ...block,
    segments: block.segments.filter((segment) => segment.length > 0),
  }));
}

function sameLine(line: Box, rect: DOMRect) {
  const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
  return overlap > 0.5 * Math.min(line.bottom - line.top, rect.height);
}

/** Visual line boxes of one run of inline content, top to bottom. */
export function lineBoxes(pieces: LinePiece[]): Line[] {
  const lines: Line[] = [];
  const range = pieces[0]?.ownerDocument?.createRange();
  const place = (rect: DOMRect, text: string) => {
    if (!rect.width && !rect.height) return;
    const line = lines[lines.length - 1];
    if (line && sameLine(line, rect)) {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.text += text;
    } else {
      lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, text });
    }
  };
  for (const piece of pieces) {
    if (piece.nodeType !== Node.TEXT_NODE) {
      place(
        (piece as Element).getBoundingClientRect(),
        piece.nodeName === 'IMG' ? '[画像]' : '[数式]',
      );
      continue;
    }
    const text = piece as Text;
    for (let i = 0; i < text.length; i++) {
      const char = text.data[i];
      if (/\s/.test(char)) continue;
      range!.setStart(text, i);
      range!.setEnd(text, i + 1);
      place(range!.getBoundingClientRect(), char);
    }
  }
  return lines;
}

export function piecesText(pieces: LinePiece[]) {
  return collapse(
    pieces
      .map((piece) =>
        piece.nodeType === Node.TEXT_NODE ? piece.nodeValue : visibleText(piece as Element),
      )
      .join(''),
  );
}
