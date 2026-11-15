export const CANVAS_HEAD_SIZE = 36;

type Point = { x: number; y: number };

/** Tip, and a point behind it that supplies the incoming direction. */
export function headTerminal(path: string, atStart: boolean): { tip: Point; back: Point } | null {
  const tokens = path.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;
  let i = 0;
  let x = 0;
  let y = 0;
  const segments: { tip: Point; back: Point }[] = [];
  const read = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i];
    if (!command || !/^[MLQCZ]$/i.test(command)) break;
    i += 1;
    if (/^z$/i.test(command)) continue;
    if (/^[ML]$/i.test(command)) {
      const next = { x: read(), y: read() };
      if (/^L$/i.test(command)) segments.push({ tip: next, back: { x, y } });
      x = next.x;
      y = next.y;
      continue;
    }
    if (/^Q$/i.test(command)) {
      const control = { x: read(), y: read() };
      const next = { x: read(), y: read() };
      segments.push({ tip: next, back: control });
      x = next.x;
      y = next.y;
      continue;
    }
    if (/^C$/i.test(command)) {
      read();
      read();
      const control = { x: read(), y: read() };
      const next = { x: read(), y: read() };
      segments.push({ tip: next, back: control });
      x = next.x;
      y = next.y;
    }
  }
  const segment = atStart ? segments[0] : segments[segments.length - 1];
  if (!segment) return null;
  return atStart ? { tip: segment.back, back: segment.tip } : segment;
}

/** Isosceles triangle centered on the gap. `size` is the height; the base is 1.8 times that. */
export function headTriangle(tip: Point, back: Point, size: number) {
  const dx = tip.x - back.x;
  const dy = tip.y - back.y;
  const length = Math.hypot(dx, dy);
  if (length < 1 || size <= 0) return '';
  const reach = Math.min(size, length);
  const ux = dx / length;
  const uy = dy / length;
  const mid = { x: (tip.x + back.x) / 2, y: (tip.y + back.y) / 2 };
  const apex = { x: mid.x + ux * (reach / 2), y: mid.y + uy * (reach / 2) };
  const base = { x: mid.x - ux * (reach / 2), y: mid.y - uy * (reach / 2) };
  const half = (reach * 1.8) / 2;
  const left = { x: base.x - uy * half, y: base.y + ux * half };
  const right = { x: base.x + uy * half, y: base.y - ux * half };
  return `${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`;
}
