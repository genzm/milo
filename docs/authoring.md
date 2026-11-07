# 原稿の書き方

入力は Markdown ファイル、またはそれを含むディレクトリです。ディレクトリを渡したときは `slides.md` を使い、それが無ければ `.md` が1つだけのときだけそれを使います。

スライドの区切りは、行頭の `---` です。`@box`、`@diagram`、`@canvas`、`@compose` などのブロック内にある `---` は区切りになりません。空のスライドはエラーです。コードフェンスの中の `@end…` は、ブロックの終わりとして扱いません。

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
| `cover` | 内側にアクセント色の面。文字は白 |
| `section` | 面全体がアクセント色の章扉。見出しの左に白い棒。文字は白 |
| `lab` | 通常のスライド。指定が無いときの既定 |
| `media` | 画像の高さを抑える |
| `essay` | 見出しを小さくした文章向け。本文の大きさは `lab` と同じ |

## 本文

Markdown の見出し、段落、箇条書き、引用、コード、リンクが使えます。生の HTML は描画しません。リンクは新しいタブで開きます。

- 数式は `$E = mc^2$`（文中）か、独立した行の `$$` … `$$` です。KaTeX が描きます。グラフは画像として貼ります。
- `**太字**` は本文色、`==語句==` はアクセント色です。`++下線++` は下線です。
- 見出しと段落の末尾に `@align=center` または `@align=right` を付けると、その行を揃えます。省略時は左寄せです。
- 末尾の `@mark` は、その行全体をマーカー色で塗ります。`@align` と同時に書けます。
- 箇条書きの `[ ]` と `[x]` は、クリックできるチェック項目です。状態は原稿の `[ ]` / `[x]` として保存されます。

```markdown
# 見出し @align=center

短い結論は ==ここ== です。

拡散モデル最高！ @mark

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

独立した行の `::image` でも同じ素材を出せます。設定は `名前="値"` です。`asset` がパス、`alt` が代替文、`caption` がキャプションです。編集画面でこの画像をダブルクリックすると、素材タブが開きます。

```markdown
::image{asset="./assets/flow.gif" alt="図" caption="キャプション"}
```

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

## 解説矢印と否定の×

`@compose` の中に `@part` で図・ボックス・文章・画像をまとめ、`@arrow` で結び、`@cross` で×を重ねます。対象の名前を指定するため、位置の変更に追従します。大きな矢印、2つのflowの比較、図の外の深さと広さ、ノードから説明ボックスへの接続は [解説矢印と否定の×](annotations.md) を参照してください。

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
| `height` | 数値、または flow での `auto`。flow の省略と `auto` は内容に合わせて伸びる。`free` の既定は 420 |
| `gap` | ノード間隔。0 以上。既定は 48 |

`route=auto` は、直列を直線にし、分岐と合流を共有幹線付きの直交線にします。横に収まらないときは `direction=down` を書きます。循環は戻り線になります。表示する警告は、重なり、文字切れ、領域超過、線の横断、ラベルの衝突、余白不足です。

`layout=free` の `height` は数値です。`height=auto` は使えません。ノードの位置は `x` `y`、または `frame=x,y,width,height` です。`dx` `dy` は流れ配置のあとに足すずれで、`pinned=true` はその座標を固定します。

ノードの `shape` は `card` / `ellipse` / `diamond` です。既定は `card` です。`tone` は `default` / `accent` / `muted` / `dark` です。`fill=none` は中の塗りだけ消して、輪郭は `tone` のまま残します。どの形にも付けられます。ID を省略すると `node-1` のように付きます。

辺は `@edge from --> to` です。`label`、`route`、`tone`（`default` / `accent` / `muted`）、`dashed=true`、`arrows`（`none` / `start` / `end` / `both`、既定は `end`）を付けられます。

属性の書き方は `名前`、`名前=値`、`名前="値"` です。行頭の `#id` も ID になります。

## ダイアグラム

`@diagram` は要素と関係を宣言し、配置だけ切り替えます。中に書けるのは `@item`、`@link`、`@zone`、`@cluster` です。`layout` は `ring` / `flow` / `radial` / `field` です。既定は `ring` です。`tree` と `free` は使えません。座標を1つずつ置くときは `@canvas` を使います。

既定の領域は、ring が 1000×500、flow が 1280×560、radial が 1040×580、field が 1280×580 です。`width` と `height` で変えられます。`note=outside` のとき、高さの下限は 620 です。`height=auto` は flow だけで使え、省略した高さも内容に合わせて伸びます。

`@panel` や `@column` の中の ring / radial は、`width` も `height` も無いとき 640×512 で置き、格子の枠に合わせて表示します。全画面用の横長フレームのままだと、円形の図が短辺だけで小さく見えるためです。文字も図の幅に合わせて縮みます。大きさを固定したいときは `width` と `height` を書きます。flow と field はこの自動サイズを使いません。

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

`gap=24` で間隔の希望値を指定し、`node-width=220` でノード幅を揃えられます。どちらも flow 専用です。省略時は従来の間隔48・幅の自動計算を使います。文字サイズを保ったまま2つの図を並べる例は [解説矢印](annotations.md) にあります。

### radial

最初の `@item` が中心です。`center=id` で変えられます。周囲の項目に `side`（`top` / `right` / `bottom` / `left`）と `distance`（`near` / `mid` / `far`）を付けると、中心からの方向と距離を宣言できます。どちらかを1つでも書くと、その宣言で周囲を置きます。書かなかった周囲の項目は、`start` と `order` に沿ってリング上に並びます。どちらも書かないときは、カード同士が重ならない半径に置き、領域に収まらないときは全体を縮小します。縮尺が読めないときは「文字が小さくて読めません」、同じ方向に収まらないときは「同じ方向のカードが重なっています」と出します。`connect` の既定は `none` です。`connect=cycle` は中心を除いた周囲を結びます。

```markdown
@diagram layout=radial
@item core title="中心"
@item near title="近い" side=right distance=near
@item far title="遠い" side=left distance=far
@enddiagram
```

### field

`-1` から `1` の意味座標です。各 `@item` に `x` と `y` が必要です。別名は x が `left` / `center` / `right`、y が `bottom` / `middle` / `center` / `top` です。y の `center` は `middle` と同じ 0 です。`guide=axes` で軸を描き、`x-low` `x-high` `y-low` `y-high` で端のラベルを付けます。

```markdown
@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"
@item a title="施策A" x=-0.7 y=0.6
@item b title="施策B" x=0.5 y=0.4 cluster=now
@enddiagram
```

`@zone id x="-1:0" y="0:1" label="領域"` は矩形の領域です。範囲は `min:max` です。`@cluster id title="今" tone=muted` と、項目の `cluster=now` で所属を表します。`tone` は `accent` / `muted` / `ink` / `soft` です。`@cluster` が無い所属も凡例に出ます。色は宣言が無ければ accent、muted、ink、soft の順です。`cluster-region=halo` で所属の輪を描きます。別の所属を飲み込む輪は描かず、領域超過として出します。

`shape` は `vertex` / `card` / `dot` です。既定は ring が `vertex`、field が `dot`、それ以外が `card` です。field の `card` は座標にカードを置き、タイトルはカードの中だけに出ます。
