import { compile } from './cli/compile.mjs';

const { outPath, html, blocks } = await compile({
  input: 'content',
  out: 'dist/milo.html',
  writeNotices: true,
});
console.log(
  `Built ${outPath}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB; ${blocks.length} source blocks; all fonts embedded.`,
);
