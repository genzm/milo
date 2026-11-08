import type MarkdownIt from 'markdown-it';
import {
  parseComposition,
  type CompositionScene,
  type ArrowAnnotation,
} from '../markdown/composition.mjs';
import { unifyGroupedHeights } from '../flow/measure.ts';
import { FLOW } from '../flow/types.ts';
import { svgElement } from '../svg';
import type { Rendered } from '../render/lifecycle';
import {
  arrowGeometry,
  betweenBoxes,
  besideBox,
  besideSpan,
  crossGeometry,
  type Box,
} from './geometry';

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
    if (mark.kind === 'arrow' && mark.side)
      padding[mark.side] = Math.max(padding[mark.side], mark.size + mark.offset + 16);
  }
  root.style.padding = `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`;
  const content = document.createElement('div');
  content.className = 'composition-parts';
  content.style.alignItems = scene.align === 'center' ? 'center' : `flex-${scene.align}`;
  content.style.minHeight = `${scene.height}px`;
  for (const part of scene.parts) {
    const element = document.createElement('section');
    element.className = 'composition-part';
    element.dataset.compositionPart = part.id;
    if (part.align)
      element.style.alignSelf = part.align === 'center' ? 'center' : `flex-${part.align}`;
    if (part.width) element.style.setProperty('--composition-part-width', `${part.width}px`);
    element.innerHTML = md.render(part.source);
    content.append(element);
  }
  root.replaceChildren(content);
  return () => mountAnnotations(root, scene, content);
}

function partSoloBox(part: HTMLElement) {
  const visuals = [...part.children].filter((child) =>
    child.matches('.milo-diagram, .milo-canvas, .box-block'),
  );
  return visuals.length === 1 && visuals[0].classList.contains('box-block')
    ? (visuals[0] as HTMLElement)
    : null;
}

function equalizeLinkedPartBoxes(scene: CompositionScene, parts: Map<string, HTMLElement>) {
  const boxes: HTMLElement[] = [];
  const indexOf = new Map<HTMLElement, number>();
  const index = (box: HTMLElement) => {
    const existing = indexOf.get(box);
    if (existing !== undefined) return existing;
    const next = boxes.length;
    boxes.push(box);
    indexOf.set(box, next);
    return next;
  };
  const boxOf = (ref: string) => {
    if (ref === 'all' || ref.includes('.')) return null;
    const part = parts.get(ref);
    return part ? partSoloBox(part) : null;
  };
  const links: Array<[number, number]> = [];
  for (const mark of scene.annotations) {
    if (mark.kind !== 'arrow' || mark.side || mark.target !== undefined) continue;
    const from = boxOf(mark.from);
    const to = boxOf(mark.to);
    if (!from || !to || from === to) continue;
    links.push([index(from), index(to)]);
  }
  if (!boxes.length) return;
  for (const box of boxes) box.style.minHeight = '';
  const natural = boxes.map((box) => box.offsetHeight);
  if (natural.every((height) => height < 1)) return;
  const next = unifyGroupedHeights(natural, links, FLOW.BOX_HEIGHT_VARIANCE);
  boxes.forEach((box, i) => {
    const value = next[i] > natural[i] + 0.5 ? `${Math.round(next[i])}px` : '';
    if (box.style.minHeight !== value) box.style.minHeight = value;
  });
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
    frame: number | null = null,
    observer: ResizeObserver | null = null;
  const observe = () => {
    if (!observer || disposed) return;
    observer.observe(root);
    for (const element of content.querySelectorAll(
      '.composition-part, .box-block, .canvas-node, .diagram-card, .diagram-vertex, .diagram-dot',
    ))
      observer.observe(element);
  };
  const update = () => {
    if (disposed) return;
    observer?.disconnect();
    try {
      equalizeLinkedPartBoxes(scene, parts);
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
      const bounds = (ref: string) => {
        if (ref === 'all') return union([...parts.values()].map(measure));
        const element = resolveElement(ref);
        if (!ref.includes('.')) {
          const visuals = [...element.children].filter((child) =>
            child.matches('.milo-diagram, .milo-canvas, .box-block'),
          );
          if (visuals.length) return union(visuals.map(measure));
        }
        return measure(element);
      };
      const nodeBoxes = (...refs: string[]) => {
        const seen = new Set<HTMLElement>();
        const boxes: Box[] = [];
        for (const ref of refs) {
          const part = parts.get(ref.split('.')[0]);
          if (!part) continue;
          for (const element of part.querySelectorAll<HTMLElement>(
            '[data-canvas-node], [data-diagram-item]',
          )) {
            if (seen.has(element) || element.closest('.milo-composition') !== root) continue;
            seen.add(element);
            boxes.push(measure(element));
          }
        }
        return boxes;
      };
      // Pointing a node at a sibling part should move that part onto the node,
      // otherwise the arrow hits the box off-center.
      const column = scene.layout === 'column';
      for (const part of parts.values()) part.style.transform = '';
      for (const mark of scene.annotations) {
        if (mark.kind !== 'arrow' || mark.side) continue;
        const fromNode = mark.from.includes('.');
        const toNode = mark.to.includes('.');
        if (fromNode === toNode) continue;
        const nodeRef = fromNode ? mark.from : mark.to;
        const partRef = fromNode ? mark.to : mark.from;
        if (partRef.includes('.') || partRef === 'all') continue;
        const partEl = parts.get(partRef);
        const nodeEl = resolveElement(nodeRef);
        if (!partEl || partEl.contains(nodeEl) || partEl.style.transform) continue;
        const nodeBox = bounds(nodeRef),
          partBox = bounds(partRef);
        const axis = column ? 'x' : 'y',
          span = column ? 'width' : 'height',
          limit = column ? width : height;
        const nodeMid = nodeBox[axis] + nodeBox[span] / 2;
        const partMid = partBox[axis] + partBox[span] / 2;
        let delta = nodeMid - partMid;
        const start = partBox[axis] + delta,
          end = start + partBox[span];
        if (start < 0) delta -= start;
        if (end > limit) delta -= end - limit;
        if (Math.abs(delta) >= 0.5)
          partEl.style.transform = column ? `translateX(${delta}px)` : `translateY(${delta}px)`;
      }
      const arrows = new Map<string, Box>();
      const fragment = document.createDocumentFragment();
      for (const mark of scene.annotations) {
        if (mark.kind !== 'arrow') continue;
        const endpoints =
          mark.target !== undefined
            ? besideBox(bounds(mark.target), mark.side, mark.direction, mark.size, mark.offset)
            : mark.side
              ? besideSpan(
                  bounds(mark.from),
                  bounds(mark.to),
                  mark.side,
                  mark.direction,
                  mark.size,
                  mark.offset,
                  nodeBoxes(mark.from, mark.to),
                )
              : betweenBoxes(bounds(mark.from), bounds(mark.to));
        const geometry = arrowGeometry(...endpoints, mark.size, mark.arrows);
        arrows.set(mark.id, geometry.box);
        const group = svgElement('g', {
          class: `composition-arrow annotation-tone-${mark.tone}`,
          'data-annotation': mark.id,
          'data-arrows': mark.arrows,
          'data-size': String(mark.size),
          role: 'img',
          'aria-label': mark.label || (mark.arrows === 'both' ? '両向きの解説矢印' : '解説矢印'),
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
    } finally {
      observe();
    }
  };
  const view = root.ownerDocument.defaultView;
  observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (frame !== null || disposed) return;
          frame = view!.requestAnimationFrame(() => {
            frame = null;
            update();
          });
        });
  observe();
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
  const text = svgElement('text', {
    class: 'composition-arrow-label',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  text.setAttribute(
    'x',
    String(
      geometry.vertical
        ? geometry.box.x + geometry.box.width + 28
        : geometry.box.x + geometry.box.width / 2,
    ),
  );
  text.setAttribute('y', String(geometry.box.y - 18));
  text.textContent = mark.label;
  return text;
}
