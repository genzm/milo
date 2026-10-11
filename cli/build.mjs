import { compile } from './compile.mjs';
import { writeMarpTheme } from './marp-theme.mjs';
import { loadBuildResources } from './resources.mjs';

const resources = await loadBuildResources();
const deck = await compile({
  input: 'content',
  out: 'dist/milo.html',
  writeNotices: true,
  resources,
});
console.log(`Built ${deck.outPath}: ${(Buffer.byteLength(deck.html) / 1024).toFixed(0)} KiB`);
console.log(`Built ${await writeMarpTheme(resources)}`);
