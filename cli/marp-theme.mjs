import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { SLIDE_FONT_PACKAGE, SLIDE_FONT_WEIGHTS } from './compile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const themePath = join(root, 'marp/milo.css');

const EXCLUDED =
  /(?:^|[^\w-])(impact-block|columns-block|column-block|task-marker|plot-block|chart-[\w-]*|slider-block|equation-block|box-block|box-tone-[\w-]*|milo-canvas|canvas-[\w-]*|component-block|parameter-summary)(?![\w-])/;

const SLIDE_BOX = new Set([
  'section',
  'section.cover',
  'section.section',
  'section.media',
  'section.essay',
]);

export async function compileMarpTheme() {
  const [style, app] = await Promise.all([
    readFile(join(root, 'src/style.css'), 'utf8'),
    readFile(join(root, 'src/app.ts'), 'utf8'),
  ]);
  const size = slideSize(app);
  const parsed = parseRules(stripComments(style));
  const rootVars = declarationsOf(parsed, ':root');
  const kept = parsed.filter((rule) => keepTopLevel(rule.selector));
  const shared = { footerGap: '' };
  const transformed = kept
    .map((rule) => transform(rule, { size, topLevel: true, shared }))
    .filter(Boolean);
  const section = transformed.find((rule) => rule.selector === 'section');
  if (!section) throw new Error('src/style.css に .slide が見つかりません。');
  hoistIntoSection(section, transformed);
  addFooterGaps(transformed, shared.footerGap);
  applyRootVars(section, rootVars, transformed);
  nestUniversal(section, parsed);
  const fonts = await fontFaces();
  const css = `/* @theme milo */
/*
  src/style.css と src/app.ts、スライド用フォントから生成したファイルです。
  直接編集せず、npm run marp で作り直してください。
*/

${fonts}
${transformed.map((rule) => render(rule, 0)).join('\n\n')}

/* Marpit は section の中で最後に現れる width と height をスライド寸法にする。 */
section {
  width: ${size.width}px;
  height: ${size.height}px;
}
`;
  const config = await prettier.resolveConfig(themePath);
  return prettier.format(css, { ...config, filepath: themePath });
}

export async function writeMarpTheme() {
  const css = await compileMarpTheme();
  await writeFile(themePath, css);
  return themePath;
}

function slideSize(source) {
  const width = Number(source.match(/const SLIDE_WIDTH = (\d+)/)?.[1]);
  if (!width) throw new Error('src/app.ts の SLIDE_WIDTH を読めません。');
  if (source.includes('SLIDE_HEIGHT = (SLIDE_WIDTH * 9) / 16')) {
    return { width, height: (width * 9) / 16 };
  }
  const height = Number(source.match(/const SLIDE_HEIGHT = (\d+)/)?.[1]);
  if (!height) throw new Error('src/app.ts の SLIDE_HEIGHT を読めません。');
  return { width, height };
}

function keepTopLevel(selector) {
  const name = selector.trim();
  return (
    name === '.slide' ||
    name === '.slide u' ||
    name === '.math-prose' ||
    name === '.embedded-image' ||
    name === '.image-block' ||
    /^\.layout-(cover|section|media|essay)$/.test(name) ||
    name.startsWith(':is(.layout-')
  );
}

function declarationsOf(rules, selector) {
  return rules.find((rule) => rule.selector.trim() === selector)?.declarations ?? [];
}

function hoistIntoSection(section, rules) {
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (rule === section) continue;
    if (rule.selector.startsWith('section ')) {
      section.children.push({ ...rule, selector: rule.selector.slice('section '.length) });
      rules.splice(i, 1);
      continue;
    }
    if (rule.selector.startsWith('section')) continue;
    section.children.push(rule);
    rules.splice(i, 1);
  }
}

function addFooterGaps(rules, gap) {
  if (!gap) throw new Error('スライドフッターの余白が見つかりません。');
  const walk = (rule) => {
    if (rule.declarations.some((decl) => decl.startsWith('--slide-pad-bottom:'))) {
      rule.children = rule.children.filter((child) => child.selector !== '&:has(> footer)');
      rule.children.push({
        selector: '&:has(> footer)',
        declarations: [`padding-bottom: calc(var(--slide-pad-bottom) + ${gap})`],
        children: [],
      });
    }
    rule.children.forEach(walk);
  };
  rules.forEach(walk);
}

function applyRootVars(section, rootVars, rules) {
  const used = new Set();
  const walk = (rule) => {
    for (const decl of rule.declarations) {
      for (const match of decl.matchAll(/var\((--[\w-]+)\)/g)) used.add(match[1]);
    }
    rule.children.forEach(walk);
  };
  rules.forEach(walk);
  const defined = new Set(
    section.declarations
      .filter((decl) => decl.startsWith('--'))
      .map((decl) => decl.split(':')[0].trim()),
  );
  const copied = rootVars.filter((decl) => {
    const name = decl.split(':')[0].trim();
    return name.startsWith('--') && used.has(name) && !defined.has(name);
  });
  section.declarations.unshift(...copied);
}

function nestUniversal(section, rules) {
  const universal = rules.find((rule) => rule.selector.trim() === '*');
  const selection = rules.find((rule) => rule.selector.trim() === '::selection');
  if (selection) section.children.unshift({ ...selection, selector: '::selection' });
  if (!universal) return;
  const box = universal.declarations.find((decl) => decl.startsWith('box-sizing:'));
  if (box && !section.declarations.some((decl) => decl.startsWith('box-sizing:'))) {
    section.declarations.push(box);
  }
  section.children.unshift({ ...universal, selector: '*' });
}

function transform(rule, context) {
  if (EXCLUDED.test(rule.selector)) return null;
  const pagination = {};
  const children = [];
  for (const child of rule.children) {
    const name = child.selector.trim();
    if (name === '.slide-top' || name === '.slide-series') {
      readPagination(name, child, pagination);
      continue;
    }
    if (name === '.slide-content') {
      mergeContentBox(rule, child);
      continue;
    }
    if (name === '.slide-content.has-slide-footer') {
      const pad = child.declarations
        .map((decl) => decl.replace(/\s+/g, ' ').trim())
        .find((decl) => decl.startsWith('padding-bottom:'));
      if (!pad) throw new Error('フッター余白の padding-bottom がありません。');
      context.shared.footerGap = pad.slice('padding-bottom:'.length).trim();
      continue;
    }
    const next = transform(child, { ...context, topLevel: false });
    if (next) children.push(next);
  }
  let selector = qualify(rewriteSelector(rule.selector), context.topLevel);
  if (!selector) return null;
  const isSlideBox = SLIDE_BOX.has(selector);
  let declarations = rule.declarations.map((decl) =>
    rewriteDeclaration(decl, selector, context.size),
  );
  if (isSlideBox)
    declarations = expandPadding(declarations.filter((decl) => !dropSlideChrome(decl)));
  if (selector === '> footer' || selector.endsWith('> footer')) {
    declarations = declarations.map(rewriteFooterDeclaration);
  }
  if (pagination.declarations?.length) {
    children.unshift({
      selector: '&::after',
      declarations: paginationDeclarations(pagination.declarations, selector === 'section'),
      children: [],
    });
  }
  if (selector === 'section') {
    children.unshift({
      selector: `&:not([data-marpit-pagination])::after,
&[data-marpit-pagination='']::after,
&[data-marpit-pagination='1']::after`,
      declarations: ['visibility: hidden'],
      children: [],
    });
  }
  if (!declarations.length && !children.length) return null;
  return { selector, declarations, children };
}

function readPagination(name, rule, pagination) {
  const keep =
    name === '.slide-top'
      ? new Set(['position', 'right', 'top', 'left', 'bottom', 'z-index', 'margin', 'color'])
      : new Set(['font', 'color', 'letter-spacing']);
  pagination.declarations ??= [];
  for (const decl of rule.declarations) {
    const prop = decl.split(':')[0].trim();
    if (!keep.has(prop)) continue;
    pagination.declarations = pagination.declarations.filter(
      (item) => item.split(':')[0].trim() !== prop,
    );
    pagination.declarations.push(decl);
  }
}

function mergeContentBox(parent, rule) {
  const scaffold = new Set(['flex', 'min-width', 'min-height', 'overflow']);
  const kept = rule.declarations.filter((decl) => !scaffold.has(decl.split(':')[0].trim()));
  parent.declarations.push(...kept);
}

function qualify(selector, topLevel) {
  if (!topLevel) return selector;
  if (
    selector === 'section' ||
    selector.startsWith('section ') ||
    selector.startsWith('section.') ||
    selector.startsWith('section:')
  ) {
    return selector;
  }
  if (/^\.(cover|section|media|essay|lab)$/.test(selector) || selector.startsWith(':is(')) {
    return `section${selector}`;
  }
  return selector;
}

function rewriteSelector(selector) {
  let next = selector.trim();
  next = next.replaceAll('.slide-content.has-slide-footer', '&:has(> footer)');
  next = next.replaceAll('.slide-footer-content', '> footer');
  next = next.replaceAll('.embedded-image', 'img');
  next = next.replaceAll('.layout-cover', '.cover');
  next = next.replaceAll('.layout-section', '.section');
  next = next.replaceAll('.layout-media', '.media');
  next = next.replaceAll('.layout-essay', '.essay');
  next = next.replaceAll('.layout-lab', '.lab');
  next = next.replaceAll('.slide-content', '');
  next = next.replaceAll('.slide', 'section');
  next = next.replaceAll('h1:first-child', 'h1:first-of-type');
  if (next.trim() === '.accent-emphasis') next = 'mark, .accent-emphasis';
  return next
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*>\s*/g, ' > ')
    .trim();
}

function rewriteDeclaration(decl, selector, size) {
  let next = decl.replace(/\s+/g, ' ').trim();
  if (
    selector === 'section' ||
    selector.startsWith('section.') ||
    selector.startsWith('section:')
  ) {
    next = next.replaceAll('var(--slide-width)', `${size.width}px`);
    next = next.replaceAll('var(--slide-height)', `${size.height}px`);
  }
  return next;
}

function dropSlideChrome(decl) {
  const prop = decl.split(':')[0].trim();
  return (
    prop === 'border' ||
    prop === 'border-radius' ||
    prop === 'transform-origin' ||
    prop === 'min-height'
  );
}

function expandPadding(declarations) {
  return declarations.flatMap((decl) => {
    if (!decl.startsWith('padding:')) return [decl];
    const parts = decl.slice('padding:'.length).trim().split(/\s+/);
    if (parts.length > 4 || (parts.length === 4 && parts[3] !== parts[1])) {
      throw new Error(`左右で違う padding は Marp のフッター位置に変換できません: ${decl}`);
    }
    const [top, right = top, bottom = top] = parts;
    return [
      `--slide-pad-top: ${top}`,
      `--slide-pad-x: ${right}`,
      `--slide-pad-bottom: ${bottom}`,
      'padding: var(--slide-pad-top) var(--slide-pad-x) var(--slide-pad-bottom)',
    ];
  });
}

function rewriteFooterDeclaration(decl) {
  if (/^(left|right):\s*0$/.test(decl)) return `${decl.split(':')[0]}: var(--slide-pad-x)`;
  if (/^bottom:\s*0$/.test(decl)) return 'bottom: var(--slide-pad-bottom)';
  return decl;
}

function paginationDeclarations(fromSlide, base) {
  const decls = [
    `content: attr(data-marpit-pagination) ' / ' attr(data-marpit-pagination-total)`,
    ...fromSlide,
  ];
  if (base) {
    decls.push(
      'bottom: auto',
      'left: auto',
      'width: auto',
      'height: auto',
      'padding: 0',
      'pointer-events: none',
    );
  }
  return decls;
}

async function fontFaces() {
  const notoRoot = dirname(require.resolve(`${SLIDE_FONT_PACKAGE}/package.json`));
  const faces = [];
  for (const weight of SLIDE_FONT_WEIGHTS) {
    let css = await readFile(join(notoRoot, `${weight}.css`), 'utf8');
    css = css.replace(
      /src: url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\), url\(\.\/files\/[^)]+\) format\('woff'\)/g,
      `src: url('../node_modules/${SLIDE_FONT_PACKAGE}/files/$1') format('woff2')`,
    );
    if (css.includes("format('woff')"))
      throw new Error(`${SLIDE_FONT_PACKAGE} ${weight} still has woff`);
    faces.push(css.replaceAll('font-display: swap', 'font-display: block'));
  }
  const yakuRoot = dirname(require.resolve('yakuhanjp/package.json'));
  const yaku = await readFile(join(yakuRoot, 'dist/css/yakuhanjp.css'), 'utf8');
  const selected = yaku
    .split('@font-face')
    .slice(1)
    .filter((block) =>
      SLIDE_FONT_WEIGHTS.some((weight) => new RegExp(`font-weight:\\s*${weight}[;}]`).test(block)),
    );
  if (selected.length !== SLIDE_FONT_WEIGHTS.length) {
    throw new Error('YakuHanJP is missing a slide weight');
  }
  const yakuCss = selected
    .map((block) => {
      const face = `@font-face${block}`.replaceAll('font-display:swap', 'font-display: block');
      return face.replace(
        /url\(\.\.\/fonts\/([^)]+\.woff2)\)/g,
        "url('../node_modules/yakuhanjp/dist/fonts/$1')",
      );
    })
    .join('\n');
  return `${yakuCss}\n${faces.join('\n')}`;
}

function stripComments(css) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
      out += ' ';
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const end = endOfString(css, i);
      out += css.slice(i, end);
      i = end - 1;
      continue;
    }
    out += css[i];
  }
  return out;
}

function endOfString(css, start) {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === '\\') {
      i++;
      continue;
    }
    if (css[i] === quote) return i + 1;
  }
  return css.length;
}

function parseRules(css) {
  return parseList(css, 0, css.length).rules;
}

function parseList(css, start, end) {
  const rules = [];
  let i = start;
  while (i < end) {
    while (i < end && /\s/.test(css[i])) i++;
    if (i >= end) break;
    if (css[i] === '@') {
      i = skipAtRule(css, i, end);
      continue;
    }
    const selStart = i;
    let paren = 0;
    while (i < end) {
      if (css[i] === '"' || css[i] === "'") {
        i = endOfString(css, i);
        continue;
      }
      if (css[i] === '(') paren++;
      else if (css[i] === ')') paren--;
      else if (css[i] === '{' && paren === 0) break;
      i++;
    }
    const selector = css.slice(selStart, i).trim();
    if (!selector || css[i] !== '{')
      throw new Error(`CSS ルールを読めません: ${selector.slice(0, 80)}`);
    const body = balanced(css, i);
    rules.push({ selector, ...splitBody(body.inner) });
    i = body.next;
  }
  return { rules, next: i };
}

function balanced(css, open) {
  let depth = 1;
  let i = open + 1;
  const start = i;
  while (i < css.length && depth) {
    if (css[i] === '"' || css[i] === "'") {
      i = endOfString(css, i);
      continue;
    }
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    if (depth) i++;
  }
  return { inner: css.slice(start, i), next: i + 1 };
}

function splitBody(inner) {
  const declarations = [];
  const children = [];
  let i = 0;
  let from = 0;
  let paren = 0;
  while (i < inner.length) {
    if (inner[i] === '"' || inner[i] === "'") {
      i = endOfString(inner, i);
      continue;
    }
    if (inner[i] === '(') paren++;
    else if (inner[i] === ')') paren--;
    else if (inner[i] === ';' && paren === 0) {
      const decl = inner.slice(from, i).trim();
      if (decl) declarations.push(decl.replace(/\s+/g, ' '));
      from = i + 1;
    } else if (inner[i] === '{' && paren === 0) {
      const selector = inner.slice(from, i).trim();
      const body = balanced(inner, i);
      children.push({ selector, ...splitBody(body.inner) });
      i = body.next;
      from = i;
      continue;
    }
    i++;
  }
  const tail = inner.slice(from).trim();
  if (tail) declarations.push(tail.replace(/\s+/g, ' '));
  return { declarations, children };
}

function skipAtRule(css, start, end) {
  let i = start;
  let paren = 0;
  while (i < end) {
    if (css[i] === '"' || css[i] === "'") {
      i = endOfString(css, i);
      continue;
    }
    if (css[i] === '(') paren++;
    else if (css[i] === ')') paren--;
    else if (css[i] === ';' && paren === 0) return i + 1;
    else if (css[i] === '{' && paren === 0) return balanced(css, i).next;
    i++;
  }
  return i;
}

function render(rule, indent) {
  const pad = '  '.repeat(indent);
  const lines = [
    ...rule.declarations.map((decl) => `${pad}  ${decl};`),
    ...rule.children.map((child) => render(child, indent + 1)).filter(Boolean),
  ];
  if (!lines.length) return '';
  return `${pad}${rule.selector} {\n${lines.join('\n')}\n${pad}}`;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = await writeMarpTheme();
  console.log(`Built ${path}`);
}
