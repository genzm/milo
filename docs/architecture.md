# 構造

milo は原稿を単一 HTML にコンパイルし、その HTML が自分の原稿を編集して同じファイルへ書き戻します。描画結果ではなく、原稿のブロックが正本です。

## 単一 HTML

`cli/compile.mjs` の `renderHtml` が、次の並びでファイルを作ります。

1. **toolbox**。KaTeX の CSS、スライド用フォント、アプリの CSS、実行時スクリプト。文書の編集ではこの区画を変えません。
2. **document**。`<script type="application/x-milo-source">` のブロック。種類は `manifest`、`slide`、`asset` です。
3. 起動スクリプト。ソースを読み終わってから描画を始めます。

各ブロックの本文は `amp-lt-v1` です。`&` を `&amp;`、`<` を `&lt;`、NUL を `&#0;` にします。実装は `src/source-format.mjs` です。`src/source.ts` の `SourceStore` が HTML からブロックを読み、ID 重複や区画の欠損を拒否します。

`manifest` は JSONC で、少なくとも `title` とスライド ID の並びを持ちます。スライド本文は、区切り前の Markdown そのものです。画像は `mime:` 行と本体を持つ asset ブロックで、GIF / PNG / JPEG / WebP は Base64、SVG はテキストです。

実行時は `meta name="milo" content="1"` と、設定・スライド・素材それぞれの終端コメント、`<!-- END MILO SOURCES -->` が揃ったファイルだけを milo 形式として開きます。

## コンパイル

`milo <パス>` は `cli/milo.mjs` から `compile` を呼びます。

1. `cli/document.mjs` が frontmatter を分け、`---` でスライドに割り、画像参照を集めます。
2. 各スライドの `<!-- milo: … -->` を `src/slide-layout.mjs` が検査します。
3. 相対パスの画像を asset ブロックにします。同じファイルは1回だけ埋めます。
4. esbuild が `src/app.ts` を IIFE にまとめ、KaTeX と Noto Sans JP、YakuHanJP を CSS へ埋めます。
5. HTML を書き出します。`--pdf` のときは、そのあと `cli/pdf.mjs` が別ランタイムで PDF を作ります。

PDF 用 HTML は編集 UI を含みません。`src/pdf-entry.ts` が全スライドを描き、Playwright の Chromium が `src/slide-size.json` の寸法で印刷します。外部リクエストは中断します。

`npm run build` は `cli/build.mjs` が `content` を `dist/milo.html` にし、同時に `marp/milo.css` を生成します。Marp テーマはスライドのタイポグラフィと `cover` / `section` / `media` / `essay` に限られ、キャンバス、ダイアグラム、ステップ、カードは含めません。`marp/milo.css` は生成物です。

## 描画

`src/app.ts` が画面を組み、表示中のスライドを `src/render.ts` の `renderSlide` に渡します。`renderSlide` は markdown-it に milo のブロックを足します。

- 数式、`==アクセント==`、`++下線++`、行末の `@align`
- `@box` `@panel` `@grid` `@stack` `@columns` `@steps` `@impact` `@footer`
- `@canvas` は `src/canvas.ts`、`@diagram` は `src/diagram.ts`
- `::image{asset="…"}` 形式の画像ディレクティブ

流れ図の配置は `src/flow/` です。順位づけ、整列、経路、寸法、警告を分けています。`route=auto` は直列を直線、分岐と合流を共有幹線にします。ダイアグラムの ring / radial / field は `src/diagram/` にあります。flow レイアウトのダイアグラムは、キャンバスと同じ流れ図を使います。

## 保存

`src/save.ts` の `Autosaver` が File System Access API で、接続した HTML を読み書きします。書く前にファイルが基準と違うときは衝突にします。`src/drafts.ts` は、接続前の編集と衝突時の原稿をブラウザのキャッシュへ置きます。キャッシュのキーは HTML の `milo-id`（frontmatter の `documentId`）です。
