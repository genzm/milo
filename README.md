# milo

Markdown から、オフラインで開ける単一 HTML のスライドを作ります。

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

生成した HTML をデスクトップ版 Chrome または Edge で開きます。右上の「自動保存を接続」で、その HTML を選んで書き込みを許可してください。右側の原稿を編集すると、入力が止まって約 500ms 後に保存します。入力中も約 2 秒ごとに保存を試みます。`Cmd+S` / `Ctrl+S` は即時保存です。閉じる前に「保存済み」を確認してください。

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

先頭の frontmatter にタイトル、各スライド先頭のコメントにレイアウトを書きます。レイアウトは `cover`、`section`、`lab`、`media`、`essay` です。

```markdown
---
title: 小さな実験室
description: 数式と図の実験
---

<!-- milo: layout=cover -->

# 表紙

---

<!-- milo: layout=lab -->

数式は $E = mc^2$ のように書けます。

$$
f(t) = A e^{-\gamma t} \cos(\omega t)
$$

---

<!-- milo: layout=media -->

![図](./assets/flow.gif)
```

## 記法

- 数式は `$...$`（文中）か `$$...$$`（独立した行）で書けます。グラフは画像として貼り付けます。
- `**太字**` は本文色、`==語句==` はアクセント色です。
- `@impact` から `@endimpact` は、短いメッセージを大きく表示します。
- 見出しと段落の末尾に `@align=center` または `@align=right` を付けると、その行を揃えます。省略時は左寄せです。
- 箇条書きの `[ ]` と `[x]` は、クリックできるチェック項目です。状態は原稿に保存されます。
- `@columns` の中に `@column` を置くと、等幅の列になります。
- `@grid` は子要素を同じ高さの列に並べます。`columns=2` で列数を指定できます。
- `@stack` は子要素を縦に隙間を空けて重ねます。
- `@panel` と `@box` は角丸カードです。`tone` は `muted`（グレー）、`default`（白）、`accent`（ピンクの輪郭）、`dark` です。広い面は白とグレー、ピンクは強調に使います。
- `@steps highlight=2` は番号付きの横並びカードです。いまのステップだけピンクの輪郭になります。
- `@canvas` は、`-->` で区切ったまとまりを矢印でつなぎます。分岐するときは `@node` と `@edge` を使います。

```markdown
@steps highlight=2
@step title="考え方"
目的と制約
トレードオフ・決め方
@step title="3つのケース"
アプリ / セキュリティ / Runnerログ
@step title="まとめ"
全体像と持ち帰ってほしいこと
@endsteps
```

## 見た目

文字サイズ、余白、色は `src/styles/tokens.css` です。スライドの寸法は `src/slide-size.json` の 1600×900 です。

```css
--slide-text-body: 30px;
--slide-leading-body: 1.55;
--slide-radius: 24px;
```

`npm run build` で単一 HTML と Marp テーマを再生成します。`marp/milo.css` は生成物なので、直接編集しません。

ビルドは `cli/build.mjs` でまとめて実行し、CSSとフォント定義を両方の出力で共有します。フォント処理は `cli/fonts.mjs` にあります。
