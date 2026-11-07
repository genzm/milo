import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const FONT_PACKAGE = '@fontsource/noto-sans-jp';
export const FONT_WEIGHTS = [400, 600, 700];
const FONT_URL = /url\((?:['"])?([^)'"]+)(?:['"])?\)/g;

// Read and normalize font CSS once. Output adapters only change the font URLs.
export async function loadSlideFonts() {
  const notoRoot = dirname(require.resolve(`${FONT_PACKAGE}/package.json`));
  const [notoInfo, license, faces] = await Promise.all([
    readFile(join(notoRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(notoRoot, 'LICENSE'), 'utf8'),
    Promise.all(FONT_WEIGHTS.map((weight) => readFile(join(notoRoot, `${weight}.css`), 'utf8'))),
  ]);
  if (license.includes('*/') || /<\/style/i.test(license)) {
    throw new Error('Noto Sans JP license cannot be embedded in a style comment');
  }
  const normalize = (css) =>
    css
      .replace(/, url\([^)]+\) format\('woff'\)/g, '')
      .replace(/font-display:\s*swap/g, 'font-display: block');
  return [
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
    notice: fonts.map((font) => font.notice).join(''),
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
