---
title: 分岐パターンテスト
description: flow / diagram の分岐・合流・スキップ線を目視と自動テストで確認する
documentId: flow-branch-patterns
---

<!-- milo: layout=cover -->

# 分岐パターンテスト

描画エンジン用。分岐・合流・スキップの形だけを並べる。

---

<!-- milo: layout=section -->

# 基本の分岐

---

<!-- milo: layout=lab -->
<!-- pattern: serial -->

# 直列

分岐のない基準。線は直線、ノードは一列。

@diagram layout=flow direction=right route=auto width=1240 gap=28 node-width=220
@item map title="節点A"
短い本文
@item dive title="節点B" level=high
少し長い本文を入れる
@item recon title="節点C"
短い本文
@link map -> dive
@link dive -> recon
@enddiagram

@footer
pattern: serial｜直列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: fanout-2 -->

# 1→2 の分岐（合流なし）

一つの節点から、枝が二つに分かれる。

@diagram layout=flow direction=right route=auto width=1240 gap=35 node-width=235
@item issue title="入口"
@item raw title="枝A"
@item oxid title="枝B" level=high
@link issue -> raw
@link issue -> oxid
@enddiagram

@footer
pattern: fanout-2｜2本のファンアウト
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: fanout-3 -->

# 1→3 の分岐（合流なし）

入口から枝を三つ並べる。親は中央の枝に揃う。

@diagram layout=flow direction=right route=auto width=1240 gap=35 node-width=235
@item taste title="入口"
@item raw title="枝A"
@item ferment title="枝B"
@item oxid title="枝C"
@link taste -> raw
@link taste -> ferment
@link taste -> oxid
@enddiagram

@footer
pattern: fanout-3｜3本のファンアウト
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: fanout-4 -->

# 1→4 の分岐（偶数）

子が偶数のとき、親は中央二つの間に来る。

@diagram layout=flow direction=right route=auto width=1240 gap=28 node-width=220
@item issue title="入口"
@item cost title="枝A"
@item time title="枝B"
@item quality title="枝C"
@item support title="枝D"
@link issue -> cost
@link issue -> time
@link issue -> quality
@link issue -> support
@enddiagram

@footer
pattern: fanout-4｜偶数ファンアウト
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: fanout-5 -->

# 1→5 の分岐（奇数）

子が多いときも、重ならず、親は真ん中の子と高さを揃える。

@diagram layout=flow direction=right route=auto width=1240 gap=24 node-width=210
@item core title="入口"
@item why title="枝A"
@item view title="枝B"
@item try title="枝C"
@item talk title="枝D"
@item read title="枝E"
@link core -> why
@link core -> view
@link core -> try
@link core -> talk
@link core -> read
@enddiagram

@footer
pattern: fanout-5｜奇数ファンアウト
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: diamond-2 -->

# ひし形の分岐合流

分岐したあと、同じ階層で合流する。

@diagram layout=flow direction=right route=auto width=1240 gap=28 node-width=220
@item start title="始点"
@item pathA title="経路A"
@item pathB title="経路B"
@item join title="合流" level=high
@link start -> pathA
@link start -> pathB
@link pathA -> join
@link pathB -> join
@enddiagram

@footer
pattern: diamond-2｜2本の分岐合流
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: diamond-3 -->

# 1→3→1 の分岐合流

三つに分かれて、一つに戻る。

@diagram layout=flow direction=right route=auto width=1240 gap=28 node-width=220
@item start title="始点"
@item a title="経路A"
@item b title="経路B"
@item c title="経路C"
@item join title="合流" level=high
@link start -> a
@link start -> b
@link start -> c
@link a -> join
@link b -> join
@link c -> join
@enddiagram

@footer
pattern: diamond-3｜3本の分岐合流
@endfooter

---

<!-- milo: layout=section -->

# 入れ子と深さの違い

---

<!-- milo: layout=lab -->
<!-- pattern: nested-tree -->

# 入れ子の木

広げたあと、さらに深さを足す。主経路は一直線。

@diagram layout=flow direction=right route=auto width=1250 gap=25 node-width=245
@item issue title="入口"
@item material title="枝A"
@item process title="枝B"
@item store title="枝C"
@item soy title="葉A1"
@item wheat title="葉A2"
@item salt title="葉A3"
@link issue -> material
@link issue -> process
@link issue -> store
@link material -> soy
@link material -> wheat
@link material -> salt
@enddiagram

@footer
pattern: nested-tree｜3本の下に、さらに3本
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: nested-uneven -->

# 非対称な入れ子

子の数も、カードの高さも揃っていない。中央の枝だけ親と揃え、その中央をさらに一段掘る。

@diagram layout=flow direction=right route=auto width=1280 gap=22 node-width=180
@item hub title="入口"
本文を長くして高さを変える
@item a title="枝A"
短い本文
@item b title="枝B"
短い本文
@item c title="枝C"
短い本文
@item a1 title="葉A1"
@item a2 title="葉A2"
少し長い本文を入れる
@item a3 title="葉A3"
@item b1 title="葉B1"
@item c1 title="葉C1"
@item a2x title="葉A2a"
@item a2y title="葉A2b" level=high
@item a2z title="葉A2c"
@link hub -> a
@link hub -> b
@link hub -> c
@link a -> a1
@link a -> a2
@link a -> a3
@link b -> b1
@link c -> c1
@link a2 -> a2x
@link a2 -> a2y
@link a2 -> a2z
@enddiagram

@footer
pattern: nested-uneven｜3/1/1 の中央を一段深く
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: uneven-depth -->

# 枝の深さが違う

片方だけ先まで分解する。浅い枝は途中で止まる。

@diagram layout=flow direction=right route=auto width=1250 gap=28 node-width=220
@item issue title="入口"
@item ui title="枝A"
@item price title="枝B"
@item click title="葉A1"
@item order title="葉A2" level=high
@link issue -> ui
@link issue -> price
@link ui -> click
@link ui -> order
@enddiagram

@footer
pattern: uneven-depth｜深さが違う木
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: dangling-branch -->

# 合流しない枝

分岐したあと、片方だけ先へ進む。もう片方は葉のまま。

@diagram layout=flow direction=right route=auto width=1240 gap=28 node-width=220
@item start title="始点"
@item enough title="枝A"
@item missing title="枝B"
@item kj title="葉B1" level=high
@link start -> enough
@link start -> missing
@link missing -> kj
@enddiagram

@footer
pattern: dangling-branch｜片方だけ先へ進む
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: late-merge -->

# 遅れて合流する if-else

片方の経路だけ段が増えてから合流する。着点では、複数親の DAG と同じ幹線にまとめる。

@diagram layout=flow direction=right route=auto width=1280 gap=28 node-width=210
@item start title="始点"
@item code title="経路A"
@item explain title="経路B"
@item run title="経路A2" level=high
@item join title="合流"
@link start -> code
@link start -> explain
@link code -> run
@link run -> join
@link explain -> join
@enddiagram

@footer
pattern: late-merge｜段数の違う合流も着点でファンイン
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: chained-diamonds -->

# ひし形を二段つなぐ

分岐→合流→また分岐→合流。循環は戻り線。

@diagram layout=flow direction=right route=auto width=1280 gap=24 node-width=190
@item in title="始点"
@item a1 title="経路A"
@item a2 title="経路B"
@item mid title="合流1"
@item b1 title="経路C"
@item b2 title="経路D"
@item out title="合流2" level=high
@link in -> a1
@link in -> a2
@link a1 -> mid
@link a2 -> mid
@link mid -> b1
@link mid -> b2
@link b1 -> out
@link b2 -> out
@enddiagram

@footer
pattern: chained-diamonds｜ひし形を二段
@endfooter

---

<!-- milo: layout=section -->

# スキップ・交差・複数親

---

<!-- milo: layout=lab -->
<!-- pattern: skip-edge -->

# 一段飛ばす線

A→B→C と A→C が同時にある。飛ばした線は始点の幹線から分かれ、迂回して着点の入り口で合流する。

@diagram layout=flow direction=right route=auto width=1240 gap=32 node-width=230
@item start title="始点"
@item cause title="中点"
@item act title="終点" level=high
@link start -> cause
@link cause -> act
@link start -> act
@enddiagram

@footer
pattern: skip-edge｜始点の幹線から分岐し、着点でファンイン
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: long-skip -->

# 二段飛ばす線

短い枝と、根から葉への長い辺が共存する。長い辺も始点の幹線から分かれ、着点の幹線へ入る。

@diagram layout=flow direction=right route=auto width=1280 gap=28 node-width=210
@item start title="始点"
@item mid title="中点"
@item leaf title="葉"
@item end title="終点" level=high
@link start -> mid
@link mid -> leaf
@link leaf -> end
@link start -> end
@enddiagram

@footer
pattern: long-skip｜二段飛ばしも始点の幹線から分岐し着点でファンイン
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: uncross -->

# 交差する指定をほどく

原稿では A→D、B→C でも、配置は交差を減らす。

@diagram layout=flow direction=right route=auto width=1240 gap=32 node-width=230
@item a title="始点A"
@item b title="始点B"
@item c title="終点C"
@item d title="終点D"
@link a -> d
@link b -> c
@enddiagram

@footer
pattern: uncross｜交差をほどく
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: multi-parent -->

# 複数の親を持つ DAG

二つの入口が、同じ結論へ入る。木ではない。

@diagram layout=flow direction=right route=auto width=1240 gap=32 node-width=230
@item observe title="親A"
@item ask title="親B"
@item cause title="合流" level=high
@item act title="先"
@link observe -> cause
@link ask -> cause
@link cause -> act
@enddiagram

@footer
pattern: multi-parent｜ファンインだけの合流
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: partial-merge -->

# 一部だけ合流する

三つに分け、二つは合流し、一つは別の葉へ進む。

@diagram layout=flow direction=right route=auto width=1280 gap=28 node-width=210
@item issue title="入口"
@item raw title="枝A"
@item ferment title="枝B"
@item oxid title="枝C" level=high
@item breed title="葉A"
@item pack title="葉C"
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@link raw -> breed
@link oxid -> pack
@enddiagram

@footer
pattern: partial-merge｜部分合流
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: sibling-link -->

# 兄弟同士をつなぐ

同じ段の候補同士を結ぶと、着点は一段後ろへ送られる。その線も始点の幹線から分かれる。

@diagram layout=flow direction=right route=auto width=1240 gap=32 node-width=230
@item issue title="入口"
@item raw title="枝A"
@item oxid title="枝B"
@item tension title="先" level=high
@link issue -> raw
@link issue -> oxid
@link raw -> oxid
@link oxid -> tension
@enddiagram

@footer
pattern: sibling-link｜兄弟辺は始点の幹線から分岐する
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: forest -->

# 二つの根（森）

独立した木を、同じ図に置く。

@diagram layout=flow direction=right route=auto width=1280 gap=28 node-width=210
@item why title="根A"
短い本文
@item how title="根B"
短い本文
@item media title="葉A1"
@item seo title="葉A2" level=high
@item hear title="葉B1"
@item scene title="葉B2"
@link why -> media
@link media -> seo
@link how -> hear
@link hear -> scene
@enddiagram

@footer
pattern: forest｜二つの根
@endfooter

---

<!-- milo: layout=section -->

# 循環・ラベル・向き

---

<!-- milo: layout=lab -->
<!-- pattern: diamond-loop allow=CYCLE_DETECTED -->

# 分岐合流に戻り線

ノードは並び直さず、循環は外側の戻り線にする。

@diagram layout=flow direction=right route=auto width=1280 gap=24 node-width=190
@item in title="始点"
@item a1 title="経路A"
@item a2 title="経路B"
@item mid title="合流1"
@item b1 title="経路C"
@item b2 title="経路D"
@item out title="合流2" level=high
@link in -> a1
@link in -> a2
@link a1 -> mid
@link a2 -> mid
@link mid -> b1
@link mid -> b2
@link b1 -> out
@link b2 -> out
@link out -> in label="戻り"
@enddiagram

@footer
pattern: diamond-loop｜循環は戻り線
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: labeled-fanout -->

# ラベル付きの分岐

枝ごとに短いラベルを書く。ラベル同士とカードが重ならない。

@diagram layout=flow direction=right route=auto width=1240 gap=36 node-width=230
@item start title="入口"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link start -> a label="ラベル1"
@link start -> b label="ラベル2"
@link start -> c label="ラベル3"
@enddiagram

@footer
pattern: labeled-fanout｜枝ラベル
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: mixed-links -->

# 向きの違う線

無方向・片方向・双方向を混ぜる。飛ばす線も始点の幹線から分かれる。

@diagram layout=flow direction=right route=auto width=1240 gap=32 node-width=230
@item problem title="始点"
@item cause title="中点"
@item action title="終点" level=high
@link problem -- cause
@link cause -> action label="ラベルA"
@link problem <-> action label="ラベルB"
@enddiagram

@footer
pattern: mixed-links｜向きの違う線も始点の幹線から分岐する
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: tree-down -->

# 縦方向の木

横に収まらないときは `direction=down`。

@diagram layout=flow direction=down route=auto width=900 gap=28 node-width=240
@item issue title="入口"
@item raw title="枝A"
@item ferment title="枝B"
@item oxid title="枝C" level=high
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@enddiagram

@footer
pattern: tree-down｜縦のファンアウト
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: diamond-down -->

# 縦方向のひし形

@diagram layout=flow direction=down route=auto width=900 gap=28 node-width=240
@item start title="始点"
@item a title="経路A"
@item b title="経路B"
@item join title="合流" level=high
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram

@footer
pattern: diamond-down｜縦の分岐合流
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: fanout-left -->

# 左向きの分岐

`direction=left` でも、幹線と揃いが崩れない。

@diagram layout=flow direction=left route=auto width=1240 gap=32 node-width=230
@item issue title="入口"
@item raw title="枝A"
@item ferment title="枝B"
@item oxid title="枝C" level=high
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@enddiagram

@footer
pattern: fanout-left｜左向き
@endfooter

---

<!-- milo: layout=section -->

# 組み合わせ

---

<!-- milo: layout=lab -->
<!-- pattern: compact-nested -->

# 狭い間隔の実寸

小さい `gap` と大きい `node-width`。

@diagram layout=flow direction=right width=1250 gap=25 node-width=245 route=auto
@item issue title="入口"
@item material title="枝A"
@item process title="枝B"
@item store title="枝C"
@item soy title="葉A1"
@item wheat title="葉A2"
@item salt title="葉A3"
@link issue -> material
@link issue -> process
@link issue -> store
@link material -> soy
@link material -> wheat
@link material -> salt
@enddiagram

@footer
pattern: compact-nested｜狭い間隔の入れ子
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: long-titles -->

# 長さの違う日本語タイトル

幅は変えすぎず、長い方だけ少し広げる。文字は小さくしない。

@diagram layout=flow direction=right route=auto width=1280 gap=28
@item issue title="短い題"
@item raw title="これは幅の差を出すための長い日本語タイトル"
@item ferment title="中くらいの題"
@item oxid title="もう一つ長めの題を置いてみる"
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@enddiagram

@footer
pattern: long-titles｜幅の自動計算
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-time -->

# 時間で、二つの図をつなぐ

それぞれの `@part` に独立した flow を置き、大きな矢印で結ぶ。

@compose gap=125 align=start height=355
@part now width=555
## 図1

@diagram layout=flow width=550 direction=right gap=20 node-width=205
@item issue title="入口"
@item raw title="枝A"
@item oxid title="枝B"
@link issue -> raw
@link issue -> oxid
@enddiagram
@endpart
@part future width=555
## 図2

@diagram layout=flow width=550 direction=right gap=20 node-width=205
@item issue title="入口"
@item oxid title="枝B"
@item diet title="枝C" level=high
@link issue -> oxid
@link issue -> diet
@enddiagram
@endpart
@arrow id=advance from=now to=future label="進む" size=65
@endcompose

@footer
pattern: compose-time｜二つの図をつなぐ
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-action -->

# 選んだ葉から、箱へ

`from=causes.oxid to=solution` で、図の中のノードと箱を結ぶ。

@compose gap=145 height=350
@part causes width=585
@diagram layout=flow width=570 direction=right node-width=235 gap=24
@item issue title="入口"
@item raw title="枝A"
@item oxid title="枝B" level=high
@link issue -> raw
@link issue -> oxid
@enddiagram
@endpart
@part solution width=330
@box tone=accent
- 項目1
- 項目2
@endbox
@endpart
@arrow id=action from=causes.oxid to=solution size=72
@endcompose

@footer
pattern: compose-action｜葉から箱へ
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-modes -->

# 二つの直列を切り替える

両向きの解説矢印。

@compose gap=120 align=start
@part scan width=520
## 図1

@diagram layout=flow width=520 direction=right gap=28 node-width=200
@item map title="節点A"
短い本文
@item dive title="節点B" level=high
少し長い本文を入れる
@link map -> dive
@enddiagram
@endpart
@part deep width=520
## 図2

@diagram layout=flow width=520 direction=right gap=28 node-width=200
@item def title="節点C"
短い本文
@item recon title="節点D" level=high
少し長い本文を入れる
@link def -> recon
@enddiagram
@endpart
@arrow id=mode from=scan to=deep label="切替" size=64 arrows=both
@endcompose

@footer
pattern: compose-modes｜二つの直列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: canvas-diamond -->

# canvas 記法の分岐合流

`@node` と `@edge` でも、同じ階層配置になる。

@canvas layout=flow direction=right route=auto
@node start
始点
@node a
経路A
@node b
経路B
@node join
合流
@edge start --> a
@edge start --> b label="分岐"
@edge a --> join
@edge b --> join
@endcanvas

@footer
pattern: canvas-diamond｜canvas 記法
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: route-compare -->

# 同じひし形を、route で比べる

`auto` は直線と共有幹線。`curve` は曲線。縦に置くと、狭い列にも収まる。

@grid columns=2 gap=20
@panel
### route=auto

@diagram layout=flow direction=down route=auto width=560 gap=24 node-width=200
@item start title="始点"
@item a title="経路A"
@item b title="経路B"
@item join title="合流"
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram
@endpanel
@panel
### route=curve

@diagram layout=flow direction=down route=curve width=560 gap=24 node-width=200
@item start title="始点"
@item a title="経路A"
@item b title="経路B"
@item join title="合流"
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram
@endpanel
@endgrid

@footer
pattern: route-compare｜auto と curve
@endfooter
