import type MarkdownIt from 'markdown-it';
import {
  parseComposition,
  type CompositionScene,
  type ArrowAnnotation,
} from '../markdown/composition.mjs';
import { svgElement } from '../svg';
import type { Rendered } from '../render/lifecycle';
import { arrowGeometry, betweenBoxes, besideBox, crossGeometry, type Box } from './geometry';

// Build the Markdown containers first. Attach annotations only after their nested
// diagrams and boxes have mounted, so arrows use actual rendered bounds.
export function prepareComposition(
  root: HTMLElement,
  source: string,
  options: string,
  md: InstanceType<typeof MarkdownIt>,
) {
  const scene = parseComposition(source, options);
  root.dataset.compositionLayout = scene.layout;
  root.style.setProperty('--composition-gap', `${scene.gap}px`);
  const padding = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const mark of scene.annotations) {
    if (mark.kind === 'arrow' && mark.target)
      padding[mark.side] = Math.max(padding[mark.side], mark.size + mark.offset + 16);
  }
  root.style.padding = `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`;
  const content = document.createElement('div');
  content.className = 'composition-parts';
  for (const part of scene.parts) {
    const element = document.createElement('section');
    element.className = 'composition-part';
    element.dataset.compositionPart = part.id;
    if (part.width) element.style.setProperty('--composition-part-width', `${part.width}px`);
    element.innerHTML = md.render(part.source);
    content.append(element);
  }
  root.replaceChildren(content);
  return () => mountAnnotations(root, scene, content);
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

function mountAnnotations(
  root: HTMLElement,
  scene: CompositionScene,
  content: HTMLElement,
): Rendered {
  const svg = svgElement('svg', {
    class: 'composition-annotations',
    'aria-label': '図の解説',
    role: 'group',
  }) as SVGSVGElement;
  const error = document.createElement('p');
  error.className = 'composition-error';
  error.hidden = true;
  root.append(svg, error);
  const parts = new Map(
    [...content.children].map((element) => [
      (element as HTMLElement).dataset.compositionPart!,
      element as HTMLElement,
    ]),
  );
  const resolveElement = (ref: string) => {
    const [id, node] = ref.split('.');
    const part = parts.get(id);
    if (!part) throw new Error(`解説の対象が見つかりません: ${ref}`);
    if (!node) return part;
    const matches = [
      ...part.querySelectorAll<HTMLElement>('[data-canvas-node], [data-diagram-item]'),
    ].filter(
      (element) =>
        (element.dataset.canvasNode || element.dataset.diagramItem) === node &&
        element.closest('.milo-composition') === root,
    );
    if (matches.length !== 1) throw new Error(`解説の対象を一意に指定してください: ${ref}`);
    return matches[0];
  };
  let disposed = false,
    frame: number | null = null;
  const update = () => {
    if (disposed) return;
    try {
      const outer = root.getBoundingClientRect();
      const width = root.clientWidth,
        height = root.clientHeight;
      // Validate references even in a DOM without a layout engine.
      for (const mark of scene.annotations) {
        if (mark.kind === 'arrow') {
          for (const ref of mark.target !== undefined ? [mark.target] : [mark.from, mark.to])
            if (ref !== 'all') resolveElement(ref);
        } else if (
          mark.target !== 'all' &&
          !scene.annotations.some((a) => a.kind === 'arrow' && a.id === mark.target)
        )
          resolveElement(mark.target);
      }
      if (!width || !height || !outer.width || !outer.height) return;
      const measure = (element: Element): Box => {
        const rect = element.getBoundingClientRect();
        return {
          x: ((rect.x - outer.x) * width) / outer.width,
          y: ((rect.y - outer.y) * height) / outer.height,
          width: (rect.width * width) / outer.width,
          height: (rect.height * height) / outer.height,
        };
      };
      const bounds = (ref: string) =>
        ref === 'all' ? union([...parts.values()].map(measure)) : measure(resolveElement(ref));
      const arrows = new Map<string, Box>();
      const fragment = document.createDocumentFragment();
      for (const mark of scene.annotations) {
        if (mark.kind !== 'arrow') continue;
        const endpoints =
          mark.target !== undefined
            ? besideBox(bounds(mark.target), mark.side, mark.direction, mark.size, mark.offset)
            : betweenBoxes(bounds(mark.from), bounds(mark.to));
        const geometry = arrowGeometry(...endpoints, mark.size);
        arrows.set(mark.id, geometry.box);
        const group = svgElement('g', {
          class: `composition-arrow annotation-tone-${mark.tone}`,
          'data-annotation': mark.id,
          role: 'img',
          'aria-label': mark.label || '解説矢印',
        });
        group.append(svgElement('path', { d: geometry.path }));
        if (mark.label) group.append(arrowLabel(mark, geometry));
        fragment.append(group);
      }
      for (const mark of scene.annotations) {
        if (mark.kind !== 'cross') continue;
        const geometry = crossGeometry(
          arrows.get(mark.target) || bounds(mark.target),
          mark.scale,
          mark.size,
        );
        const cross = svgElement('path', {
          class: `composition-cross annotation-tone-${mark.tone}`,
          d: geometry.path,
          'stroke-width': geometry.stroke,
          role: 'img',
          'aria-label': mark.label,
          'data-cross-target': mark.target,
        });
        fragment.append(cross);
      }
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.replaceChildren(fragment);
      error.hidden = true;
      error.classList.remove('block-error');
    } catch (cause) {
      svg.replaceChildren();
      error.textContent = cause instanceof Error ? cause.message : String(cause);
      error.hidden = false;
      error.classList.add('block-error');
    }
  };
  const view = root.ownerDocument.defaultView;
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (frame !== null || disposed) return;
          frame = view!.requestAnimationFrame(() => {
            frame = null;
            update();
          });
        });
  observer?.observe(root);
  for (const element of content.querySelectorAll(
    '.composition-part, .canvas-node, .diagram-card, .diagram-vertex, .diagram-dot',
  ))
    observer?.observe(element);
  return {
    update,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
      if (frame !== null) view?.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

function arrowLabel(mark: ArrowAnnotation, geometry: ReturnType<typeof arrowGeometry>) {
  const units = [...mark.label].reduce(
    (sum, ch) => sum + (/[\u3000-\u9fff]/.test(ch) ? 1 : 0.55),
    0,
  );
  const inside = units * 27 + 24 <= geometry.length && mark.size >= 56;
  const text = svgElement('text', {
    class: `composition-arrow-label${inside ? ' is-inside' : ''}`,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  if (geometry.vertical && inside) {
    text.setAttribute('x', String(geometry.label.x));
    text.setAttribute('y', String(geometry.label.y - (mark.label.length - 1) * 14));
    [...mark.label].forEach((letter, index) => {
      const span = svgElement('tspan', { x: geometry.label.x, dy: index ? 28 : 0 });
      span.textContent = letter;
      text.append(span);
    });
  } else {
    text.setAttribute(
      'x',
      String(geometry.vertical ? geometry.box.x + geometry.box.width + 28 : geometry.label.x),
    );
    text.setAttribute('y', String(inside ? geometry.label.y : geometry.box.y - 18));
    text.textContent = mark.label;
  }
  return text;
}
