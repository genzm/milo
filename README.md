# milo

Markdown から、オフラインで開ける単一 HTML のスライドを作ります。

## 使い方

Node.js v22 以降で次を実行します。

```sh
npm ci
npx milo talk.md
```

`<パス>` は `.md` か、`slides.md` を含むディレクトリです。同じ場所の `models/` にある JSONC も取り込まれます。出力は Markdown と同じ場所の `<名前>.html` で、`-o` で変更できます。

```sh
npx milo content -o dist/milo.html
```

生成した HTML をデスクトップ版 Chrome または Edge で開きます。右上の「自動保存を接続」で、その HTML を選んで書き込みを許可してください。右側の原稿を編集すると、入力が止まって約 500ms 後に保存します。入力中も約 2 秒ごとに保存を試みます。`Cmd+S` / `Ctrl+S` は即時保存です。閉じる前に「保存済み」を確認してください。

## 原稿

先頭の frontmatter にタイトル、各スライド先頭のコメントにレイアウトを書きます。レイアウトは `cover`、`section`、`lab`、`media`、`essay` です。

````markdown
---
title: 小さな実験室
description: 数式と図の実験
---

```milo:model wave
{
  "input": "t",
  "parameters": { "gamma": 0.2 },
  "expression": "exp(-gamma * t)"
}
```

<!-- milo: layout=cover -->

# 表紙

---

<!-- milo: layout=lab -->

減衰率は **{{wave.gamma}}**。

::plot{model="wave" from="0" to="10"}

---

<!-- milo: layout=media -->

![図](./assets/flow.gif)
````

## 記法

- `**太字**` は本文色、`==語句==` はアクセント色です。
- `@impact` から `@endimpact` は、短いメッセージを大きく表示します。
- 見出しと段落の末尾に `@align=center` または `@align=right` を付けると、その行を揃えます。省略時は左寄せです。
- 箇条書きの `[ ]` と `[x]` は、クリックできるチェック項目です。状態は原稿に保存されます。
- `@columns` の中に `@column` を置くと、等幅の列になります。
- `@box tone=accent` は、囲んだ Markdown をボックスにします。`tone` は `accent`、`default`、`muted`、`dark` です。
- `@canvas` は、`-->` で区切ったまとまりを矢印でつなぎます。分岐するときは `@node` と `@edge` を使います。

## 見た目

文字サイズ、余白、色は `src/styles/tokens.css` です。スライドの寸法は `src/slide-size.json` の 1600×900 です。

```css
--slide-text-body: 30px;
--slide-leading-body: 1.55;
```

`npm run build` で単一 HTML と Marp テーマを再生成します。`marp/milo.css` は生成物なので、直接編集しません。

ビルドは `cli/build.mjs` でまとめて実行し、CSSとフォント定義を両方の出力で共有します。フォント処理は `cli/fonts.mjs` にあります。
