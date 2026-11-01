# 原稿の書き方

入力は Markdown ファイル、またはそれを含むディレクトリです。ディレクトリを渡したときは `slides.md` を使い、それが無ければ `.md` が1つだけのときだけそれを使います。

スライドの区切りは、行頭の `---` です。`@canvas` の内側にある `---` は区切りになりません。空のスライドはエラーです。コードフェンスの中の `@end…` は、ブロックの終わりとして扱いません。

## frontmatter

ファイル先頭の YAML です。`title` を省略すると、最初の `# 見出し`、それも無ければディレクトリ名を使います。`description` は HTML の説明文です。`documentId` は下書きの識別子で、省略時は `milo` です。

```markdown
---
title: 小さな実験室
description: 数式と図の実験
documentId: lab-notes
---
```

## レイアウト

各スライドの先頭コメントで指定します。省略時は `lab` です。

```markdown
<!-- milo: layout=cover -->
```

| 値 | 見た目 |
| --- | --- |
| `cover` | アクセント色の面に白文字の表紙 |
| `section` | 章扉。見出しの左に白い棒 |
| `lab` | 通常のスライド。指定が無いときの既定 |
| `media` | 画像の高さを抑える |
| `essay` | 本文を少し小さくする |

## 本文

Markdown の見出し、段落、箇条書き、引用、コード、リンクが使えます。生の HTML は描画しません。リンクは新しいタブで開きます。

- 数式は `$E = mc^2$`（文中）か、独立した行の `$$` … `$$` です。KaTeX が描きます。グラフは画像として貼ります。
- `**太字**` は本文色、`==語句==` はアクセント色です。`++下線++` は下線です。
- 見出しと段落の末尾に `@align=center` または `@align=right` を付けると、その行を揃えます。省略時は左寄せです。
- 箇条書きの `[ ]` と `[x]` は、クリックできるチェック項目です。状態は原稿の `[ ]` / `[x]` として保存されます。

```markdown
# 見出し @align=center

短い結論は ==ここ== です。

- [ ] まだ
- [x] 済んだ
```

## 画像

相対パスの画像は、コンパイル時に HTML へ埋め込みます。対応形式は GIF、PNG、JPEG、WebP、SVG です。文書の外を指すパスは拒否します。`http:` などのリモート URL は埋め込みません。

```markdown
![図](./assets/flow.gif)
![図](./assets/plot.png "キャプション")
```

`title` を書くとキャプションになります。GIF は HTML では動きます。PDF では印刷時の静止フレームです。

## ブロック

開始行と `@end名前` で囲みます。中は Markdown です。

### 強調とフッター

`@impact` は短い文を大きく出します。`@footer` はスライド下の注記です。

```markdown
@impact
持ち帰ってほしい一文
@endimpact

@footer
出典や補足
@endfooter
```

### 列とカード

`@columns` は等幅の列です。中は `@column` … `@endcolumn` を2つ以上置きます。

```markdown
@columns
@column
左
@endcolumn
@column
右
@endcolumn
@endcolumns
```

`@grid` は子要素を同じ高さの列に並べます。`columns` を省略すると子の数になります。`gap` はピクセルです。

`@stack` は子を縦に重ねます。`gap` を付けられます。

`@panel` と `@box` は角丸カードです。`tone` は `muted`（グレー）、`default`（白）、`accent`（ピンクの輪郭）、`dark` です。`@panel` の既定は `muted`、`@box` の既定は `default` です。広い面は白とグレー、ピンクは強調に使います。

```markdown
@grid columns=2
@panel tone=muted
考え
@endpanel
@box tone=accent
強調
@endbox
@endgrid
```

### ステップ

`@steps highlight=2` は番号付きの横並びカードです。`highlight` は 1 始まりで、その番号だけピンクの輪郭になります。`0` か省略で、どれも強調しません。各 `@step` には `title` が必要です。ステップ内の改行は、空行でなくても改行として描きます。

```markdown
@steps highlight=2
@step title="考え方"
目的と制約
@step title="3つのケース"
アプリ / セキュリティ / Runnerログ
@step title="まとめ"
全体像
@endsteps
```

## キャンバス

`@canvas` はノードを矢印でつなぎます。`-->` で区切った Markdown のまとまりは、書いた順に直列接続されます。分岐するときは `@node` と `@edge` を使います。

```markdown
@canvas direction=right
入力

-->

分析

-->

判断
@endcanvas
```

```markdown
@canvas layout=flow direction=down route=auto
@node start
入力
@node a
経路A
@node b
経路B
@node join
統合
@edge start --> a
@edge start --> b label="分岐"
@edge a --> join
@edge b --> join
@endcanvas
```

| 属性 | 値 |
| --- | --- |
| `layout` | `flow`（関係から配置。既定） / `free`（座標のまま） |
| `direction` | `right` / `left` / `down` / `up`。既定は `right` |
| `route` | `auto` / `curve` / `straight` / `elbow`。既定は `auto` |
| `width` | 幅。既定は 1000 |
| `height` | 数値、または flow での `auto`。省略と `auto` は内容に合わせて伸びる |
| `gap` | ノード間隔。0 以上 |

`route=auto` は、直列を直線にし、分岐と合流を共有幹線付きの直交線にします。横に収まらないときは `direction=down` を書きます。循環は戻り線になり、ノードを不規則に並べ直しません。はみ出しは警告として残します。

`layout=free` の `height` は数値です。`height=auto` は使えません。ノードの位置は `x` `y`、または `frame=x,y,width,height` です。`dx` `dy` は流れ配置のあとに足すずれで、`pinned=true` はその座標を固定します。

ノードの `shape` は `card` / `round` / `ellipse` / `diamond` / `plain` です。既定は `card` です。`tone` は `default` / `accent` / `muted` / `dark` です。ID を省略すると `node-1` のように付きます。

辺は `@edge from --> to` です。`label`、`route`、`tone`（`default` / `accent` / `muted`）、`dashed=true`、`arrows`（`none` / `start` / `end` / `both`、既定は `end`）を付けられます。

属性の書き方は `名前`、`名前=値`、`名前="値"` です。行頭の `#id` も ID になります。

## ダイアグラム

`@diagram` は要素と関係を宣言し、配置だけ切り替えます。中に書けるのは `@item`、`@link`、`@zone`、`@cluster` です。`layout` は `ring` / `flow` / `radial` / `field` です。既定は `ring` です。座標を1つずつ置くときは `@canvas` を使います。

各 `@item` には ID と `title` が必要です。タイトルのあとの行は説明です。

### ring

項目数に応じた正多角形です。`connect=cycle`（既定）で隣同士を結び、`connect=none` で線を消します。`start` は `top` / `right` / `bottom` / `left`、`order` は `ccw` / `cw` です。`badge` を省略すると 1 から付きます。

```markdown
@diagram layout=ring connect=cycle
@item access title="誰でも引ける" badge=1 level=high
@item speed title="速く引ける" badge=2 level=high
@item history title="遡って引ける" badge=3 level=low
@enddiagram
```

`level` は `high` / `medium` / `low` です。色はテーマが決めます。

`note=outside` は頂点を動かさず、枠なしの説明を外側に置き、細い矢印でつなぎます。`note` は `inline` / `outside` / `none` で、項目ごとにも書けます。`note-side` は `auto` / `top` / `right` / `bottom` / `left`、`note-style` は `plain` / `caption`、`note-link` は `none` / `leader` / `arrow` です。`outside` のとき `note-link` の既定は `arrow` です。

```markdown
@diagram layout=ring connect=none note=outside
@item clear title="明確" badge=1 level=high
具体的に話せる
@item concise title="簡潔" badge=2 level=high
重要点を短く話せる
@enddiagram
```

### flow

`@canvas` の flow と同じ高さ指定と `route` を使います。`height` の省略と `height=auto` は内容に合わせて伸びます。`height=auto` は flow だけで使えます。関係は `@link` で書きます。

```markdown
@diagram layout=flow direction=right route=auto
@item start title="入力"
@item a title="経路A"
@item b title="経路B"
@item join title="統合"
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram
```

`a -- b` は無方向、`a -> b` は方向、`a <-> b` は双方向です。`label="…"` を付けられます。

### radial

最初の `@item` が中心です。`center=id` で変えられます。周囲の項目に `side`（`top` / `right` / `bottom` / `left`）と `distance`（`near` / `mid` / `far`）を付けると、中心からの方向と距離を宣言できます。省略した項目はリング上に並びます。

```markdown
@diagram layout=radial
@item core title="中心"
@item near title="近い" side=right distance=near
@item far title="遠い" side=left distance=far
@enddiagram
```

### field

`-1` から `1` の意味座標です。各 `@item` に `x` と `y` が必要です。別名は x が `left` / `center` / `right`、y が `bottom` / `middle` / `top` です。`guide=axes` で軸を描き、`x-low` `x-high` `y-low` `y-high` で端のラベルを付けます。

```markdown
@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"
@item a title="施策A" x=-0.7 y=0.6
@item b title="施策B" x=0.5 y=0.4 cluster=now
@enddiagram
```

`@zone id x="-1:0" y="0:1" label="領域"` は矩形の領域です。範囲は `min:max` です。`@cluster id title="今" tone=muted` と、項目の `cluster=now` で所属を表します。`tone` は `accent` / `muted` / `ink` / `soft` です。`cluster-region=halo` で所属の輪を描きます。

`shape` は `vertex` / `card` / `dot` です。既定は ring が `vertex`、field が `dot`、それ以外が `card` です。
