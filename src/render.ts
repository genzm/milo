import MarkdownIt from 'markdown-it';
import katex from 'katex';
import {
  assetURL,
  directiveRenderer,
  esc,
  fmt,
  model,
  resolveAssetRef,
  showError,
  type Directive,
  type RenderContext,
} from './directives';

export { assetURL, esc, fmt, type RenderContext } from './directives';
export interface Rendered {
  update: () => void;
  dispose: () => void;
}
interface ParsedDirective extends Directive {
  error?: string;
}

function lineText(state: any, line: number) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function mathBlock(state: any, line: number, end: number, silent: boolean) {
  if (state.sCount[line] - state.blkIndent >= 4) return false;
  const first = lineText(state, line).trimEnd();
  if (!first.startsWith('$$')) return false;

  let body = '',
    next = line + 1;
  if (
    first.length > 4 &&
    first[2] !== '$' &&
    first.endsWith('$$') &&
    first[first.length - 3] !== '$'
  ) {
    body = first.slice(2, -2);
  } else if (first === '$$') {
    const lines: string[] = [];
    let found = false;
    while (next < end) {
      const text = lineText(state, next);
      if (state.sCount[next] - state.blkIndent < 4 && text.trim() === '$$') {
        found = true;
        next++;
        break;
      }
      lines.push(text);
      next++;
    }
    if (!found) return false;
    body = lines.join('\n');
  } else return false;

  if (!body.trim()) return false;
  if (silent) return true;
  const token = state.push('math_block', '', 0);
  token.content = body;
  token.markup = '$$';
  token.map = [line, next];
  state.line = next;
  return true;
}

function isEscaped(source: string, at: number) {
  let slashes = 0;
  for (let i = at - 1; i >= 0 && source[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

function args(raw: string): Record<string, string> {
  const a: Record<string, string> = {};
  const leftovers = raw.replace(/([\w-]+)\s*=\s*"([^"\r\n]*)"/g, (_, k, v) => ((a[k] = v), ''));
  if (leftovers.trim())
    throw new Error('ディレクティブの設定は name="value" の形式で書いてください。');
  return a;
}

function stripMiloComments(source: string) {
  return source.replace(/^[ \t]*<!--\s*milo:[\s\S]*?-->[ \t]*(?:\r?\n|$)/gm, '');
}

export function renderSlide(root: HTMLElement, source: string, ctx: RenderContext): Rendered {
  const updates: (() => void)[] = [],
    disposals: (() => void)[] = [];
  const directives: ParsedDirective[] = [];
  const display = stripMiloComments(source);
  const footerMarker = /(^|\r?\n)::footer(?:\{\})?[ \t]*(?:\r?\n|$)/m.exec(display);
  const bodySource = footerMarker
      ? display.slice(0, footerMarker.index + footerMarker[1].length)
      : display,
    footerSource = footerMarker ? display.slice(footerMarker.index + footerMarker[0].length) : '';
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  md.block.ruler.before(
    'fence',
    'milo-directive',
    (s: any, line: number, end: number, silent: boolean) => {
      const text = s.src.slice(s.bMarks[line] + s.tShift[line], s.eMarks[line]);
      const match = /^::([a-z]+)\{(.*)\}\s*$/.exec(text);
      let name = match?.[1] || '',
        raw = match?.[2] || '',
        nextLine = line + 1,
        block = false;
      const textBlock = !match ? /^::text\{(.*)$/.exec(text) : null;
      if (textBlock) {
        const body: string[] = textBlock[1] ? [textBlock[1]] : [];
        let cursor = line + 1;
        for (; cursor < end; cursor++) {
          const current = s.src.slice(s.bMarks[cursor], s.eMarks[cursor]);
          if (current.trim() === '}') break;
          body.push(current);
        }
        if (cursor >= end) return false;
        name = 'text';
        raw = body.join('\n');
        nextLine = cursor + 1;
        block = true;
      }
      if (!name) return false;
      if (silent) return true;
      let item: ParsedDirective;
      try {
        item = {
          name,
          attrs:
            name === 'text' && (block || !/^\s*text\s*=/.test(raw))
              ? { text: raw, block: String(block) }
              : args(raw),
        };
      } catch (e: any) {
        item = { name, attrs: {}, error: e.message };
      }
      const token = s.push('milo_directive', '', 0);
      token.meta = { index: directives.push(item) - 1 };
      s.line = nextLine;
      return true;
    },
  );
  md.renderer.rules.milo_directive = (tokens, index) =>
    `<div class="live-block" data-live="${tokens[index].meta!.index}"></div>\n`;
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    if (/^milo:model\b/.test(tokens[index].info.trim())) return '';
    return fence
      ? fence(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_block = (tokens, index) =>
    '<div class="math-prose">' +
    katex.renderToString(tokens[index].content, {
      displayMode: true,
      throwOnError: false,
      trust: false,
    }) +
    '</div>';
  md.inline.ruler.after('escape', 'math_inline', (s: any, silent: boolean) => {
    if (s.src[s.pos] !== '$' || s.src[s.pos - 1] === '$' || s.src[s.pos + 1] === '$') return false;
    let end = s.pos + 1;
    while ((end = s.src.indexOf('$', end)) !== -1) {
      if (s.src[end - 1] !== '$' && s.src[end + 1] !== '$' && !isEscaped(s.src, end)) break;
      end++;
    }
    const content = end === -1 ? '' : s.src.slice(s.pos + 1, end);
    if (end === -1 || !content.trim() || content.includes('\n')) return false;
    if (!silent) {
      const token = s.push('math_inline', '', 0);
      token.content = content;
    }
    s.pos = end + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, index) =>
    katex.renderToString(tokens[index].content, { throwOnError: false, trust: false });
  md.inline.ruler.after('escape', 'underline', (s: any, silent: boolean) => {
    if (s.src[s.pos] !== '+' || s.src[s.pos + 1] !== '+') return false;
    const end = s.src.indexOf('++', s.pos + 2);
    if (end === -1 || end === s.pos + 2 || s.src.slice(s.pos + 2, end).includes('\n')) return false;
    if (!silent) {
      const token = s.push('underline', 'u', 0);
      token.content = s.src.slice(s.pos + 2, end);
    }
    s.pos = end + 2;
    return true;
  });
  md.renderer.rules.underline = (tokens, index) => `<u>${esc(tokens[index].content)}</u>`;
  md.inline.ruler.before('text', 'live_value', (s: any, silent: boolean) => {
    const match = /^\{\{([\w-]+)\.([\w]+)\}\}/.exec(s.src.slice(s.pos));
    if (!match) return false;
    if (!silent) {
      const token = s.push('live_value', '', 0);
      token.meta = { id: match[1], key: match[2] };
    }
    s.pos += match[0].length;
    return true;
  });
  md.renderer.rules.live_value = (tokens, index) =>
    `<span class="live-value" data-model="${esc(tokens[index].meta!.id)}" data-key="${esc(tokens[index].meta!.key)}"></span>`;
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index],
      src = String(token.attrGet('src') || ''),
      alt = token.content,
      title = token.attrGet('title');
    try {
      const id = resolveAssetRef(ctx.store, src);
      const img = `<img class="embedded-image" src="${esc(assetURL(ctx.store.get(id).text))}" alt="${esc(alt)}">`;
      if (!title) return img;
      return `<span class="image-block">${img}<p class="image-caption">${esc(title)}</p></span>`;
    } catch (e: any) {
      return `<span class="inline-error">${esc(e.message)}</span>`;
    }
  };
  const linkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return linkOpen
      ? linkOpen(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
  const renderContext: RenderContext = {
    ...ctx,
    renderInline: (text) => md.renderInline(text),
    renderMarkdown: (text) => md.render(text),
  };
  root.classList.toggle('has-slide-footer', !!footerMarker);
  root.innerHTML = md.render(bodySource);
  if (footerMarker && footerSource.trim()) {
    root.insertAdjacentHTML(
      'beforeend',
      `<footer class="slide-footer-content">${md.render(footerSource)}</footer>`,
    );
  }

  for (const element of root.querySelectorAll<HTMLElement>('[data-live]')) {
    const directive = directives[Number(element.dataset.live)];
    try {
      if (directive.error) throw new Error(directive.error);
      const renderer = directiveRenderer(directive.name);
      if (!renderer) throw new Error(`未対応のディレクティブです: ${directive.name}`);
      const mounted = renderer.mount(element, directive, renderContext);
      if (mounted.update) updates.push(mounted.update);
      if (mounted.dispose) disposals.push(mounted.dispose);
    } catch (e) {
      showError(element, e);
    }
  }
  for (const label of root.querySelectorAll<HTMLElement>('.live-value'))
    updates.push(() => {
      try {
        const { p } = model(ctx, label.dataset.model!);
        label.textContent = fmt(p[label.dataset.key!]);
      } catch {
        label.textContent = '?';
      }
    });
  const update = () => updates.forEach((run) => run());
  update();
  return { update, dispose: () => disposals.forEach((run) => run()) };
}
