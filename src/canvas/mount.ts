import { svgElement } from '../svg.ts';
import type { RenderContext } from '../render/context';
import { layoutFlowFromCanvas } from '../flow/layout.ts';
import { estimateNodeHeight } from '../flow/measure.ts';
import { routeFreeEdges } from '../flow/route.ts';
import { fromCanvasScene } from '../flow/normalize.ts';
import { measureBorderBox, sceneRatio } from '../diagram/measure.ts';
import { FLOW, FLOW_DIAGNOSTIC_MESSAGE } from '../flow/types.ts';
import { canvasHeight, layoutCanvas } from './layout.ts';
import { parseCanvas } from './parse.ts';
import type { CanvasScene } from './types.ts';

let canvasSequence = 0;

function diamondOutline() {
  const outline = svgElement('svg', {
    class: 'canvas-diamond-stroke',
    viewBox: '0 0 1 1',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  outline.append(svgElement('polygon', { points: '0.5,0 1,0.5 0.5,1 0,0.5' }));
  return outline;
}

/** Mount an already-parsed canvas scene and keep its SVG connection layer in sync. */
export function mountCanvasScene(
  element: HTMLElement,
  scene: CanvasScene,
  context: RenderContext,
): { update: () => void; dispose: () => void } {
  const uid = `milo-canvas-${++canvasSequence}`;
  element.classList.add('milo-canvas', `canvas-layout-${scene.options.layout}`);
  element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
  const svg = svgElement('svg', {
    class: 'canvas-connections',
    viewBox: `0 0 ${scene.options.width} ${scene.options.height}`,
    'aria-hidden': 'true',
  }) as SVGSVGElement;
  const flowMarks = scene.options.layout === 'flow';
  const defs = svgElement('defs', {}),
    marker = svgElement('marker', {
      id: `${uid}-arrow`,
      viewBox: '0 0 10 10',
      refX: 10,
      refY: 5,
      markerWidth: flowMarks ? 5 : 7,
      markerHeight: flowMarks ? 5 : 7,
      orient: 'auto-start-reverse',
    });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'canvas-arrow-head' }));
  defs.append(marker);
  svg.append(defs);
  const content = document.createElement('div');
  content.className = 'canvas-content';
  const elements = scene.nodes.map((node) => {
    const item = document.createElement('section');
    item.className = `canvas-node canvas-shape-${node.shape} canvas-tone-${node.tone}${node.fill === 'none' ? ' canvas-fill-none' : ''}`;
    item.dataset.canvasNode = node.id;
    if (context.renderMarkdown) item.innerHTML = context.renderMarkdown(node.markdown);
    else item.textContent = node.markdown;
    if (node.shape === 'diamond') item.prepend(diamondOutline());
    content.append(item);
    return item;
  });
  const overflowHint = document.createElement('div');
  overflowHint.className = 'canvas-overflow-hint';
  overflowHint.hidden = true;
  content.append(overflowHint);
  element.replaceChildren(svg, content);

  let disposed = false;
  const draw = () => {
    if (disposed) return;
    const ratio = sceneRatio(element, scene.options.width);
    const atWidth = new Map<number, number[]>();
    const preferredWidth = scene.options.layout === 'free' ? 230 : FLOW.PREFERRED_WIDTH;
    const candidates = scene.options.layout === 'free' ? [preferredWidth] : FLOW.WIDTH_CANDIDATES;
    for (const candidate of candidates) {
      elements.forEach((item, i) => {
        const width = scene.nodes[i].width ?? candidate;
        item.style.width = `${(width / scene.options.width) * 100}%`;
        item.style.minHeight = '';
        item.style.height = '';
      });
      atWidth.set(
        candidate,
        elements.map((item, i) => {
          if (scene.nodes[i].height !== undefined) return scene.nodes[i].height!;
          const height = measureBorderBox(item).height * ratio;
          return height > 1 ? height : estimateNodeHeight(scene.nodes[i].markdown);
        }),
      );
    }
    const measured = { heights: atWidth.get(preferredWidth) || [], atWidth };
    const layout = scene.options.layout === 'flow' ? layoutFlowFromCanvas(scene, measured) : null;
    scene.options.height = layout?.height ?? canvasHeight(scene, measured.heights);
    element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
    svg.setAttribute('viewBox', `0 0 ${scene.options.width} ${scene.options.height}`);
    const frames = layout
      ? scene.nodes.map((node) => layout.nodeFrames.get(node.id)!)
      : layoutCanvas(scene, measured.heights);
    elements.forEach((item, i) => {
      const frame = frames[i];
      item.style.left = `${(frame.x / scene.options.width) * 100}%`;
      item.style.top = `${(frame.y / scene.options.height) * 100}%`;
      item.style.width = `${(frame.width / scene.options.width) * 100}%`;
      item.style.minHeight = `${(frame.height / scene.options.height) * 100}%`;
      item.style.height = `${(frame.height / scene.options.height) * 100}%`;
    });
    svg.querySelector('.canvas-edge-layer')?.remove();
    const layer = svgElement('g', { class: 'canvas-edge-layer' });
    const byId = new Map(scene.nodes.map((node, i) => [node.id, frames[i]]));
    const paths = layout?.edgePaths ?? routeFreeEdges(fromCanvasScene(scene), byId);
    const routed = paths.map((item) => ({ item, edge: scene.edges[item.index] }));
    const labeled = new Set<number>();
    for (const { item, edge } of routed) {
      if (!edge) continue;
      const arrows = item.arrows ?? edge.arrows;
      const attrs: Record<string, string | number> = {
        d: item.path,
        'data-edge-from': item.from,
        'data-edge-to': item.to,
        'data-edge-role': item.role || 'edge',
        class: `canvas-edge canvas-edge-${edge.tone}${edge.dashed ? ' is-dashed' : ''}`,
      };
      if (arrows === 'end' || arrows === 'both') attrs['marker-end'] = `url(#${uid}-arrow)`;
      if (arrows === 'start' || arrows === 'both') attrs['marker-start'] = `url(#${uid}-arrow)`;
      layer.append(svgElement('path', attrs));
      if (edge.label && item.role !== 'stem' && item.role !== 'bus' && !labeled.has(item.index)) {
        labeled.add(item.index);
        layer.append(
          svgElement(
            'text',
            {
              x: item.label.x,
              y: item.label.y,
              class: 'canvas-edge-label',
              'text-anchor': 'middle',
            },
            edge.label,
          ),
        );
      }
    }
    svg.append(layer);
    const diagnostics = [...(layout?.diagnostics || [])];
    elements.forEach((item, i) => {
      const frame = frames[i];
      if (frame && measureBorderBox(item).height * ratio > frame.height + 2) {
        diagnostics.push({
          code: 'TEXT_OVERFLOW',
          severity: 'warning',
          nodeIds: [scene.nodes[i].id],
          message: FLOW_DIAGNOSTIC_MESSAGE.TEXT_OVERFLOW,
        });
      }
    });
    const seen = new Set<string>();
    const unique = diagnostics.filter((item) => {
      if (item.code === 'CYCLE_DETECTED') return false;
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    });
    overflowHint.hidden = unique.length === 0;
    overflowHint.textContent = unique[0]?.message || '';
    element.classList.toggle('is-overflow', unique.length > 0);
    if (unique.length)
      element.setAttribute('data-canvas-overflow', unique.map((item) => item.code).join(' '));
    else element.removeAttribute('data-canvas-overflow');
  };
  draw();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  observer?.observe(element);
  elements.forEach((item) => observer?.observe(item));
  return {
    update: draw,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
    },
  };
}

/** Mount an HTML-in-Canvas scene and keep its SVG connection layer in sync. */
export function mountCanvas(
  element: HTMLElement,
  source: string,
  rawOptions: string,
  context: RenderContext,
): { update: () => void; dispose: () => void } {
  return mountCanvasScene(element, parseCanvas(source, rawOptions), context);
}
