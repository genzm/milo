import MarkdownIt from 'markdown-it';
import { parseDocument as parseYamlDocument } from 'yaml';

const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });

function normalize(source) {
  return source.replace(/\r\n?/g, '\n');
}

export function splitFrontmatter(source) {
  const lines = normalize(source).split('\n');
  if (lines[0] !== '---') {
    return {
      meta: {},
      body: lines.join('\n'),
    };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('frontmatter が閉じていません。');

  const yamlSource = lines.slice(1, end).join('\n');
  const document = parseYamlDocument(yamlSource);
  if (document.errors.length) {
    throw new Error(`frontmatter の YAML が不正です: ${document.errors[0].message}`);
  }

  const meta = document.toJS() ?? {};
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('frontmatter はオブジェクトにしてください。');
  }

  return {
    meta,
    body: lines.slice(end + 1).join('\n'),
  };
}

function visit(tokens, fn, map) {
  if (!tokens) return;
  for (const token of tokens) {
    const next = token.map || map;
    fn(token, next);
    if (token.children) visit(token.children, fn, next);
  }
}

function collectImageRef(token, map, refs) {
  const add = (src) => {
    if (!src || refs.has(src)) return;
    refs.set(src, map ? map[0] : undefined);
  };
  if (token.type === 'image') add(token.attrGet('src'));
  if (token.type === 'inline' || token.type === 'text') {
    for (const match of String(token.content || '').matchAll(/::image\{([^}]*)\}/g)) {
      const asset = /asset\s*=\s*"([^"]*)"/.exec(match[1]);
      if (asset) add(asset[1]);
    }
  }
}

function slideNumber(line, separators) {
  return 1 + separators.filter((separator) => line > separator).length;
}

function makeSlides(lines, separators) {
  const boundaries = [-1, ...separators, lines.length];
  const slides = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i] + 1;
    const end = boundaries[i + 1];
    const text = lines
      .slice(start, end)
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
    if (!text.trim()) throw new Error(`スライド ${i + 1} は空です。`);
    slides.push(text + '\n');
  }
  return slides;
}

function canvasRanges(lines) {
  const ranges = [];
  let outerFence = '';
  for (let start = 0; start < lines.length; start++) {
    const line = lines[start].trim();
    if (outerFence) {
      if (new RegExp(`^${outerFence[0]}{${outerFence.length},}\\s*$`).test(line)) outerFence = '';
      continue;
    }
    const outerOpening = /^(?:`{3,}|~{3,})/.exec(line);
    if (outerOpening) {
      outerFence = outerOpening[0];
      continue;
    }
    if (!/^@canvas(?:\s|$)/.test(line)) continue;
    let innerFence = '';
    for (let end = start + 1; end < lines.length; end++) {
      const text = lines[end].trim();
      if (innerFence) {
        if (new RegExp(`^${innerFence[0]}{${innerFence.length},}\\s*$`).test(text)) innerFence = '';
        continue;
      }
      const innerOpening = /^(?:`{3,}|~{3,})/.exec(text);
      if (innerOpening) {
        innerFence = innerOpening[0];
        continue;
      }
      if (text === '@endcanvas') {
        ranges.push([start, end + 1]);
        start = end;
        break;
      }
      if (end === lines.length - 1) {
        ranges.push([start, lines.length]);
        start = end;
      }
    }
  }
  return ranges;
}

function insideRanges(line, ranges) {
  return ranges.some(([start, end]) => line >= start && line < end);
}

export function parseTalkMarkdown(source) {
  const { meta, body } = splitFrontmatter(source);
  const lines = body.split('\n');
  const tokens = md.parse(body, {});
  const separators = [];
  const imageRefs = new Map();
  const canvases = canvasRanges(lines);

  visit(tokens, (token, map) => {
    collectImageRef(token, map, imageRefs);

    if (
      token.type === 'hr' &&
      token.level === 0 &&
      token.map &&
      lines[token.map[0]]?.trim() === '---' &&
      !insideRanges(token.map[0], canvases)
    ) {
      separators.push(token.map[0]);
      return;
    }
  });

  return {
    meta,
    slides: makeSlides(lines, separators),
    imageRefs: [...imageRefs].map(([ref, line]) => ({
      ref,
      slide: line == null ? undefined : slideNumber(line, separators),
    })),
  };
}
