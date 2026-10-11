import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Both outputs consume the same bundled CSS. No external imports remain in HTML.
export async function loadStyles() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/style.css', import.meta.url))],
    bundle: true,
    write: false,
    charset: 'utf8',
    supported: { nesting: true },
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}
