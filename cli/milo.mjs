#!/usr/bin/env node
import { compile } from './compile.mjs';

const HELP = `milo — Markdown スライドを単一 HTML にコンパイルします。

使い方:
  milo <スライドのパス> [-o <出力.html>]

<path> は slides.md、別の .md ファイル、またはそれらを含むディレクトリです。
同じディレクトリの deck.jsonc・models/・assets/ があれば取り込みます。

オプション:
  -o, --out <file>   出力先 HTML（省略時は Markdown と同じ場所の <名前>.html）
      --notices      依存ライセンスを THIRD_PARTY_NOTICES.txt に書き出す
  -h, --help         このヘルプ
`;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main(argv) {
  const args = argv.slice(2);
  let input;
  let out;
  let writeNotices = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP);
      return;
    }
    if (arg === '-o' || arg === '--out') {
      out = args[++i];
      if (!out) return fail('-o / --out のあとに出力パスが必要です。');
      continue;
    }
    if (arg === '--notices') {
      writeNotices = true;
      continue;
    }
    if (arg.startsWith('-')) return fail(`不明なオプションです: ${arg}`);
    if (input) return fail('スライドのパスは1つだけ指定してください。');
    input = arg;
  }
  if (!input) return fail(HELP);
  const result = await compile({ input, out, writeNotices });
  const size = Buffer.byteLength(result.html);
  console.log(
    `Built ${result.outPath}: ${(size / 1024).toFixed(0)} KiB; ${result.blocks.length} source blocks; all fonts embedded.`,
  );
}

await main(process.argv);
