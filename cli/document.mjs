import MarkdownIt from 'markdown-it';
import { parseDocument as parseYamlDocument } from 'yaml';
import { parse as parseJSONC } from 'jsonc-parser';

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

function validateModelJsonc(text, name) {
  const errors = [];
  parseJSONC(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`model ${name} の JSONC を確認してください。`);
}

function modelId(name) {
  if (!/^[A-Za-z][\w-]*$/.test(name)) throw new Error(`モデル ID が不正です: ${name}`);
  return name.startsWith('model-') ? name : `model-${name}`;
}

function visit(tokens, fn) {
  if (!tokens) return;
  for (const token of tokens) {
    fn(token);
    if (token.children) visit(token.children, fn);
  }
}

function collectImageRef(token, refs) {
  if (token.type === 'image') {
    const src = token.attrGet('src');
    if (src) refs.add(src);
  }
  if (token.type === 'inline' || token.type === 'text') {
    for (const match of String(token.content || '').matchAll(/::image\{([^}]*)\}/g)) {
      const asset = /asset\s*=\s*"([^"]*)"/.exec(match[1]);
      if (asset) refs.add(asset[1]);
    }
  }
}

function makeSlides(lines, separators, modelRanges) {
  const excluded = new Set();
  for (const [start, end] of modelRanges) {
    for (let line = start; line < end; line++) excluded.add(line);
  }

  const boundaries = [-1, ...separators, lines.length];
  const slides = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i] + 1;
    const end = boundaries[i + 1];
    const text = lines
      .slice(start, end)
      .filter((_, offset) => !excluded.has(start + offset))
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
    if (!text.trim()) throw new Error(`空のスライドがあります: ${i + 1}`);
    slides.push(text + '\n');
  }
  return slides;
}

export function parseTalkMarkdown(source) {
  const { meta, body } = splitFrontmatter(source);
  const lines = body.split('\n');
  const tokens = md.parse(body, {});
  const separators = [];
  const modelRanges = [];
  const models = [];
  const seen = new Set();
  const imageRefs = new Set();

  visit(tokens, (token) => {
    collectImageRef(token, imageRefs);

    if (
      token.type === 'hr' &&
      token.level === 0 &&
      token.map &&
      lines[token.map[0]]?.trim() === '---'
    ) {
      separators.push(token.map[0]);
      return;
    }

    if (token.type !== 'fence' || !token.map) return;
    const match = /^milo:model\s+([A-Za-z][\w-]*)\s*$/.exec(token.info.trim());
    if (!match) return;
    const name = match[1];
    const id = modelId(name);
    if (seen.has(id)) throw new Error(`モデル ID が重複しています: ${name}`);
    seen.add(id);
    const text = token.content.replace(/^\n+|\n+$/g, '') + '\n';
    validateModelJsonc(text, name);
    models.push({ id, kind: 'model', name: `${name}.jsonc`, text });
    modelRanges.push(token.map);
  });

  return {
    meta,
    models,
    slides: makeSlides(lines, separators, modelRanges),
    imageRefs: [...imageRefs],
  };
}
