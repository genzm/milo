import {
  type DiagramRegion,
  type DiagramGuideMark,
  type DiagramLegendItem,
  type DiagramScene,
  type DiagramLayout,
} from './types';
import { layoutField } from './layout-field.ts';
import { resolvedLinks, linkGeometry } from './links';
import { estimateFieldLabel } from './labels.ts';
import { estimateCardSize } from './metrics';
import { usesSpatialRadial, layoutRadialSpatial } from './layout-radial.ts';
import { layoutRadial } from './layout-classic-radial';
import { layoutRing } from './layout-ring';

function emptySpatial() {
  return {
    regions: [] as DiagramRegion[],
    guides: [] as DiagramGuideMark[],
    legend: [] as DiagramLegendItem[],
  };
}

/** Deterministic placement for ring and radial diagrams. Flow uses the canvas engine. */
export function layoutDiagram(
  scene: DiagramScene,
  measured: {
    labels?: { width: number; height: number }[];
    notes?: { width: number; height: number }[];
    cards?: { width: number; height: number }[];
  } = {},
): DiagramLayout {
  const { options } = scene;
  if (options.layout === 'field') {
    const field = layoutField(
      {
        options: {
          width: options.width,
          height: options.height,
          guide: options.guide,
          xLow: options.xLow,
          xHigh: options.xHigh,
          yLow: options.yLow,
          yHigh: options.yHigh,
          clusterRegion: options.clusterRegion,
        },
        items: scene.items.map((item) => ({
          id: item.id,
          title: item.title,
          shape: item.shape,
          x: item.x ?? 0,
          y: item.y ?? 0,
          cluster: item.cluster,
        })),
        links: resolvedLinks(scene),
        zones: scene.zones,
        clusters: scene.clusters,
      },
      {
        labels: measured.labels || scene.items.map((item) => estimateFieldLabel(item.title)),
        cards: measured.cards || scene.items.map((item) => estimateCardSize(item, false)),
      },
    );
    return {
      width: options.width,
      height: options.height,
      items: field.items,
      links: field.links,
      noteLinks: field.noteLinks,
      overflow: field.overflow,
      regions: field.regions,
      guides: field.guides,
      legend: field.legend,
    };
  }
  if (options.layout === 'radial') {
    const sizes =
      measured.cards ||
      scene.items.map((item) => estimateCardSize(item, item.id === options.center));
    const spatial = usesSpatialRadial(scene);
    const radial = spatial ? layoutRadialSpatial(scene, sizes) : layoutRadial(scene, sizes);
    const { items, overflow } = radial;
    const byId = new Map(items.map((item) => [item.id, item]));
    const links = resolvedLinks(scene)
      .map((link) => {
        const geometry = linkGeometry(byId.get(link.from)!, byId.get(link.to)!, spatial);
        return { ...link, path: geometry.path, labelAt: geometry.labelAt };
      })
      .filter((link) => link.path);
    return {
      width: options.width,
      height: options.height,
      items,
      links,
      noteLinks: [],
      overflow,
      overflowReason: radial?.overflowReason,
      fitScale: radial?.fitScale,
      ...emptySpatial(),
    };
  }
  const ring = layoutRing(scene, measured);
  const byId = new Map(ring.items.map((item) => [item.id, item]));
  const links = resolvedLinks(scene).map((link) => {
    const geometry = linkGeometry(byId.get(link.from)!, byId.get(link.to)!);
    return { ...link, path: geometry.path, labelAt: geometry.labelAt };
  });
  return {
    width: options.width,
    height: options.height,
    items: ring.items,
    links,
    noteLinks: ring.noteLinks,
    overflow: ring.overflow,
    ...emptySpatial(),
  };
}
