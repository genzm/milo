import { readFileSync } from 'node:fs';
const initialSlideIds = ['slide-cover', 'slide-wave', 'slide-motion' /*, 'slide-tools' */];
const slideTexts = readFileSync(new URL('./slides.md', import.meta.url), 'utf8')
  .replace(/\r\n?/g, '\n')
  .split(/^---$/m)
  .map((text) => text.replace(/^\n+|\n+$/g, '') + '\n');
if (slideTexts.some((text) => !text.trim()))
  throw new Error('slides.md に空のスライドがあります。');
const slides = slideTexts.map((text, index) => ({
  id: initialSlideIds[index] || `slide-${String(index + 1).padStart(2, '0')}`,
  kind: 'slide',
  name: `slides.md#${index + 1}`,
  text,
}));
export const blocks = [
  {
    id: 'manifest',
    kind: 'manifest',
    name: 'deck.jsonc',
    text: `{
  "title": "小さな実験室",
  "layouts": {
    "slide-cover": "cover",
    "slide-wave": "lab",
    "slide-motion": "media"
    // "slide-tools": "lab" // Components are currently disabled.
  }
}`,
  },
  ...slides,
  {
    id: 'model-wave',
    kind: 'model',
    name: 'wave.jsonc',
    text: `{
  "input": "t",
  "parameters": {
    "A": 1.0,
    "gamma": 0.2,
    "omega": 3.0
  },
  "expression": "A * exp(-gamma * t) * cos(omega * t)"
}`,
  },
  /* Components are intentionally disabled. Keep this seed block with the
 * implementation so the feature can be restored without recreating it.
{id:'component-phase',kind:'component',name:'phase.js',text:`// This code lives inside the document and runs in a Worker.
// Edit the colors, geometry, controls, or their behavior.
function view({ params, session }) {
  const phase = session.phase ?? 1.05;
  const A = params.A ?? 1;
  const cx = 215, cy = 135;
  const radius = 88 * A;
  const x = cx + radius * Math.cos(phase);
  const y = cy - radius * Math.sin(phase);
  const accent = "#D42D5A";
  const light = "#F1CBD5";
  const shape = (tag, attrs, text) => ({ tag, attrs, text });

  return {
    width: 800,
    height: 280,
    label: "円運動とその投影",
    nodes: [
      shape("line", { x1: 70, y1: cy, x2: 725, y2: cy, stroke: light }),
      shape("line", { x1: cx, y1: 18, x2: cx, y2: 252, stroke: light }),
      shape("circle", { cx, cy, r: Math.abs(radius), fill: "none", stroke: light, "stroke-width": 2 }),
      shape("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: accent, "stroke-width": 2.5 }),
      shape("line", { x1: x, y1: y, x2: 565, y2: y, stroke: "#E4A9B9", "stroke-dasharray": "5 5" }),
      shape("line", { x1: 565, y1: cy, x2: 565, y2: y, stroke: accent, "stroke-width": 5, "stroke-linecap": "round" }),
      shape("circle", { cx: x, cy: y, r: 7, fill: accent }),
      shape("circle", { cx: 565, cy: y, r: 7, fill: accent }),
      shape("text", { x: 215, y: 270, "text-anchor": "middle", fill: "#6B6B6B", "font-size": 13 }, "PHASE"),
      shape("text", { x: 565, y: 270, "text-anchor": "middle", fill: "#6B6B6B", "font-size": 13 }, "PROJECTION"),
      shape("text", { x: 605, y: 45, fill: accent, "font-size": 21 }, (A * Math.sin(phase)).toFixed(2))
    ],
    controls: [
      { id: "phase", type: "range", label: "位相", min: 0, max: 6.28, step: 0.01, value: phase },
      { id: "amplitude", type: "range", label: "振幅 A", min: 0.1, max: 1.2, step: 0.01, value: A }
    ],
    caption: "同じHTMLの中で、図のコードも編集できます。"
  };
}

function update(event, ctx) {
  if (event.id === "phase") {
    return { session: { phase: event.value } };
  }
  if (event.id === "amplitude") {
    return { parameter: "A", value: event.value };
  }
  return {};
}`},
*/
  {
    id: 'asset-loop',
    kind: 'asset',
    name: 'flow.gif',
    text:
      'mime: image/gif\n\n' +
      readFileSync(new URL('./assets/flow.gif', import.meta.url))
        .toString('base64')
        .match(/.{1,76}/g)
        .join('\n'),
  },
];
