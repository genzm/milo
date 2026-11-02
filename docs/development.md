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
| `cli/build.mjs` | 配布用 HTML と Marp テーマ |
| `cli/fonts.mjs` | スライド用フォントの埋め込みと Marp 向けの参照 |
| `src/render.ts` | Markdown とブロック記法 |
| `src/canvas.ts` | `@canvas` |
| `src/diagram.ts` | `@diagram` の構文と描画 |
| `src/flow/` | 流れ図の配置と経路 |
| `src/flow/geometry.ts` | 線と枠の衝突判定、座標・曲線のサンプリング |
| `src/flow/path.ts` | SVGパスとラベル位置、迂回経路の選択 |
| `src/flow/route.ts` / `route-free.ts` | 階層配置 / 自由配置の接続点と経路 |
| `src/svg.ts` | Canvas・Diagram共通のSVG要素生成 |
| `src/diagram/` | ring 以外の空間配置 |
| `src/app.ts` | 編集画面 |
| `src/save.ts` | 自動保存 |
| `src/drafts.ts` | ブラウザ内の下書き |
| `src/source.ts` | HTML 内ソースの読み書き |
| `src/styles/` | 見た目。入口は `src/style.css` |
| `src/styles/tokens.css` | 色、文字サイズ、余白 |
| `src/slide-size.json` | 1600×900。PDF のページ寸法もここ |
| `src/slide-layout.mjs` | レイアウト名の検査と書き換え |

文字サイズや色を変えるときは `src/styles/tokens.css` を編集し、`npm run build` で HTML と `marp/milo.css` を作り直します。`marp/milo.css` は直接編集しません。

新しいレイアウト名を足すときは、`src/slide-layout.mjs` の `LAYOUTS`、編集画面の選択、`src/styles/layouts.css`、Marp 側の取り込みを揃えます。

記法を足すときは `src/render.ts` にパーサを置き、対応するテストを `test/` に追加します。キャンバスとダイアグラムは、Markdown 本文を解釈する前に行単位で構造だけ読みます。コードフェンスの中は構造行にしません。

## テストの置き場所

`test/core.test.ts` と `test/render-blocks.test.ts` が記法、`test/canvas.test.ts` と `test/flow.test.ts` が流れ図、`test/diagram.test.ts` と `test/diagrams.test.ts` がダイアグラムです。CLI と PDF は `test/cli.test.mjs`、`test/pdf.test.mjs`、`test/build.test.mjs` です。ブラウザ上の描画は `test/flow-browser.test.mjs`、`test/diagram-browser.test.mjs`、`test/diagram-regressions-browser.test.mjs` です。

全体テストは現在のソースから一時ディレクトリに検証用 HTML を生成するため、`dist/milo.html` や事前のビルドには依存しません。図の接続・測定・配置の修正方針と回帰検証は [図の接続・配置の修正](diagram-layout-fixes.md) を参照してください。

サンプル原稿は `content/slides.md` と `marp/example.md` です。
