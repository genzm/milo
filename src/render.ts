import { registerMiloBlocks, lineText, type StepGroup } from './markdown/blocks.mjs';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { atAttributes, mountCanvas } from './canvas';
import { mountDiagram } from './diagram';
import {
  assetURL,
  mountImage,
  esc,
  resolveAssetRef,
  showError,
  type RenderContext,
} from './directives';

export { assetURL, esc, type RenderContext } from './directives';
export interface Rendered {
  update: () => void;
  dispose: () => void;
}
const CARD_TONES = ['accent', 'default', 'muted', 'dark'] as const;
type CardTone = (typeof CARD_TONES)[number];

function parseTone(kind: string, raw: string | undefined, fallback: CardTone) {
  const attrs = atAttributes(raw || '');
  const tone = (attrs.tone as CardTone) || fallback;
  if (!CARD_TONES.includes(tone))
    throw new Error(`${kind}のtoneは ${CARD_TONES.join(' / ')} から選んでください。`);
  return { attrs, tone };
}

function integerOption(name: string, value: string | undefined, fallback: number, min = 1) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min)
    throw new Error(`${name} は${min}以上の整数にしてください。`);
  return n;
}

function renderSteps(group: StepGroup, md: InstanceType<typeof MarkdownIt>) {
  const attrs = atAttributes(group.options);
  const style = attrs.style || 'cards';
  if (style !== 'cards') throw new Error('steps の style は cards です。');
  const highlight = integerOption('highlight', attrs.highlight, 0, 0);
  if (highlight > group.steps.length)
    throw new Error(`highlight は 1〜${group.steps.length} にしてください。`);
  return group.steps
    .map((step, index) => {
      const title = step.attrs.title?.trim();
      if (!title) throw new Error(`@step ${index + 1} には title が必要です。`);
      const on = highlight === index + 1;
      const card = `<article class="step-card${on ? ' is-highlight' : ''}"><h3 class="step-heading"><span class="step-badge">${index + 1}</span><span class="step-title">${esc(title)}</span></h3><div class="step-body">${md.render(step.source.replace(/([^\n])\n(?!\n)/g, '$1  \n'))}</div></article>`;
      const arrow =
        index < group.steps.length - 1 ? '<span class="step-arrow" aria-hidden="true"></span>' : '';
      return card + arrow;
    })
    .join('');
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

function alignBlocks(state: any) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'inline') continue;
    const parent = tokens[i - 1];
    if (!parent || (parent.type !== 'heading_open' && parent.type !== 'paragraph_open')) continue;
    const match = /(?:^|[ \t]+)@align=(left|center|right)[ \t]*$/.exec(token.content);
    if (!match) continue;
    token.content = token.content.slice(0, match.index);
    parent.attrJoin('class', `align-${match[1]}`);
  }
}

function maskMiloComments(source: string) {
  return source.replace(/^[ \t]*<!--\s*milo:[\s\S]*?-->[ \t]*(?:\r?\n|$)/gm, (comment) =>
    comment.replace(/[^\r\n]/g, ' '),
  );
}

interface TaskItem {
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

export function renderSlide(root: HTMLElement, source: string, ctx: RenderContext): Rendered {
  const layoutUpdates: (() => void)[] = [],
    disposals: (() => void)[] = [];
  const tasks: TaskItem[] = [];
  const display = prepareTaskItems(maskMiloComments(source), tasks);
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  md.core.ruler.before('inline', 'milo_align', alignBlocks);
  const {
    directives,
    canvases,
    diagrams,
    boxes,
    panels,
    grids,
    stacks,
    steps,
    columns,
    impacts,
    footers,
  } = registerMiloBlocks(md);
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
    renderMarkdown: (text) => md.render(text),
  };
  root.dataset.markdown = 'slide';
  root.innerHTML = md.render(display);
  root.classList.toggle('has-slide-footer', footers.length > 0);
  for (const element of root.querySelectorAll<HTMLElement>('[data-footer]')) {
    const footer = footers[Number(element.dataset.footer)];
    if (footer.error) showError(element, new Error(footer.error));
    else element.innerHTML = md.render(footer.source);
  }

  let structuralBlocks = true;
  while (structuralBlocks) {
    structuralBlocks = false;
    for (const element of root.querySelectorAll<HTMLElement>(
      '[data-columns]:not([data-mounted])',
    )) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const group = columns[Number(element.dataset.columns)];
      if (group.error) {
        showError(element, new Error(group.error));
        continue;
      }
      element.style.setProperty('--column-count', String(group.sources.length));
      element.innerHTML = group.sources
        .map((column) => `<section class="column-block">${md.render(column)}</section>`)
        .join('');
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-grid]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const grid = grids[Number(element.dataset.grid)];
      try {
        if (grid.error) throw new Error(grid.error);
        const attrs = atAttributes(grid.options || '');
        element.innerHTML = md.render(grid.source);
        const columns = integerOption('columns', attrs.columns, element.childElementCount || 1);
        element.style.setProperty('--grid-columns', String(columns));
        if (attrs.gap !== undefined)
          element.style.gap = `${integerOption('gap', attrs.gap, 0, 0)}px`;
      } catch (e) {
        showError(element, e);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-stack]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const stack = stacks[Number(element.dataset.stack)];
      try {
        if (stack.error) throw new Error(stack.error);
        const attrs = atAttributes(stack.options || '');
        element.innerHTML = md.render(stack.source);
        if (attrs.gap !== undefined)
          element.style.gap = `${integerOption('gap', attrs.gap, 0, 0)}px`;
      } catch (e) {
        showError(element, e);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-panel]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const panel = panels[Number(element.dataset.panel)];
      try {
        if (panel.error) throw new Error(panel.error);
        const { tone } = parseTone('panel', panel.options, 'muted');
        element.className = `panel-block slide-card card-tone-${tone}`;
        element.innerHTML = md.render(panel.source);
      } catch (e) {
        showError(element, e);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-steps]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const group = steps[Number(element.dataset.steps)];
      try {
        if (group.error) throw new Error(group.error);
        element.innerHTML = renderSteps(group, md);
      } catch (e) {
        showError(element, e);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-impact]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const impact = impacts[Number(element.dataset.impact)];
      if (impact.error) showError(element, new Error(impact.error));
      else element.innerHTML = md.render(impact.source);
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-canvas]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const canvas = canvases[Number(element.dataset.canvas)];
      try {
        if (canvas.error) throw new Error(canvas.error);
        const mounted = mountCanvas(element, canvas.source, canvas.options, renderContext);
        layoutUpdates.push(mounted.update);
        disposals.push(mounted.dispose);
      } catch (e) {
        showError(element, e);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>(
      '[data-diagram]:not([data-mounted])',
    )) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const diagram = diagrams[Number(element.dataset.diagram)];
      try {
        if (diagram.error) throw new Error(diagram.error);
        const mounted = mountDiagram(element, diagram.source, diagram.options, renderContext);
        layoutUpdates.push(mounted.update);
        disposals.push(mounted.dispose);
      } catch (e) {
        showError(element, e);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>('[data-box]:not([data-mounted])')) {
      structuralBlocks = true;
      element.dataset.mounted = 'true';
      const box = boxes[Number(element.dataset.box)];
      try {
        if (box.error) throw new Error(box.error);
        const { tone } = parseTone('box', box.options, 'default');
        element.className = `box-block slide-card card-tone-${tone}`;
        element.innerHTML = md.render(box.source);
      } catch (e) {
        showError(element, e);
      }
    }
  }

  for (const element of root.querySelectorAll<HTMLElement>('[data-live]')) {
    const directive = directives[Number(element.dataset.live)];
    try {
      if (directive.error) throw new Error(directive.error);
      if (directive.name !== 'image')
        throw new Error(`未対応のディレクティブです: ${directive.name}`);
      mountImage(element, directive.attrs, renderContext);
    } catch (e) {
      showError(element, e);
    }
  }
  const toggleTask = (event: Event) => {
    const target = event.target as Element | null,
      button = target?.closest<HTMLButtonElement>('.task-marker');
    if (!button || !root.contains(button)) return;
    const task = tasks[Number(button.dataset.task)];
    if (!task) return;
    event.preventDefault();
    event.stopPropagation();
    task.checked = !task.checked;
    button.setAttribute('aria-checked', String(task.checked));
    button.setAttribute(
      'aria-label',
      task.checked ? '完了済み。未完了に戻す' : '未完了。完了にする',
    );
    ctx.patchSource?.(task.at, task.at + 1, task.checked ? 'x' : ' ');
  };
  root.addEventListener('click', toggleTask);
  disposals.push(() => root.removeEventListener('click', toggleTask));
  const update = () => {
    layoutUpdates.forEach((run) => run());
  };
  update();
  return { update, dispose: () => disposals.forEach((run) => run()) };
}
