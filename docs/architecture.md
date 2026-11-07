# 構造

milo は原稿を単一 HTML にコンパイルし、その HTML が自分の原稿を編集して同じファイルへ書き戻します。描画結果ではなく、原稿のブロックが正本です。

## 単一 HTML

`cli/compile.mjs` の `renderHtml` が、次の並びでファイルを作ります。

1. **toolbox**。KaTeX の CSS、スライド用フォント、アプリの CSS、実行時スクリプト。文書の編集ではこの区画を変えません。
2. **document**。`<script type="application/x-milo-source">` のブロック。種類は `manifest`、`slide`、`asset` です。
3. 起動スクリプト。ソースを読み終わってから描画を始めます。

各ブロックの本文は `amp-lt-v1` です。`&` を `&amp;`、`<` を `&lt;`、NUL を `&#0;` にします。実装は `src/source-format.mjs` です。`src/source.ts` の `SourceStore` が HTML からブロックを読み、ID 重複や区画の欠損を拒否します。

`manifest` は JSONC で、文書の `title` を持ちます。スライドの順序は HTML 内の slide ブロックの物理順序です。スライド本文は、区切り前の Markdown そのものです。画像は `mime:` 行と本体を持つ asset ブロックで、GIF / PNG / JPEG / WebP は Base64、SVG はテキストです。

実行時は `meta name="milo" content="1"` と、設定・スライド・素材それぞれの終端コメント、`<!-- END MILO SOURCES -->` が揃ったファイルだけを milo 形式として開きます。

## コンパイル

`milo <パス>` は `cli/milo.mjs` から `compile` を呼びます。

1. `cli/document.mjs` が frontmatter を分け、トップレベルの `---` でスライドに割り、画像参照を集めます。ブロック構文は表示側と同じ `src/markdown/blocks.mjs` で解析します。ブロック内部の水平線は分割せず、コード中の画像ディレクティブは素材参照として扱いません。
2. 各スライドの `<!-- milo: … -->` を `src/slide-layout.mjs` が検査します。
3. 相対パスの画像を asset ブロックにします。同じファイルは1回だけ埋めます。
4. esbuild が `src/app.ts` を IIFE にまとめ、KaTeX と Noto Sans JP（400 / 600 / 700）を CSS へ埋めます。
5. HTML を書き出します。`--pdf` のときは、そのあと `cli/pdf.mjs` が別ランタイムで PDF を作ります。

PDF 用 HTML は編集 UI を含みません。`src/pdf-entry.ts` が全スライドを描き、Playwright の Chromium が `src/slide-size.json` の寸法で印刷します。外部リクエストは中断します。

`npm run build` は `cli/build.mjs` が `content` を `dist/milo.html` にし、同時に `marp/milo.css` を生成します。CSS は `cli/styles.mjs` が `src/style.css` から1つにまとめ、フォントは `cli/fonts.mjs`、テーマの変換は `cli/marp-theme.mjs` です。Marp テーマはスライドのタイポグラフィと `cover` / `section` / `media` / `essay` です。`lab` は通常スライドのスタイルそのものとして入ります。キャンバス、ダイアグラム、ステップ、カード、列、`@impact`、チェック項目は含めません。`marp/milo.css` は生成物です。

## 描画

`src/app.ts` が編集・保存・表示の操作をつなぎます。画面の骨組みは `src/app/shell.ts` です。`src/app/session.ts` が原稿・選択・比較基準を持ち、編集失敗時には原稿と選択を戻します。一覧は `src/app/navigation.ts`、原稿・素材・設定は `src/app/inspector.ts` です。

編集のあと、`src/app/updates.ts` はプレビューを約 220ms、ブラウザ内の下書きを約 150ms で予約します。ファイルへの自動保存は、その場で `src/save.ts` の `Autosaver` に渡します。停止して約 500ms、入力が続くときは最初の変更から約 2 秒です。

`src/render.ts` の `renderSlide` は、`src/markdown/slide.ts` で表示用 Markdown を準備し、`src/render/blocks.ts` でブロックを DOM に配置します。共通のブロック解析は `src/markdown/blocks.mjs`、属性は `src/markdown/attributes.mjs` です。入れ子の展開順序を維持し、再配置と後片付けは `src/render/lifecycle.ts` に登録します。

- 数式、`==アクセント==`、`++下線++`、行末の `@align`、チェック項目、Markdown 画像は `src/markdown/slide.ts`
- `@box` `@panel` `@grid` `@stack` `@columns` `@steps` `@impact` `@footer` の構文は `src/markdown/blocks.mjs`、DOM は `src/render/blocks.ts`
- `@canvas` は `src/canvas.ts`、`@diagram` の公開入口は `src/diagram.ts`
- `::image{asset="…"}` は `src/directives.ts`。ダブルクリックで素材を開くのはこの形式です

流れ図の配置は [流れ図](flow.md)、ring / radial / field は [図式](diagram.md) です。`@compose` の接続点は [解説矢印](annotations.md#接続点の計算) です。

## 保存

`src/save.ts` の `Autosaver` が File System Access API で、接続した HTML を読み書きします。書く前にファイルが基準と違うときは衝突にします。`src/drafts.ts` は、接続前の編集と衝突時の原稿をブラウザのキャッシュへ置きます。キャッシュのキーは HTML の `milo-id`（frontmatter の `documentId`）と、フラグメントを除いた文書 URL の組み合わせです。
