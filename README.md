# milo

Markdown からスライドの HTML をビルドします。
生成後の使用には外部 CDN やサーバーへの接続は不要です。

## 使い方

Node.js (v22以降) をインストールして以下を実行します。

```sh
npm ci
npx milo talk.md
```

原稿は1つの Markdown で書けます。先頭の frontmatter にタイトルを、各スライド先頭の `<!-- milo: layout=cover -->` にレイアウトを、`milo:model` フェンスに数式モデルを、`![](./assets/photo.png)` に画像を置きます。

````markdown
---
title: 小さな実験室
description: 数式と図の実験
---

```milo:model wave
{
  "input": "t",
  "parameters": { "gamma": 0.2, "omega": 3.0 },
  "expression": "exp(-gamma * t) * cos(omega * t)"
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

`<パス>` は `.md` ファイルか、`slides.md` を含むディレクトリです。同じ場所の `models/` に置いた JSONC も追加で取り込みます。

```sh
npx milo content -o dist/milo.html
```

省略時の出力は Markdown と同じディレクトリの `<名前>.html` です。`-o` で変更できます。

生成された HTML をデスクトップ版 Chrome または Edge で開きます。
右上の「自動保存を接続」を押し、いま開いた HTML を選んで書き込みを許可します。

右側の原稿とモデルを編集します。入力が落ち着いてから約500msで同じファイルへ保存します。入力を続けている間も、おおむね2秒ごとに保存を試みます。
閉じる前に「保存済み」を確認してください。ブラウザや設定によって、再度ファイル選択や許可が必要な場合があります。

`Cmd+S` / `Ctrl+S` はブラウザの「ページを保存」ではなく、miloの即時保存として動きます。
未接続なら保存先の接続を開始します。

## Emphasis

通常の太字は基本文字色、`==` で囲んだ語句はアクセント色で強調します。

```markdown
**黒字の太字強調**

==アクセント色の強調==
```

スライド内で最も大きく見せたい短いメッセージには `@impact` を使います。

```markdown
@impact
売上が 2.4倍に
@endimpact
```

## Align

見出しと段落は、末尾の指定で行を揃えます。省略したときは左寄せです。`@box`、`@column`、Canvas の node の中でも同じように指定できます。中央寄せと右寄せの見出しには、左のアクセントバーは付きません。

```markdown
# 中央の見出し @align=center

右寄せの一文。 @align=right

左寄せを明示する一文。 @align=left
```

## Task items

箇条書きの先頭に `[ ]` または `[x]` を置くと、クリック可能なチェック項目になります。クリックした状態はMarkdown原稿にも保存されます。

```markdown
- 通常の項目
- [ ] 未完了の項目
- [x] 完了した項目
```

## Columns

`@columns` は2つ以上のMarkdown領域を等幅で横に並べます。列数は `@column` の数から自動的に決まります。

```markdown
@columns
@column

### 左側

通常のMarkdownを書けます。

@endcolumn
@column

### 右側

- 箇条書き
- 数式 $x^2$

@endcolumn
@endcolumns
```

3列以上も同じように `@column` を追加します。列間には共通の縦線が表示されます。

## Box

`@box` は通常のMarkdownを囲んで、スライド内の独立したボックスとして表示します。

```markdown
@box tone=accent

### 注意

文章、**強調**、箇条書き、数式 $x^2$ を書けます。

@endbox
```

`tone` は `accent`（既定）、`default`、`muted`、`dark` に対応しています。BoxはCanvasのnode内でも利用できます。

## Canvas

`@canvas` はMarkdownで書いたHTML要素を配置し、その背面にSVGの矢印を描きます。単純な流れは、Markdownのまとまりを `-->` で区切るだけで作れます。

```markdown
@canvas direction=right

### 入力

通常の **Markdown** を書けます。

-->

### 処理

- 箇条書き
- 数式 $x^2$

-->

### 出力

画像やmiloディレクティブも利用できます。

@endcanvas
```

接続が分岐する図では、nodeにIDを付けてedgeを指定します。

```markdown
@canvas direction=down route=elbow

@node source tone=accent

### Source

入力データ

@node left shape=round

### A

@node right shape=round

### B

@edge source --> left label="yes"
@edge source --> right label="no" dashed=true

@endcanvas
```

`@canvas` はflowと高さの自動計算が既定です。必要な場合だけ数値の `height` で自動計算を上書きできます。

`layout=free` ではnodeの `x`、`y`、`width`、`height`、または `frame=x,y,width,height` を指定します。座標系の既定値は横1000、縦420です。flowでも `dx` / `dy` で自動配置後の位置を調整でき、`pinned x=... y=...` で特定のnodeだけを固定できます。

nodeの `shape` は `card`、`round`、`ellipse`、`diamond`、`plain`、edgeの `route` は `curve`、`straight`、`elbow` に対応しています。
