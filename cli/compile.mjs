import { build } from 'esbuild';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJSONC } from 'jsonc-parser';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const IMAGE_MIME = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\0/g, '&#0;');
const attrs = (s) => escape(s).replace(/"/g, '&quot;');
const sourceBlock = (b) => `<script
  type="application/x-milo-source"
  id="${b.id}"
  data-kind="${b.kind}"
  data-name="${attrs(b.name)}"
  data-codec="amp-lt-v1">
${escape(b.text)}
</script>`;

const groups = [
  ['manifest', 'DOCUMENT SETTINGS', 'MILO SETTINGS'],
  ['slide', 'SLIDES', 'MILO SLIDES'],
  ['model', 'MODELS', 'MILO MODELS'],
  ['component', 'COMPONENTS', 'MILO COMPONENTS'],
  ['asset', 'ASSETS / LARGE EMBEDDED DATA', 'MILO ASSETS'],
];

function parseJSONCFile(text, label) {
  const errors = [];
  const result = parseJSONC(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`${label} の JSONC を確認してください。`);
  return result;
}

function blockId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z][\w-]*$/.test(value)) {
    throw new Error(`${label} の ID が不正です: ${value}`);
  }
  return value;
}

function prefixedId(stem, kind) {
  const raw = stem.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const base = raw || kind;
  const id = base.startsWith(`${kind}-`) ? base : `${kind}-${base}`;
  return blockId(id.replace(/^[^a-zA-Z]+/, `${kind}-`), `${kind} ${stem}`);
}

async function pathKind(path) {
  try {
    return (await stat(path)).isDirectory() ? 'dir' : 'file';
  } catch {
    throw new Error(`パスが見つかりません: ${path}`);
  }
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function resolveDeck(inputPath) {
  const input = resolve(inputPath);
  const kind = await pathKind(input);
  if (kind === 'file') {
    if (!/\.md$/i.test(input))
      throw new Error('スライドは Markdown ファイルか、それを含むディレクトリを指定してください。');
    return { dir: dirname(input), slidesFile: input };
  }
  const named = join(input, 'slides.md');
  if (await readIfExists(named)) return { dir: input, slidesFile: named };
  const markdown = (await readdir(input)).filter((name) => /\.md$/i.test(name)).sort();
  if (markdown.length === 1) return { dir: input, slidesFile: join(input, markdown[0]) };
  if (markdown.length === 0) throw new Error(`Markdown が見つかりません: ${input}`);
  throw new Error(
    `${input} に複数の Markdown があります。ファイルを直接指定するか slides.md を置いてください。`,
  );
}

export function defaultOutPath(slidesFile) {
  return join(dirname(slidesFile), `${basename(slidesFile, extname(slidesFile))}.html`);
}

function splitSlides(markdown) {
  const texts = markdown
    .replace(/\r\n?/g, '\n')
    .split(/^---$/m)
    .map((text) => text.replace(/^\n+|\n+$/g, '') + '\n');
  if (texts.some((text) => !text.trim())) throw new Error('空のスライドがあります。');
  return texts;
}

async function loadModels(dir) {
  const root = join(dir, 'models');
  let names;
  try {
    names = (await readdir(root)).filter((name) => /\.jsonc?$/i.test(name)).sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const blocks = [];
  for (const name of names) {
    const text = await readFile(join(root, name), 'utf8');
    parseJSONCFile(text, name);
    const stem = basename(name, extname(name));
    blocks.push({ id: prefixedId(stem, 'model'), kind: 'model', name, text });
  }
  return blocks;
}

function wrapAsset(mime, body) {
  if (mime === 'image/svg+xml') return `mime: ${mime}\n\n${body}`;
  const base64 = Buffer.isBuffer(body)
    ? body.toString('base64')
    : Buffer.from(body).toString('base64');
  return `mime: ${mime}\n\n${base64.match(/.{1,76}/g).join('\n')}`;
}

async function loadAssets(dir, assetIds = {}) {
  const root = join(dir, 'assets');
  let names;
  try {
    names = (await readdir(root)).filter((name) => IMAGE_MIME[extname(name).toLowerCase()]).sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const blocks = [];
  for (const name of names) {
    const ext = extname(name).toLowerCase();
    const mime = IMAGE_MIME[ext];
    const bytes = await readFile(join(root, name));
    const text =
      mime === 'image/svg+xml' ? wrapAsset(mime, bytes.toString('utf8')) : wrapAsset(mime, bytes);
    const id = assetIds[name]
      ? blockId(assetIds[name], name)
      : prefixedId(basename(name, ext), 'asset');
    blocks.push({ id, kind: 'asset', name, text });
  }
  return blocks;
}

export async function loadDeck(inputPath) {
  const { dir, slidesFile } = await resolveDeck(inputPath);
  const deckText =
    (await readIfExists(join(dir, 'deck.jsonc'))) ?? (await readIfExists(join(dir, 'deck.json')));
  const deck = deckText ? parseJSONCFile(deckText, 'deck.jsonc') : {};
  if (deck && typeof deck !== 'object')
    throw new Error('deck.jsonc はオブジェクトにしてください。');

  const slideTexts = splitSlides(await readFile(slidesFile, 'utf8'));
  const slideIds = Array.isArray(deck.slideIds) ? deck.slideIds : null;
  if (slideIds && slideIds.length !== slideTexts.length) {
    throw new Error(
      `slideIds の数（${slideIds.length}）がスライド数（${slideTexts.length}）と一致しません。`,
    );
  }
  const slides = slideTexts.map((text, index) => {
    const id = slideIds
      ? blockId(slideIds[index], `slideIds[${index}]`)
      : `slide-${String(index + 1).padStart(2, '0')}`;
    return { id, kind: 'slide', name: `${basename(slidesFile)}#${index + 1}`, text };
  });

  const title =
    typeof deck.title === 'string' && deck.title.trim()
      ? deck.title.trim()
      : slideTexts[0].match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(dir);
  const layouts = deck.layouts && typeof deck.layouts === 'object' ? deck.layouts : {};
  const manifest = {
    id: 'manifest',
    kind: 'manifest',
    name: 'deck.jsonc',
    text: JSON.stringify({ title, layouts }, null, 2) + '\n',
  };

  const models = await loadModels(dir);
  const assets = await loadAssets(
    dir,
    deck.assetIds && typeof deck.assetIds === 'object' ? deck.assetIds : {},
  );
  return {
    dir,
    slidesFile,
    title,
    description:
      typeof deck.description === 'string'
        ? deck.description
        : '原稿・数式・動く図・編集道具を内蔵する、自己編集可能な単一HTML。',
    documentId: typeof deck.documentId === 'string' ? deck.documentId : 'milo',
    blocks: [manifest, ...slides, ...models, ...assets],
  };
}

let toolboxPromise = null;
async function toolbox() {
  if (toolboxPromise) return toolboxPromise;
  toolboxPromise = (async () => {
    const result = await build({
      absWorkingDir: packageRoot,
      entryPoints: [join(packageRoot, 'src/app.ts')],
      bundle: true,
      write: false,
      metafile: true,
      format: 'iife',
      target: 'es2022',
      charset: 'utf8',
      minify: true,
      legalComments: 'eof',
    });
    const runtime = result.outputFiles[0].text;
    if (/<\/script[\s>]/i.test(runtime)) throw new Error('Unsafe script terminator in runtime');
    const katexRoot = resolve(dirname(require.resolve('katex/package.json')), 'dist');
    let mathCSS = await readFile(resolve(katexRoot, 'katex.min.css'), 'utf8');
    const fonts = [...mathCSS.matchAll(/src:([^;}]+)/g)];
    for (const m of fonts) {
      const f = /url\((?:"|')?([^)'"\s]+\.woff2)(?:"|')?\)/.exec(m[1]);
      if (f) {
        const bytes = await readFile(resolve(katexRoot, f[1]));
        mathCSS = mathCSS.replace(
          m[0],
          `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")`,
        );
      }
    }
    if (/url\((?!data:)/.test(mathCSS)) throw new Error('Unembedded font dependency');
    const css = await readFile(join(packageRoot, 'src/style.css'), 'utf8');
    const packages = [
      ...new Set(
        Object.keys(result.metafile.inputs)
          .filter((p) => p.startsWith('node_modules/'))
          .map((p) => {
            const a = p.split('/');
            return a.slice(0, a[1].startsWith('@') ? 3 : 2).join('/');
          }),
      ),
    ].sort();
    let notices = 'Third-party software embedded in milo\n\n';
    for (const root of packages) {
      const abs = join(packageRoot, root);
      const info = JSON.parse(await readFile(join(abs, 'package.json'), 'utf8'));
      let license = '';
      for (const name of (await readdir(abs))
        .filter((n) => /^(?:licen[sc]e|copying)(?:[._-]|$)/i.test(n))
        .sort()) {
        try {
          license = await readFile(join(abs, name), 'utf8');
          break;
        } catch {}
      }
      if (!license) throw new Error(`Missing dependency license: ${root}`);
      notices += `${info.name} ${info.version}\n${'='.repeat(60)}\n${license}\n\n`;
    }
    return { runtime, mathCSS, css, notices };
  })();
  return toolboxPromise;
}

export function renderHtml(deck, toolboxParts) {
  const { runtime, mathCSS, css } = toolboxParts;
  const sources = groups
    .map(
      ([kind, title, marker]) => `<!-- ==================== ${title} ==================== -->

${deck.blocks
  .filter((b) => b.kind === kind)
  .map(sourceBlock)
  .join('\n\n')}

<!-- END ${marker} -->`,
    )
    .join('\n\n');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="milo" content="1">
<meta name="milo-id" content="${attrs(deck.documentId)}">
<meta name="milo-runtime" content="0.1.0">
<title>${escape(deck.title)} — milo</title>
<meta name="description" content="${attrs(deck.description)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23205746'/%3E%3Cpath d='M8 7h7v18H8zm10 0h6v18h-6z' fill='%23c7dd9b'/%3E%3C/svg%3E">

<!-- ========================================================================
     MILO TOOLBOX
     Generated by milo. Document edits leave this section unchanged.
     ======================================================================== -->
<!-- EMBEDDED DEPENDENCY: KaTeX CSS and WOFF2 fonts. Changed only on a runtime upgrade. -->
<style id="math-styles">${mathCSS}</style>
<!-- APPLICATION STYLE -->
<style id="app-styles">${css}</style>
<!-- APPLICATION RUNTIME: defined here, started after the document sources. -->
<script id="milo-runtime">globalThis.__bootMilo=()=>{
${runtime}
};</script>
<!-- END MILO TOOLBOX -->
</head>
<body>
<div id="app"></div>
<noscript>この文書を表示・編集するにはJavaScriptを有効にしてください。原稿はHTML内の MILO SOURCES にあります。</noscript>

<!-- ========================================================================
     MILO DOCUMENT
     Editable originals. These blocks, rather than rendered DOM, are saved.
     Codec amp-lt-v1: & becomes &amp;, < becomes &lt;, NUL becomes &#0;.
     ======================================================================== -->
${sources}

<!-- END MILO SOURCES -->
<!-- END MILO DOCUMENT -->

<!-- The toolbox starts only after every editable source block has been parsed. -->
<script id="milo-launcher">globalThis.__bootMilo();delete globalThis.__bootMilo;</script>
</body>
</html>
`;
}

export async function compile({ input, out, writeNotices = false } = {}) {
  if (!input) throw new Error('コンパイルするスライドのパスを指定してください。');
  const deck = await loadDeck(input);
  const parts = await toolbox();
  const html = renderHtml(deck, parts);
  const outPath = resolve(out || defaultOutPath(deck.slidesFile));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  if (writeNotices) await writeFile(join(packageRoot, 'THIRD_PARTY_NOTICES.txt'), parts.notices);
  return { outPath, html, blocks: deck.blocks };
}
