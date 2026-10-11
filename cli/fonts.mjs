import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const FONT_PACKAGE = '@fontsource/noto-sans-jp';
const FONT_WEIGHTS = [400, 800];
const FONT_URL = /url\((?:['"])?([^)'"]+)(?:['"])?\)/g;

// Read and normalize font CSS once. Output adapters only change the font URLs.
export async function loadSlideFonts() {
  const notoRoot = dirname(require.resolve(`${FONT_PACKAGE}/package.json`));
  const yakuRoot = dirname(require.resolve('yakuhanjp/package.json'));
  const [notoInfo, license, faces, yakuInfo, yakuSource] = await Promise.all([
    readFile(join(notoRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(notoRoot, 'LICENSE'), 'utf8'),
    Promise.all(FONT_WEIGHTS.map((weight) => readFile(join(notoRoot, `${weight}.css`), 'utf8'))),
    readFile(join(yakuRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(yakuRoot, 'dist/css/yakuhanjp.css'), 'utf8'),
  ]);
  if (license.includes('*/') || /<\/style/i.test(license)) {
    throw new Error('Noto Sans JP license cannot be embedded in a style comment');
  }
  if (yakuSource.includes('</style') || !/url\([^)]+\.woff2\)/.test(yakuSource)) {
    throw new Error('YakuHanJP stylesheet is missing its font files');
  }
  const [header, ...blocks] = yakuSource.split('@font-face');
  const selected = blocks.filter((block) =>
    FONT_WEIGHTS.some((weight) => new RegExp(`font-weight:\\s*${weight}[;}]`).test(block)),
  );
  if (selected.length !== FONT_WEIGHTS.length)
    throw new Error('YakuHanJP is missing a slide weight');
  const normalize = (css) =>
    css
      .replace(/, url\([^)]+\) format\('woff'\)/g, '')
      .replace(/font-display:\s*swap/g, 'font-display: block');
  return [
    {
      css: normalize(selected.map((block) => `@font-face${block}`).join('')),
      header,
      root: join(yakuRoot, 'dist/css'),
      notice: `${yakuInfo.name} ${yakuInfo.version}\n${'='.repeat(60)}\nYaku Han JP by Qrac (QRANOKO)\nLicense: ${yakuInfo.license}\n${yakuInfo.homepage}\nGothic punctuation is based on Noto Sans JP, licensed under the SIL Open Font License 1.1.\nThe published package does not include a separate license file.\n\n`,
    },
    {
      css: faces.map(normalize).join('\n'),
      header: `/* Noto Sans JP\n${license.trim()}\n*/\n`,
      root: notoRoot,
      notice: `${notoInfo.name} ${notoInfo.version}\n${'='.repeat(60)}\n${license.trim()}\n\n`,
    },
  ];
}

export async function embedSlideFonts(fonts) {
  const css = await Promise.all(
    fonts.map(async (font) => {
      const files = [...new Set([...font.css.matchAll(FONT_URL)].map((match) => match[1]))];
      const data = new Map(
        await Promise.all(
          files.map(async (file) => {
            if (!file.endsWith('.woff2')) throw new Error(`Unexpected font format: ${file}`);
            const bytes = await readFile(join(font.root, file));
            return [file, bytes.toString('base64')];
          }),
        ),
      );
      return `${font.header}${font.css.replace(FONT_URL, (_, file) => `url(data:font/woff2;base64,${data.get(file)})`)}\n`;
    }),
  );
  return {
    css: css.join(''),
    notice: [...fonts]
      .reverse()
      .map((font) => font.notice)
      .join(''),
  };
}

export function linkedSlideFonts(fonts, outputDir) {
  return fonts
    .map((font) =>
      font.css.replace(
        FONT_URL,
        (_, file) => `url('${relative(outputDir, join(font.root, file)).replaceAll('\\', '/')}')`,
      ),
    )
    .join('\n');
}
