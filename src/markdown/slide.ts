import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { registerMiloBlocks, lineText } from './blocks.mjs';
import { assetURL, resolveAssetRef } from '../assets';
import { esc } from '../escape';
import type { RenderContext } from '../render/context';

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

function lineAttributes(state: any) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'inline') continue;
    const parent = tokens[i - 1];
    if (!parent || (parent.type !== 'heading_open' && parent.type !== 'paragraph_open')) continue;
    let content = token.content;
    for (;;) {
      const align = /(?:^|[ \t]+)@align=(left|center|right)[ \t]*$/.exec(content);
      if (align) {
        content = content.slice(0, align.index);
        parent.attrJoin('class', `align-${align[1]}`);
        continue;
      }
      const mark = /(?:^|[ \t]+)@mark[ \t]*$/.exec(content);
      if (mark) {
        content = content.slice(0, mark.index);
        parent.attrJoin('class', 'line-mark');
        continue;
      }
      break;
    }
    token.content = content;
  }
}

function maskMiloComments(source: string) {
  return source.replace(/^[ \t]*<!--\s*milo:[\s\S]*?-->[ \t]*(?:\r?\n|$)/gm, (comment) =>
    comment.replace(/[^\r\n]/g, ' '),
  );
}

export interface TaskItem {
  at: number;
  checked: boolean;
}

function prepareTaskItems(source: string, tasks: TaskItem[]) {
  let offset = 0,
    fence = '';
  return source.replace(/[^\r\n]*(?:\r\n|\r|\n|$)/g, (line) => {
    if (!line) return line;
    const eol = /(?:\r\n|\r|\n)$/.exec(line)?.[0] || '',
      body = eol ? line.slice(0, -eol.length) : line;
    let output = body;
    if (fence) {
      if (new RegExp(`^[ \\t]{0,3}${fence[0]}{${fence.length},}\\s*$`).test(body)) fence = '';
    } else {
      const openingFence = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(body);
      if (openingFence) fence = openingFence[1];
      else {
        const marker = /^([ \t]*(?:(?:[-+*])|(?:\d+[.)]))[ \t]+)\[([ xX])\](?=[ \t]+)/.exec(body);
        if (marker) {
          const index =
            tasks.push({
              at: offset + marker[1].length + 1,
              checked: marker[2].toLowerCase() === 'x',
            }) - 1;
          output = marker[1] + `\uE000${index}\uE001` + body.slice(marker[0].length);
        }
      }
    }
    offset += line.length;
    return output + eol;
  });
}

export function prepareSlide(source: string, ctx: RenderContext) {
  const tasks: TaskItem[] = [];
  const display = prepareTaskItems(maskMiloComments(source), tasks);
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  md.core.ruler.before('inline', 'milo_line_attrs', lineAttributes);
  const blocks = registerMiloBlocks(md);
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
  md.inline.ruler.after('escape', 'accent_emphasis', (s: any, silent: boolean) => {
    if (
      s.src.slice(s.pos, s.pos + 2) !== '==' ||
      s.src[s.pos - 1] === '=' ||
      !s.src[s.pos + 2] ||
      /\s/.test(s.src[s.pos + 2])
    )
      return false;
    let end = s.pos + 2;
    while ((end = s.src.indexOf('==', end)) !== -1) {
      if (!isEscaped(s.src, end) && !/\s/.test(s.src[end - 1]) && s.src[end + 2] !== '=') break;
      end += 2;
    }
    if (end === -1) return false;
    const content = s.src.slice(s.pos + 2, end);
    if (!content || content.includes('\n')) return false;
    if (!silent) {
      s.push('accent_emphasis_open', 'mark', 1);
      const text = s.push('text', '', 0);
      text.content = content;
      s.push('accent_emphasis_close', 'mark', -1);
    }
    s.pos = end + 2;
    return true;
  });
  md.renderer.rules.accent_emphasis_open = () => '<mark class="accent-emphasis">';
  md.renderer.rules.accent_emphasis_close = () => '</mark>';
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
  md.inline.ruler.before('text', 'task_item', (s: any, silent: boolean) => {
    const match = /^\uE000(\d+)\uE001/.exec(s.src.slice(s.pos));
    if (!match) return false;
    if (!silent) {
      const token = s.push('task_item', '', 0);
      token.meta = { index: Number(match[1]) };
    }
    s.pos += match[0].length;
    return true;
  });
  md.renderer.rules.task_item = (tokens, index) => {
    const taskIndex = Number(tokens[index].meta!.index),
      checked = tasks[taskIndex]?.checked || false;
    return `<button type="button" class="task-marker" data-task="${taskIndex}" role="checkbox" aria-checked="${checked}" aria-label="${checked ? '完了済み。未完了に戻す' : '未完了。完了にする'}"></button>`;
  };
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index],
      src = String(token.attrGet('src') || ''),
      alt = token.content,
      title = token.attrGet('title');
    try {
      const id = resolveAssetRef(ctx.store, src);
      const img = `<img class="embedded-image" src="${esc(assetURL(ctx.store.get(id).text))}" alt="${esc(alt)}">`;
      if (!title) return img;
      return `<span class="image-block">${img}<span class="image-caption">${md.renderInline(String(title))}</span></span>`;
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
  return { md, blocks, tasks, display };
}
