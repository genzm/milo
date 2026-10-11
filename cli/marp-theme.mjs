import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { loadBuildResources } from './resources.mjs';
import { linkedSlideFonts } from './fonts.mjs';
import size from '../src/slide-size.json' with { type: 'json' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

export async function compileMarpTheme(resources) {
  const sharedResources = resources ?? (await loadBuildResources());
  const style = sharedResources.styles;
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
  const fonts = linkedSlideFonts(sharedResources.fonts, dirname(themePath));
  const css = `/* @theme milo */
/*
  src/styles/ と src/slide-size.json、スライド用フォントから生成したファイルです。
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

export async function writeMarpTheme(resources) {
  const css = await compileMarpTheme(resources);
  await writeFile(themePath, css);
  return themePath;
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
    if (
      SLIDE_BOX.has(rule.selector) &&
      rule.declarations.some((decl) => decl.startsWith('padding:'))
    ) {
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
  // Include transitive dependencies, e.g. --paper -> --white.
  const available = new Map(rootVars.map((decl) => [decl.split(':')[0].trim(), decl]));
  for (const name of used) {
    if (defined.has(name)) continue;
    for (const match of (available.get(name) ?? '').matchAll(/var\((--[\w-]+)\)/g)) {
      used.add(match[1]);
    }
  }
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
      ...[
        ['--slide-pad-top', top],
        ['--slide-pad-x', right],
        ['--slide-pad-bottom', bottom],
      ]
        .filter(([name, value]) => value !== `var(${name})`)
        .map(([name, value]) => `${name}: ${value}`),
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
