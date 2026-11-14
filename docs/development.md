# 開発

Node.js v22 以降です。

```sh
npm ci
npm run build
npm test
npm run check
```

| コマンド | 内容 |
| --- | --- |
| `npm test` | `test/*.test.ts` と `test/*.test.mjs` |
| `npm run check` | `tsc --noEmit` |
| `npm run format` | Prettier。対象は `ts` / `mjs` / `css` |
| `npm run build` | `dist/milo.html`、`THIRD_PARTY_NOTICES.txt`、`marp/milo.css` |
| `npm run marp` | Marp テーマだけ再生成 |
| `npm link` | `milo` コマンドを使えるようにする |

`milo` のオプションは `milo --help` と同じで、`-o`、`--pdf`、`--notices` です。`--notices` は依存ライセンスを `THIRD_PARTY_NOTICES.txt` に書きます。PDF を作るときだけ `npx playwright install chromium` が必要です。

## どこを直すか

| 場所 | 役割 |
| --- | --- |
| `cli/milo.mjs` | コマンドライン |
| `cli/compile.mjs` | 原稿の読み込み、画像の埋め込み、単一 HTML |
| `cli/document.mjs` | frontmatter とスライド分割 |
| `cli/pdf.mjs` | PDF |
| `cli/build.mjs` | 配布用 HTML と Marp テーマの起動 |
| `cli/marp-theme.mjs` | Marp テーマの CSS |
| `cli/styles.mjs` | `src/style.css` を1つの CSS にまとめる |
| `cli/fonts.mjs` | スライド用フォントの埋め込みと Marp 向けの参照 |
| `src/escape.ts` | HTML エスケープ |
| `src/assets.ts` | 埋め込み画像の URL、参照解決、実行時の取り込み |
| `src/render.ts` | `renderSlide`。表示準備と DOM 配置をつなぐ |
| `src/render/context.ts` | 描画時の原稿・選択・Markdown 変換 |
| `src/render/image.ts` | `::image` の DOM |
| `src/markdown/slide.ts` | 数式、強調、下線、`@align`、チェック、Markdown 画像 |
| `src/markdown/blocks.mjs` | ブロック構文。CLI と表示で共有 |
| `src/markdown/attributes.mjs` | `名前=値` と行頭の `#id` |
| `src/render/blocks.ts` | ブロックの DOM |
| `src/render/lifecycle.ts` | 再配置と後片付け |
| `src/canvas.ts` | `@canvas` の公開入口 |
| `src/canvas/parse.ts` | `@canvas` の解析 |
| `src/canvas/layout.ts` | 高さ解決と free 配置。flow は流れ図へ委譲 |
| `src/canvas/mount.ts` | キャンバスの DOM と接続線 |
| `src/diagram.ts` | `@diagram` の公開 API |
| `src/diagram/parse.ts` | `@diagram` の解析 |
| `src/diagram/layout.ts` | ring / radial / field の振り分け。[図式の配置](diagram.md) |
| `src/diagram/layout-ring.ts` | ring |
| `src/diagram/layout-classic-radial.ts` | `side` も `distance` も無い radial |
| `src/diagram/layout-radial.ts` | `side` または `distance` がある radial |
| `src/diagram/layout-field.ts` | field、zone、cluster |
| `src/diagram/links.ts` | `connect=cycle` の辺と、輪郭への接続 |
| `src/diagram/to-canvas.ts` | `layout=flow` をキャンバスのシーンへ変換 |
| `src/diagram/mount.ts` | ダイアグラムの DOM。flow はキャンバスへ渡す |
| `src/diagram/measure.ts` | 枠線込みの実寸 |
| `src/flow/layout.ts` | 流れ図。手順は [流れ図の配置](flow.md) |
| `src/flow/align.ts` | `route=auto` の中央の枝を揃える |
| `src/flow/route.ts` / `route-free.ts` | 階層配置 / 自由配置の接続点と経路 |
| `src/flow/path.ts` | SVG パス、ラベル位置、迂回 |
| `src/flow/geometry.ts` | 線と枠の衝突、曲線のサンプリング |
| `src/svg.ts` | Canvas・Diagram 共通の SVG 要素 |
| `src/app.ts` | 操作の接続 |
| `src/app/shell.ts` | 編集画面の HTML |
| `src/app/session.ts` | 原稿、選択、開いたときとの比較 |
| `src/app/navigation.ts` | 一覧とページ送り |
| `src/app/inspector.ts` | 原稿、素材、設定 |
| `src/app/updates.ts` | プレビュー（約 220ms）と下書き（約 150ms）の予約 |
| `src/save.ts` | 自動保存。停止約 500ms、継続時は約 2 秒 |
| `src/drafts.ts` | ブラウザ内の下書き |
| `src/source.ts` | HTML 内ソースの読み書き |
| `src/styles/` | 見た目。入口は `src/style.css` |
| `src/styles/tokens.css` | 色、文字サイズ、余白 |
| `src/slide-size.json` | 1600×900。PDF のページ寸法もここ |
| `src/slide-layout.mjs` | レイアウト名の検査と書き換え |
| `src/slide-radius.ts` | box / panel / step / canvas の角。短い辺の `--slide-radius-ratio` |

文字サイズや色を変えるときは `src/styles/tokens.css` を編集し、`npm run build` で HTML と `marp/milo.css` を作り直します。`marp/milo.css` は直接編集しません。

新しいレイアウト名を足すときは、`src/slide-layout.mjs` の `LAYOUTS`、編集画面の選択、`src/styles/layouts.css`、Marp 側の取り込みを揃えます。

ブロック記法は `src/markdown/blocks.mjs` と `src/render/blocks.ts`、行内の記法は `src/markdown/slide.ts` に置きます。対応するテストは `test/` に追加します。キャンバスとダイアグラムは、Markdown 本文を解釈する前に行単位で構造だけ読みます。コードフェンスの中は構造行にしません。

## テストの置き場所

`test/core.test.ts` と `test/render-blocks.test.ts` が記法です。流れ図は `test/canvas.test.ts`、`test/flow.test.ts`、`test/flow-geometry.test.ts`、ブラウザでは `test/flow-browser.test.mjs` です。ダイアグラムは `test/diagram.test.ts`、`test/diagrams.test.ts`、`test/spatial.test.ts`、ブラウザでは `test/diagram-browser.test.mjs` と `test/diagram-regressions-browser.test.mjs` です。編集画面は `test/app.test.ts`、`test/session.test.ts`、`test/drafts.test.ts` です。CLI、PDF、ビルド、Marp、原稿分割、レイアウト名、素材は `test/cli.test.mjs`、`test/pdf.test.mjs`、`test/build.test.mjs`、`test/marp-theme.test.mjs`、`test/document.test.mjs`、`test/slide-layout.test.mjs`、`test/assets.test.ts`、`test/asset-refs.test.ts` です。

全体テストは現在のソースから一時ディレクトリに検証用 HTML を生成するため、`dist/milo.html` や事前のビルドには依存しません。

サンプル原稿は `content/slides.md` と `marp/example.md` です。

解説矢印と図の組み合わせは `test/composition.test.ts`、`test/composition-render.test.ts`、`test/composition-browser.test.mjs` で検証します。ブラウザテストは `examples/annotations.md` を使い、スライド内への収まり、拡縮・対象寸法変更時の接続、発表とPDFを確認します。向き・長さ・外側配置の網羅は `test/fixtures/annotation-arrows.md` と `test/annotation-arrows.test.ts`、ブラウザでは `test/annotation-arrows-browser.test.mjs` です。図式と分岐の配置パターンは `test/fixtures/diagram-patterns.md` と `test/fixtures/flow-branches.md`、対応する `test/diagram-patterns.test.ts` と `test/flow-branches.test.ts` です。
