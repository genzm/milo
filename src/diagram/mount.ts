import {
  type DiagramLevel,
  type DiagramLinkKind,
  type DiagramScene,
  type DiagramBox,
} from './types';
import { type CanvasArrows, type CanvasScene, mountCanvasScene } from '../canvas';
import { resolvedLinks } from './links';
import { FLOW } from '../flow/types.ts';
import { type RenderContext, esc } from '../directives';
import { parseDiagram } from './parse';
import { svgElement } from '../svg.ts';
import {
  resolvedNoteMode,
  estimateTitleSize,
  estimateLabelSize,
  estimateNoteSize,
  estimateCardSize,
} from './metrics';
import { usesSpatialRadial } from './layout-radial.ts';
import { measureBorderBox, sceneRatio } from './measure.ts';
import { NOTE_MAX } from './constants';
import { estimateFieldLabel } from './labels.ts';
import { layoutDiagram } from './layout';
import { spatialSignature, regionRect } from './render-spatial.ts';
import { annotationBox } from './geometry-ring';

let diagramSequence = 0;

function levelClass(level: DiagramLevel) {
  return level === 'none' ? '' : ` diagram-level-${level}`;
}

function arrowsFor(kind: DiagramLinkKind): CanvasArrows {
  return kind === 'both' ? 'both' : kind === 'forward' ? 'end' : 'none';
}

function toCanvasScene(scene: DiagramScene): CanvasScene {
  const links = resolvedLinks(scene);
  return {
    options: {
      layout: 'flow',
      direction: scene.options.direction,
      width: scene.options.width,
      height: scene.options.height,
      autoHeight: scene.options.autoHeight,
      gap: FLOW.PREFERRED_GAP,
      route: scene.options.route,
    },
    nodes: scene.items.map((item) => ({
      id: item.id,
      markdown: item.markdown ? `### ${item.title}\n\n${item.markdown}` : `### ${item.title}`,
      shape: item.shape === 'vertex' ? 'ellipse' : 'round',
      tone:
        item.level === 'high'
          ? 'accent'
          : item.level === 'medium'
            ? 'muted'
            : item.level === 'low'
              ? 'default'
              : 'default',
      dx: 0,
      dy: 0,
      pinned: false,
    })),
    edges: links.map((link) => ({
      from: link.from,
      to: link.to,
      label: link.label,
      tone: 'default' as const,
      dashed: false,
      arrows: arrowsFor(link.kind),
    })),
  };
}

function applyBox(
  element: HTMLElement,
  box: DiagramBox,
  width: number,
  height: number,
  mode: 'size' | 'center' | 'dot' = 'size',
) {
  if (mode === 'center' || mode === 'dot') {
    element.style.left = `${((box.x + box.width / 2) / width) * 100}%`;
    element.style.top = `${((box.y + box.height / 2) / height) * 100}%`;
    element.style.transform = 'translate(-50%, -50%)';
    if (mode === 'dot') {
      element.style.width = '';
      element.style.height = '';
      return;
    }
    element.style.width = 'max-content';
    element.style.height = 'auto';
    return;
  }
  element.style.left = `${(box.x / width) * 100}%`;
  element.style.top = `${(box.y / height) * 100}%`;
  element.style.width = `${(box.width / width) * 100}%`;
  element.style.transform = '';
}

/** Mount @diagram as HTML nodes plus an SVG connection layer. */
export function mountDiagram(
  element: HTMLElement,
  source: string,
  rawOptions: string,
  context: RenderContext,
): { update: () => void; dispose: () => void } {
  const scene = parseDiagram(source, rawOptions);
  if (scene.options.layout === 'flow') {
    element.classList.add('milo-diagram', 'diagram-layout-flow');
    element.style.setProperty('--diagram-display-width', `${scene.options.width}px`);
    element.style.setProperty('--diagram-display-height', `${scene.options.height}px`);
    return mountCanvasScene(element, toCanvasScene(scene), context);
  }

  const uid = `milo-diagram-${++diagramSequence}`;
  element.className = `milo-diagram diagram-layout-${scene.options.layout}`;
  element.style.setProperty('--diagram-display-width', `${scene.options.width}px`);
  element.style.setProperty('--diagram-display-height', `${scene.options.height}px`);
  element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', scene.items.map((item) => item.title).join('、'));

  const svg = svgElement('svg', {
    class: 'diagram-connections',
    viewBox: `0 0 ${scene.options.width} ${scene.options.height}`,
    'aria-hidden': 'true',
  }) as SVGSVGElement;
  const defs = svgElement('defs', {});
  const marker = svgElement('marker', {
    id: `${uid}-arrow`,
    viewBox: '0 0 10 10',
    refX: 10,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: 'auto-start-reverse',
  });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'diagram-arrow-head' }));
  const noteMarker = svgElement('marker', {
    id: `${uid}-note-arrow`,
    viewBox: '0 0 10 10',
    refX: 10,
    refY: 5,
    markerWidth: 5,
    markerHeight: 5,
    orient: 'auto-start-reverse',
  });
  noteMarker.append(
    svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'diagram-note-arrow-head' }),
  );
  defs.append(marker, noteMarker);
  svg.append(defs);

  const hasOutsideNotes =
    scene.options.layout === 'ring' &&
    scene.items.some((item) => resolvedNoteMode(item, scene.options) === 'outside');
  if (hasOutsideNotes) element.classList.add('diagram-has-notes');
  if (scene.options.layout === 'field' || usesSpatialRadial(scene))
    element.classList.add('diagram-has-spatial');

  const content = document.createElement('div');
  content.className = 'diagram-content';
  const clusterTone = new Map<string, string>();
  const toneCycle = ['accent', 'muted', 'ink', 'soft'];
  let toneIndex = 0;
  for (const cluster of scene.clusters) clusterTone.set(cluster.id, cluster.tone);
  for (const item of scene.items) {
    if (!item.cluster || clusterTone.has(item.cluster)) continue;
    clusterTone.set(item.cluster, toneCycle[toneIndex++ % toneCycle.length]);
  }
  const nodes = scene.items.map((item) => {
    const node = document.createElement('div');
    const isCenter = scene.options.layout === 'radial' && item.id === scene.options.center;
    const clusterClass = item.cluster ? ` is-cluster-${clusterTone.get(item.cluster)}` : '';
    if (scene.options.layout === 'field' && item.shape !== 'card') {
      node.className = `diagram-dot${levelClass(item.level)}${clusterClass}`;
      node.dataset.diagramItem = item.id;
    } else if (scene.options.layout === 'ring') {
      node.className = `diagram-vertex${levelClass(item.level)}`;
      node.dataset.diagramItem = item.id;
      if (item.badge) node.innerHTML = `<span class="diagram-badge">${esc(item.badge)}</span>`;
    } else {
      node.className = `diagram-card${levelClass(item.level)}${isCenter ? ' is-center' : ''}`;
      node.dataset.diagramItem = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-card-title';
      title.textContent = item.title;
      node.append(title);
      if (item.markdown) {
        const body = document.createElement('div');
        body.className = 'diagram-card-body';
        if (context.renderMarkdown) body.innerHTML = context.renderMarkdown(item.markdown);
        else body.textContent = item.markdown;
        node.append(body);
      }
    }
    content.append(node);
    return node;
  });
  const annotations = scene.items.map((item) => {
    if (scene.options.layout === 'field') {
      const wrap = document.createElement('div');
      wrap.className = 'diagram-label diagram-field-label';
      wrap.dataset.diagramLabel = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-label-title';
      title.textContent = item.title;
      wrap.append(title);
      content.append(wrap);
      return wrap;
    }
    if (scene.options.layout !== 'ring') return null;
    const mode = resolvedNoteMode(item, scene.options);
    if (mode === 'none') return null;
    const wrap = document.createElement('div');
    if (mode === 'outside') {
      wrap.className = `diagram-note diagram-note-${scene.options.noteStyle}`;
      wrap.dataset.diagramNote = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-note-title';
      title.textContent = item.title;
      wrap.append(title);
      if (item.markdown) {
        const body = document.createElement('div');
        body.className = 'diagram-note-body';
        if (context.renderMarkdown) body.innerHTML = context.renderMarkdown(item.markdown);
        else body.textContent = item.markdown;
        wrap.append(body);
      }
    } else {
      wrap.className = 'diagram-label';
      wrap.dataset.diagramLabel = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-label-title';
      title.textContent = item.title;
      wrap.append(title);
      if (item.markdown) {
        const note = document.createElement('div');
        note.className = 'diagram-label-note';
        if (context.renderMarkdown) note.innerHTML = context.renderMarkdown(item.markdown);
        else note.textContent = item.markdown;
        wrap.append(note);
      }
    }
    content.append(wrap);
    return wrap;
  });
  const overflowHint = document.createElement('div');
  overflowHint.className = 'diagram-overflow-hint';
  overflowHint.hidden = true;
  overflowHint.textContent =
    scene.options.layout === 'ring' ? '注釈が領域に収まりません' : '図が領域に収まりません';
  const legend = document.createElement('div');
  legend.className = 'diagram-legend';
  legend.hidden = true;
  content.append(overflowHint, legend);
  element.replaceChildren(svg, content);

  let disposed = false;
  let lastSignature = '';
  const measurePart = (
    node: Element | null | undefined,
    fallback: { width: number; height: number },
    ratio: number,
  ) => {
    if (!node) return fallback;
    const size = measureBorderBox(node as HTMLElement);
    const width = size.width * ratio;
    const height = size.height * ratio;
    return width > 1 ? { width, height } : fallback;
  };
  const draw = () => {
    if (disposed) return;
    const ratio = sceneRatio(element, scene.options.width);
    annotations.forEach((node, i) => {
      if (!node) return;
      const outside = resolvedNoteMode(scene.items[i], scene.options) === 'outside';
      const cap = scene.options.layout === 'field' ? 180 : outside ? NOTE_MAX : 200;
      const maxWidth = `${(cap / scene.options.width) * 100}%`;
      if (node.style.maxWidth !== maxWidth) node.style.maxWidth = maxWidth;
    });
    const measuredLabels = annotations.map((node, i) => {
      const item = scene.items[i];
      const mode = resolvedNoteMode(item, scene.options);
      if (mode === 'outside') {
        return measurePart(
          node?.querySelector('.diagram-note-title') || node,
          estimateTitleSize(item.title),
          ratio,
        );
      }
      if (scene.options.layout === 'field') {
        if (!node) return estimateFieldLabel(item.title);
        const width = Math.min(180, node.scrollWidth * ratio);
        const height = node.scrollHeight * ratio;
        return width > 1 ? { width, height } : estimateFieldLabel(item.title);
      }
      if (!node) return estimateLabelSize(item);
      const width = Math.min(200, node.scrollWidth * ratio);
      const height = node.scrollHeight * ratio;
      return width > 1 ? { width, height } : estimateLabelSize(item);
    });
    const measuredNotes = annotations.map((node, i) => {
      const item = scene.items[i];
      if (resolvedNoteMode(item, scene.options) !== 'outside') return { width: 0, height: 0 };
      return measurePart(
        node?.querySelector('.diagram-note-body'),
        estimateNoteSize(item.markdown),
        ratio,
      );
    });
    const measuredCards = nodes.map((node, i) => {
      const size = measureBorderBox(node);
      const width = size.width * ratio;
      const height = size.height * ratio;
      return width > 1
        ? { width, height }
        : estimateCardSize(scene.items[i], scene.items[i].id === scene.options.center);
    });
    const layout = layoutDiagram(scene, {
      labels: measuredLabels,
      notes: measuredNotes,
      cards: measuredCards,
    });
    const signature = spatialSignature(layout);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const byId = new Map(layout.items.map((item) => [item.id, item]));
    nodes.forEach((node, i) => {
      const box = byId.get(scene.items[i].id)!;
      applyBox(
        node,
        box,
        layout.width,
        layout.height,
        box.kind === 'card' ? 'center' : box.kind === 'dot' ? 'dot' : 'size',
      );
    });
    annotations.forEach((node, i) => {
      const placed = byId.get(scene.items[i].id);
      if (!node || !placed) return;
      const box =
        resolvedNoteMode(scene.items[i], scene.options) === 'outside' &&
        scene.options.layout === 'ring'
          ? annotationBox(placed)
          : placed.label;
      if (!box) {
        node.style.display = 'none';
        return;
      }
      node.style.display = '';
      applyBox(node, box, layout.width, layout.height);
    });
    const fit = layout.fitScale ?? 1;
    const layerScale = fit < 0.999 ? `scale(${fit})` : '';
    content.style.transform = layerScale;
    svg.style.transform = layerScale;
    content.style.transformOrigin = '50% 50%';
    svg.style.transformOrigin = '50% 50%';
    overflowHint.textContent =
      layout.overflowReason === 'read'
        ? '文字が小さくて読めません'
        : layout.overflowReason === 'overlap'
          ? '同じ方向のカードが重なっています'
          : scene.options.layout === 'ring'
            ? '注釈が領域に収まりません'
            : '図が領域に収まりません';
    overflowHint.hidden = !layout.overflow;
    element.classList.toggle('is-overflow', layout.overflow);
    if (layout.overflow) element.setAttribute('data-diagram-overflow', 'true');
    else element.removeAttribute('data-diagram-overflow');
    legend.hidden = !layout.legend.length;
    legend.replaceChildren(
      ...layout.legend.map((entry) => {
        const row = document.createElement('div');
        row.className = `diagram-legend-item is-${entry.tone}`;
        row.innerHTML = `<i></i><span>${esc(entry.title)}</span>`;
        return row;
      }),
    );
    svg.querySelector('.diagram-region-layer')?.remove();
    svg.querySelector('.diagram-guide-layer')?.remove();
    svg.querySelector('.diagram-note-layer')?.remove();
    svg.querySelector('.diagram-edge-layer')?.remove();
    const regionLayer = svgElement('g', { class: 'diagram-region-layer' });
    for (const region of layout.regions) {
      const box = regionRect(region.box);
      const klass = `diagram-region is-${region.kind} is-${region.tone}`;
      if (region.path) {
        regionLayer.append(svgElement('path', { d: region.path, class: klass }));
      } else if (region.marks?.length) {
        for (const mark of region.marks) {
          regionLayer.append(
            svgElement('circle', { cx: mark.x, cy: mark.y, r: mark.r, class: klass }),
          );
        }
      } else {
        regionLayer.append(svgElement('rect', { ...box, rx: 8, class: klass }));
      }
      if (region.label && region.kind === 'zone') {
        const label = region.labelBox;
        regionLayer.append(
          svgElement(
            'text',
            {
              x: label ? label.x : box.x + 10,
              y: label ? label.y + 16 : box.y + 18,
              class: 'diagram-region-label',
            },
            region.label,
          ),
        );
      }
    }
    const guideLayer = svgElement('g', { class: 'diagram-guide-layer' });
    for (const mark of layout.guides) {
      if (mark.path) guideLayer.append(svgElement('path', { d: mark.path, class: 'diagram-axis' }));
      if (mark.text)
        guideLayer.append(
          svgElement(
            'text',
            {
              x: mark.x || 0,
              y: mark.y || 0,
              class: 'diagram-axis-label',
              'text-anchor': mark.anchor || 'middle',
            },
            mark.text,
          ),
        );
    }
    svg.append(regionLayer, guideLayer);
    const noteLayer = svgElement('g', { class: 'diagram-note-layer' });
    for (const link of layout.noteLinks) {
      const attrs: Record<string, string | number> = {
        d: link.path,
        class: `diagram-note-link is-${link.kind}`,
      };
      if (link.kind === 'arrow') attrs['marker-end'] = `url(#${uid}-note-arrow)`;
      noteLayer.append(svgElement('path', attrs));
    }
    const layer = svgElement('g', { class: 'diagram-edge-layer' });
    for (const link of layout.links) {
      const attrs: Record<string, string | number> = {
        d: link.path,
        'data-edge-from': link.from,
        'data-edge-to': link.to,
        class: `diagram-edge diagram-edge-${link.kind}`,
      };
      if (link.kind === 'forward' || link.kind === 'both')
        attrs['marker-end'] = `url(#${uid}-arrow)`;
      if (link.kind === 'both') attrs['marker-start'] = `url(#${uid}-arrow)`;
      layer.append(svgElement('path', attrs));
      if (link.label)
        layer.append(
          svgElement(
            'text',
            {
              x: link.labelAt.x,
              y: link.labelAt.y,
              class: 'diagram-edge-label',
              'text-anchor': 'middle',
            },
            link.label,
          ),
        );
    }
    svg.append(noteLayer, layer);
  };
  draw();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  observer?.observe(element);
  nodes.forEach((node) => observer?.observe(node));
  annotations.forEach((node) => node && observer?.observe(node));
  return {
    update: draw,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
    },
  };
}
