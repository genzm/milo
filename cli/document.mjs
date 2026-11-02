import MarkdownIt from 'markdown-it';
import { registerMiloBlocks } from '../src/markdown/blocks.mjs';
import { parseDocument as parseYamlDocument } from 'yaml';

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
  if (token.type === 'milo_directive' && token.meta.directive.name === 'image') {
    add(token.meta.directive.attrs.asset);
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

export function parseTalkMarkdown(source) {
  const { meta, body } = splitFrontmatter(source);
  const lines = body.split('\n');
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  registerMiloBlocks(md);
  const tokens = md.parse(body, {});
  const separators = [];
  const imageRefs = new Map();

  visit(tokens, (token) => {
    if (
      token.type === 'hr' &&
      token.level === 0 &&
      token.map &&
      lines[token.map[0]]?.trim() === '---'
    ) {
      separators.push(token.map[0]);
      return;
    }
  });

  // Custom blocks are opaque to slide splitting. Walk their bodies separately for
  // assets, retaining original line offsets for useful slide-number diagnostics.
  const collect = (items, offset = 0) => {
    visit(items, (token, map) => {
      collectImageRef(token, map ? [map[0] + offset, map[1] + offset] : undefined, imageRefs);
      for (const nested of token.meta?.sources || []) {
        collect(md.parse(nested.source, {}), offset + nested.line);
      }
    });
  };
  collect(tokens);

  return {
    meta,
    slides: makeSlides(lines, separators),
    imageRefs: [...imageRefs].map(([ref, line]) => ({
      ref,
      slide: line == null ? undefined : slideNumber(line, separators),
    })),
  };
}
