import { prepareComposition } from '../composition/mount';
import type MarkdownIt from 'markdown-it';
import type { MiloBlocks, StepGroup } from '../markdown/blocks.mjs';
import { atAttributes } from '../markdown/attributes.mjs';
import { mountCanvas } from '../canvas';
import { mountDiagram } from '../diagram';
import { esc } from '../escape';
import type { RenderContext } from './context';
import { mountImage } from './image';
import { RenderScope, type Rendered } from './lifecycle';

function showError(el: HTMLElement, e: any) {
  el.classList.add('block-error');
  el.textContent = e.message || String(e);
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

export function mountBlocks(
  root: HTMLElement,
  blocks: MiloBlocks,
  md: InstanceType<typeof MarkdownIt>,
  context: RenderContext,
  scope: RenderScope,
) {
  root.classList.toggle('has-slide-footer', blocks.footers.length > 0);
  for (const element of root.querySelectorAll<HTMLElement>('[data-footer]')) {
    const footer = blocks.footers[Number(element.dataset.footer)];
    if (footer.error) showError(element, new Error(footer.error));
    else element.innerHTML = md.render(footer.source);
  }

  const handlers: (() => boolean)[] = [];
  const annotations: (() => Rendered)[] = [];
  function register<T extends { error?: string }>(
    name: string,
    entries: T[],
    mount: (element: HTMLElement, entry: T) => Rendered | void,
  ) {
    handlers.push(() => {
      const elements = root.querySelectorAll<HTMLElement>(`[data-${name}]:not([data-mounted])`);
      for (const element of elements) {
        element.dataset.mounted = 'true';
        try {
          const entry = entries[Number(element.dataset[name])];
          if (entry.error) throw new Error(entry.error);
          const rendered = mount(element, entry);
          if (rendered) scope.add(rendered);
        } catch (error) {
          showError(element, error);
        }
      }
      return elements.length > 0;
    });
  }

  // Preserve mounting order: a container may introduce further blocks during md.render.
  register('compose', blocks.compositions, (element, block) => {
    annotations.push(prepareComposition(element, block.source, block.options, md));
  });
  register('columns', blocks.columns, (element, group) => {
    element.style.setProperty('--column-count', String(group.sources.length));
    element.innerHTML = group.sources
      .map((column) => `<section class="column-block">${md.render(column)}</section>`)
      .join('');
  });
  register('grid', blocks.grids, (element, grid) => {
    const attrs = atAttributes(grid.options);
    element.innerHTML = md.render(grid.source);
    const columns = integerOption('columns', attrs.columns, element.childElementCount || 1);
    element.style.setProperty('--grid-columns', String(columns));
    if (attrs.gap !== undefined) element.style.gap = `${integerOption('gap', attrs.gap, 0, 0)}px`;
  });
  register('stack', blocks.stacks, (element, stack) => {
    const attrs = atAttributes(stack.options);
    element.innerHTML = md.render(stack.source);
    if (attrs.gap !== undefined) element.style.gap = `${integerOption('gap', attrs.gap, 0, 0)}px`;
  });
  register('panel', blocks.panels, (element, panel) => {
    const { tone } = parseTone('panel', panel.options, 'muted');
    element.className = `panel-block slide-card card-tone-${tone}`;
    element.innerHTML = md.render(panel.source);
  });
  register('steps', blocks.steps, (element, group) => {
    element.innerHTML = renderSteps(group, md);
  });
  register('impact', blocks.impacts, (element, impact) => {
    element.innerHTML = md.render(impact.source);
  });
  register('canvas', blocks.canvases, (element, canvas) =>
    mountCanvas(element, canvas.source, canvas.options, context),
  );
  register('diagram', blocks.diagrams, (element, diagram) =>
    mountDiagram(element, diagram.source, diagram.options, context),
  );
  register('box', blocks.boxes, (element, box) => {
    const { tone } = parseTone('box', box.options, 'default');
    element.className = `box-block slide-card card-tone-${tone}`;
    element.innerHTML = md.render(box.source);
  });
  let mounted: boolean;
  do {
    mounted = false;
    for (const mount of handlers) mounted = mount() || mounted;
  } while (mounted);

  for (const element of root.querySelectorAll<HTMLElement>('[data-live]')) {
    const directive = blocks.directives[Number(element.dataset.live)];
    try {
      if (directive.error) throw new Error(directive.error);
      if (directive.name !== 'image')
        throw new Error(`未対応のディレクティブです: ${directive.name}`);
      mountImage(element, directive.attrs, context);
    } catch (error) {
      showError(element, error);
    }
  }
  // Diagram updates run before overlays, including nested compositions.
  for (const mount of annotations.reverse()) scope.add(mount());
}
