#!/usr/bin/env node
import { buildReport, compile, loadDeck } from './compile.mjs';

const HELP = `milo — Markdown スライドを単一 HTML にコンパイルします。

使い方:
  milo <スライドのパス> [-o <出力.html>] [--pdf]
  milo check <スライドのパス> [--json] [--strict]
  milo check --rules [--json]

<path> は slides.md、別の .md ファイル、またはそれらを含むディレクトリです。
frontmatter・Markdown 画像を取り込みます。

オプション:
  -o, --out <file>   出力先 HTML（省略時は Markdown と同じ場所の <名前>.html）
      --notices      依存ライセンスを THIRD_PARTY_NOTICES.txt に書き出す
      --pdf          HTMLと同じ名前のPDFを同時出力（Chromiumの導入が必要）
  -h, --help         このヘルプ

check: 描画したスライドのはみ出し・折り返し・描画エラーを報告します（Chromiumの導入が必要）。
      --json         結果を JSON で出力する
      --strict       warning があっても終了コード 1 にする（既定は error のときだけ）
      --rules        検査の一覧を表示する
`;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function check(args) {
  let input;
  let json = false;
  let strict = false;
  let listRules = false;
  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP);
      return;
    }
    if (arg === '--json') json = true;
    else if (arg === '--strict') strict = true;
    else if (arg === '--rules') listRules = true;
    else if (arg.startsWith('-')) return fail(`不明なオプションです: ${arg}`);
    else if (input) return fail('スライドのパスは1つだけ指定してください。');
    else input = arg;
  }
  const { checkDeck, formatCatalog, formatJson, formatText, ruleCatalog } =
    await import('./check.mjs');
  if (listRules) {
    console.log(json ? JSON.stringify(ruleCatalog(), null, 2) : formatCatalog());
    return;
  }
  if (!input) return fail(HELP);
  try {
    const report = await checkDeck({ deck: await loadDeck(input) });
    console.log(json ? formatJson(report) : formatText(report));
    if (report.counts.error || (strict && report.counts.warning)) process.exitCode = 1;
  } catch (error) {
    // Agents read stdout; keep failures in the same JSON channel.
    if (json) console.log(JSON.stringify({ error: error.message }, null, 2));
    throw error;
  }
}

async function main(argv) {
  const args = argv.slice(2);
  if (args[0] === 'check') return check(args.slice(1));
  let input;
  let out;
  let writeNotices = false;
  let pdf = false;
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
    if (arg === '--pdf') {
      pdf = true;
      continue;
    }
    if (arg.startsWith('-')) return fail(`不明なオプションです: ${arg}`);
    if (input) return fail('スライドのパスは1つだけ指定してください。');
    input = arg;
  }
  if (!input) return fail(HELP);
  const result = await compile({ input, out, writeNotices });
  console.log(buildReport(result));
  if (pdf) {
    const { renderPdf, pdfOutputPath } = await import('./pdf.mjs');
    const path = await renderPdf({
      deck: result.deck,
      parts: result.parts,
      outPath: pdfOutputPath(result.outPath),
    });
    console.log(`Built ${path}`);
  }
}

try {
  await main(process.argv);
} catch (error) {
  fail(error.message);
}
