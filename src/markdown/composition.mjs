import { atAttributes, choice, finite } from './attributes.mjs';

const idPattern = /^[A-Za-z][\w-]*$/;
const targetPattern = /^(?:all|[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)?)$/;
function target(value, name) {
  if (!value || !targetPattern.test(value))
    throw new Error(`${name} に part または part.node を指定してください。`);
  return value;
}
function positive(value, fallback, name, min = 1) {
  const number = finite(value, fallback);
  if (number < min) throw new Error(`${name} は ${min} 以上にしてください。`);
  return number;
}
function annotation(kind, raw) {
  const attrs = atAttributes(raw);
  const tone = choice(attrs.tone, ['accent', 'default', 'muted'], 'accent', 'tone');
  if (kind === 'cross') {
    return {
      kind,
      tone,
      target: target(attrs.target, 'target'),
      label: attrs.label || '否定',
      scale: positive(attrs.scale, 1, 'scale', 0.1),
      size: attrs.size === undefined ? undefined : positive(attrs.size, undefined, 'size', 24),
    };
  }
  const id = attrs.id;
  if (!id || !idPattern.test(id)) throw new Error('@arrow に id を指定してください。');
  const base = {
    kind,
    id,
    tone,
    label: attrs.label || '',
    size: positive(attrs.size, 64, 'size', 16),
    arrows: choice(attrs.arrows, ['end', 'both'], 'end', 'arrows'),
  };
  if (attrs.target) {
    if (attrs.from || attrs.to)
      throw new Error('@arrow は target または from / to のどちらかで指定してください。');
    const side = choice(attrs.side, ['top', 'right', 'bottom', 'left'], 'top', 'side');
    const direction = choice(
      attrs.direction,
      ['right', 'left', 'down', 'up'],
      side === 'top' || side === 'bottom' ? 'right' : 'down',
      'direction',
    );
    if ((side === 'top' || side === 'bottom') !== (direction === 'right' || direction === 'left'))
      throw new Error('@arrow の direction は side と平行な方向にしてください。');
    return {
      ...base,
      target: target(attrs.target, 'target'),
      side,
      direction,
      offset: positive(attrs.offset, 20, 'offset', 0),
    };
  }
  if (attrs.side || attrs.direction)
    throw new Error('@arrow の side / direction には target が必要です。');
  return { ...base, from: target(attrs.from, 'from'), to: target(attrs.to, 'to') };
}

// Parts contain ordinary Markdown, including nested compositions. Fenced samples
// must never become delimiters or annotations. Line offsets are used by the CLI.
export function parseComposition(source, rawOptions = '') {
  const attrs = atAttributes(rawOptions);
  const layout = choice(attrs.layout, ['row', 'column'], 'row', 'layout');
  const gap = positive(attrs.gap, 140, 'gap', 0);
  const align = choice(attrs.align, ['start', 'center', 'end'], 'center', 'align');
  const height = positive(attrs.height, 0, 'height', 0);
  const parts = [],
    annotations = [],
    ids = new Set(['all']);
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let current = null,
    fence = '',
    depth = 0;
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line].trim();
    if (fence) {
      if (new RegExp(`^${fence[0]}{${fence.length},}\\s*$`).test(text)) fence = '';
      continue;
    }
    const opening = /^(?:`{3,}|~{3,})/.exec(text);
    if (opening) {
      if (!current) throw new Error('@compose の内容は @part で囲んでください。');
      fence = opening[0];
      continue;
    }
    if (current && /^@compose(?:\s|$)/.test(text)) {
      depth++;
      continue;
    }
    if (current && text === '@endcompose' && depth > 0) {
      depth--;
      continue;
    }
    if (depth > 0) continue;
    const part = /^@part\s+([A-Za-z][\w-]*)(?:\s+(.*))?$/.exec(text);
    if (part) {
      if (current) throw new Error('part を閉じる @endpart がありません。');
      if (ids.has(part[1])) throw new Error(`compose の ID が重複しています: ${part[1]}`);
      ids.add(part[1]);
      const options = atAttributes(part[2] || '');
      current = {
        id: part[1],
        align: options.align
          ? choice(options.align, ['start', 'center', 'end'], 'center', 'part align')
          : undefined,
        line: line + 1,
        width:
          options.width === undefined
            ? undefined
            : positive(options.width, undefined, 'part width', 80),
      };
    } else if (text === '@endpart') {
      if (!current) throw new Error('@endpart に対応する @part がありません。');
      const body = lines.slice(current.line, line).join('\n');
      if (!body.trim()) throw new Error(`part ${current.id} の内容が空です。`);
      parts.push({ ...current, source: body });
      current = null;
    } else if (!current && text) {
      const mark = /^@(arrow|cross)(?:\s+(.*))?$/.exec(text);
      if (!mark) throw new Error('@compose には @part / @arrow / @cross を指定してください。');
      const item = annotation(mark[1], mark[2] || '');
      if (item.kind === 'arrow') {
        if (ids.has(item.id)) throw new Error(`compose の ID が重複しています: ${item.id}`);
        ids.add(item.id);
      }
      annotations.push(item);
    }
  }
  if (current) throw new Error('part を閉じる @endpart がありません。');
  if (!parts.length) throw new Error('compose には1つ以上の @part が必要です。');
  return { layout, gap, align, height, parts, annotations };
}
