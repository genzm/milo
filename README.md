# milo

一定以上の情報量がある発表を想定したMarkdownから、オフラインで開ける単一のエディタ機能付きHTMLのスライドを作るソフトです。
(情報量を絞ることが前提となるピッチトークなどはスコープ外です)

## 使い方

Node.js v22 以降で次を実行します。

```sh
npm ci
npm link
milo talk.md
```

`<パス>` は `.md` か、`slides.md` を含むディレクトリです。出力は Markdown と同じ場所の `<名前>.html` で、`-o` で変更できます。

```sh
milo content -o dist/milo.html
```

生成した HTML をデスクトップ版 Chrome または Edge で開きます。保存のしかたは [編集と発表](docs/editor.md#保存) です。

## PDFを同時出力

PDFを作る場合だけ、PlaywrightのChromiumを導入します。

```sh
npx playwright install chromium
milo content --pdf -o dist/slides.html
```

`dist/slides.html` と `dist/slides.pdf` を生成します。通常のHTML出力にはChromiumは不要です。
PDFはスライド1枚につき1ページで、寸法は `src/slide-size.json` に従います。
HTMLと同じレンダラー・CSS・フォントを使い、編集UIは含みません。

チェックリストは原稿の状態で表示します。
GIFは印刷時の静止フレームになります。PDFの基準はコンパイル時点のMarkdownで、
生成後にHTML内で編集した内容は反映されません。PDF出力に失敗した場合も、生成済みのHTMLは残ります。

## 原稿

先頭の frontmatter にタイトル、各スライド先頭のコメントにレイアウトを書きます。記法は [原稿の書き方](docs/authoring.md) です。

```markdown
---
title: 小さな実験室
---

<!-- milo: layout=cover -->

# 表紙
```

## 見た目

文字サイズ、余白、色は `src/styles/tokens.css`、寸法は `src/slide-size.json` です。再生成と、直す場所は [開発](docs/development.md) です。記法、編集、構造は [docs](docs/README.md) にあります。
