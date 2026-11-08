---
title: 解説矢印パターンテスト
description: 片向き・両向き・長さ・向き・外側配置を目視と自動テストで確認する
documentId: annotation-arrows
---

<!-- milo: layout=cover -->

# 解説矢印パターンテスト

短い矢印も、長い矢印と同じ形のまま縮小する。菱形の両向きは使わない。

---

<!-- milo: layout=section -->

# 片向きの接続

---

<!-- milo: layout=lab -->

# 長い片向き

余白が十分なら、`size` が太さになる。

@compose gap=220 height=280
@part left width=260
@box tone=accent
### 入口
短い
@endbox
@endpart
@part right width=260
@box tone=dark
### 出口
短い
@endbox
@endpart
@arrow id=go from=left to=right size=88
@endcompose

@footer
pattern: end-wide
@endfooter

---

<!-- milo: layout=lab -->

# 中くらいの片向き

よく使う間隔。形は長い矢印と同じ。

@compose gap=120 height=280
@part left width=260
@box tone=accent
### 入口
短い
@endbox
@endpart
@part right width=260
@box tone=dark
### 出口
短い
@endbox
@endpart
@arrow id=go from=left to=right size=88
@endcompose

@footer
pattern: end-medium
@endfooter

---

<!-- milo: layout=lab -->

# 短い片向き

間隔が狭くても、太さだけが潰れて菱形にはならない。

@compose gap=64 height=280
@part left width=260
@box tone=accent
### 入口
短い
@endbox
@endpart
@part right width=260
@box tone=dark
### 出口
短い
@endbox
@endpart
@arrow id=go from=left to=right size=88
@endcompose

@footer
pattern: end-narrow
@endfooter

---

<!-- milo: layout=lab -->

# いちばん短い片向き

置ける最小に近い間隔でも、同じ形のまま縮小する。

@compose gap=48 height=280
@part left width=260
@box tone=accent
### 入口
短い
@endbox
@endpart
@part right width=260
@box tone=dark
### 出口
短い
@endbox
@endpart
@arrow id=go from=left to=right size=88
@endcompose

@footer
pattern: end-min
@endfooter

---

<!-- milo: layout=lab -->

# 左向き

`from` と `to` を入れ替えると、矢じりが左になる。

@compose gap=120 height=280
@part left width=260
@box tone=muted
### 戻る先
短い
@endbox
@endpart
@part right width=260
@box tone=accent
### 起点
短い
@endbox
@endpart
@arrow id=back from=right to=left size=72
@endcompose

@footer
pattern: end-left
@endfooter

---

<!-- milo: layout=section -->

# 両向きの接続

---

<!-- milo: layout=lab -->

# 長い両向き

軸は残り、両端が矢じり。

@compose gap=220 height=280
@part left width=260
@box tone=muted
### 側A
短い
@endbox
@endpart
@part right width=260
@box tone=accent
### 側B
短い
@endbox
@endpart
@arrow id=trade from=left to=right size=88 label="切替" arrows=both
@endcompose

@footer
pattern: both-wide
@endfooter

---

<!-- milo: layout=lab -->

# 中くらいの両向き

トレードオフでよく使う間隔。

@compose gap=120 height=280
@part left width=260
@box tone=muted
### 側A
短い
@endbox
@endpart
@part right width=260
@box tone=accent
### 側B
短い
@endbox
@endpart
@arrow id=trade from=left to=right size=88 label="切替" arrows=both
@endcompose

@footer
pattern: both-medium
@endfooter

---

<!-- milo: layout=lab -->

# 短い両向き

短くしても菱形や山形にはしない。小さい両向きのブロック矢印になる。

@compose gap=64 height=280
@part left width=260
@box tone=muted
### 側A
短い
@endbox
@endpart
@part right width=260
@box tone=accent
### 側B
短い
@endbox
@endpart
@arrow id=trade from=left to=right size=88 label="切替" arrows=both
@endcompose

@footer
pattern: both-narrow
@endfooter

---

<!-- milo: layout=lab -->

# いちばん短い両向き

置ける最小に近い間隔でも、軸が残る。

@compose gap=48 height=280
@part left width=260
@box tone=muted
### 側A
短い
@endbox
@endpart
@part right width=260
@box tone=accent
### 側B
短い
@endbox
@endpart
@arrow id=trade from=left to=right size=88 label="切替" arrows=both
@endcompose

@footer
pattern: both-min
@endfooter

---

<!-- milo: layout=lab -->

# 列の途中の両向き

細い片向きと、短い両向きが混ざる並び。両向きだけ太く潰さない。

@compose gap=72 height=240
@part scan width=240
@box
### 構造を見る
見出し
@endbox
@endpart
@part pick width=240
@box tone=accent
### 必要な箇所
関連箇所
@endbox
@endpart
@part lock width=240
@box
### 定義を固定
曖昧な語
@endbox
@endpart
@part say width=240
@box tone=accent
### 説明を再構成
自分の言葉
@endbox
@endpart
@arrow id=into from=scan to=pick size=88
@arrow id=switch from=pick to=lock size=88 label="切替" arrows=both
@arrow id=out from=lock to=say size=88
@endcompose

@footer
pattern: row-switch
@endfooter

---

<!-- milo: layout=section -->

# 縦方向

---

<!-- milo: layout=lab -->

# 下向き

`layout=column` の片向き。

@compose layout=column gap=120 height=520
@part top width=320
@box tone=accent
### 上
短い
@endbox
@endpart
@part bottom width=320
@box tone=muted
### 下
短い
@endbox
@endpart
@arrow id=down from=top to=bottom size=72
@endcompose

@footer
pattern: column-end
@endfooter

---

<!-- milo: layout=lab -->

# 縦の両向き

上下どちらにも矢じり。

@compose layout=column gap=96 height=520
@part top width=320
@box tone=muted
### 側A
短い
@endbox
@endpart
@part bottom width=320
@box tone=accent
### 側B
短い
@endbox
@endpart
@arrow id=trade from=top to=bottom size=88 label="切替" arrows=both
@endcompose

@footer
pattern: column-both
@endfooter

---

<!-- milo: layout=lab -->

# 上向き

下のまとまりから上へ結ぶ。

@compose layout=column gap=96 height=520
@part top width=320
@box tone=muted
### 戻る先
短い
@endbox
@endpart
@part bottom width=320
@box tone=accent
### 起点
短い
@endbox
@endpart
@arrow id=up from=bottom to=top size=72
@endcompose

@footer
pattern: column-up
@endfooter

---

<!-- milo: layout=lab -->

# 短い下向き

縦の間隔が狭くても、同じ形のまま縮小する。

@compose layout=column gap=56 height=420
@part top width=320
@box tone=accent
### 上
短い
@endbox
@endpart
@part bottom width=320
@box tone=muted
### 下
短い
@endbox
@endpart
@arrow id=down from=top to=bottom size=88
@endcompose

@footer
pattern: column-narrow
@endfooter

---

<!-- milo: layout=section -->

# 対象の外側

---

<!-- milo: layout=lab -->

# 四辺

`target` と `side` で、一つの枠の外側に平行な矢印を置く。

@compose height=420
@part box width=420
@box tone=accent
### 対象
四辺に矢印
@endbox
@endpart
@arrow id=top target=box side=top size=72 label="上"
@arrow id=right target=box side=right size=72 label="右"
@arrow id=bottom target=box side=bottom size=72 label="下"
@arrow id=left target=box side=left size=72 label="左"
@endcompose

@footer
pattern: target-sides
@endfooter

---

<!-- milo: layout=lab -->

# 外側の反転

`direction` で矢じりの向きを反転する。

@compose height=360
@part box width=480
@box tone=muted
### 対象
向きを反転
@endbox
@endpart
@arrow id=leftward target=box side=top direction=left size=64 label="左へ"
@arrow id=upward target=box side=right direction=up size=64 label="上へ"
@endcompose

@footer
pattern: target-reverse
@endfooter

---

<!-- milo: layout=lab -->

# 長さで大きさが決まる

同じ `size` でも、横幅が短い枠の矢印は小さく、長い枠は大きくなる。

@compose gap=48 height=280
@part short width=120
@box tone=accent
### 短
@endbox
@endpart
@part mid width=280
@box tone=accent
### 中
@endbox
@endpart
@part long width=520
@box tone=accent
### 長
@endbox
@endpart
@arrow id=scale-short target=short side=top size=88 label="短"
@arrow id=scale-mid target=mid side=top size=88 label="中"
@arrow id=scale-long target=long side=top size=88 label="長"
@endcompose

@footer
pattern: length-scale
@endfooter

---

<!-- milo: layout=lab -->

# 両向きも長さに従う

短い枠の両向きだけ、太く潰さない。

@compose gap=48 height=280
@part short width=120
@box tone=muted
### 短
@endbox
@endpart
@part mid width=280
@box tone=muted
### 中
@endbox
@endpart
@part long width=520
@box tone=muted
### 長
@endbox
@endpart
@arrow id=scale-short target=short side=top size=88 label="短" arrows=both
@arrow id=scale-mid target=mid side=top size=88 label="中" arrows=both
@arrow id=scale-long target=long side=top size=88 label="長" arrows=both
@endcompose

@footer
pattern: length-scale-both
@endfooter

---

<!-- milo: layout=lab -->

# 太さの上限が小さい

間隔が広くても、`size` より太くはしない。

@compose gap=220 height=280
@part left width=260
@box tone=accent
### 入口
短い
@endbox
@endpart
@part right width=260
@box tone=dark
### 出口
短い
@endbox
@endpart
@arrow id=go from=left to=right size=32
@endcompose

@footer
pattern: size-cap-small
@endfooter

---

<!-- milo: layout=lab -->

# 太さの上限が大きい

同じ間隔で `size` だけ大きくする。長さが足りなければ縮小する。

@compose gap=220 height=280
@part left width=260
@box tone=accent
### 入口
短い
@endbox
@endpart
@part right width=260
@box tone=dark
### 出口
短い
@endbox
@endpart
@arrow id=go from=left to=right size=120
@endcompose

@footer
pattern: size-cap-large
@endfooter

---

<!-- milo: layout=section -->

# 層の外側

---

<!-- milo: layout=lab -->

# 上の層

`from` と `to` と `side=top` で、二つの対象が決める幅に合わせる。

@compose
@part map width=1120
@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpart
@arrow id=span from=map.b to=map.c side=top label="深さ"
@endcompose

@footer
pattern: span-top
@endfooter

---

<!-- milo: layout=lab -->

# 右の層

`side=right` は、始点と終点の高さをカバーする。

@compose
@part map width=1120
@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpart
@arrow id=wide from=map.a to=map.c side=right label="広さ" tone=default
@endcompose

@footer
pattern: span-right
@endfooter

---

<!-- milo: layout=lab -->

# 下の層

@compose
@part map width=1120
@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpart
@arrow id=span from=map.a to=map.b side=bottom label="下"
@endcompose

@footer
pattern: span-bottom
@endfooter

---

<!-- milo: layout=lab -->

# 左の層

@compose
@part map width=1120
@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpart
@arrow id=wide from=map.a to=map.c side=left label="左" tone=default
@endcompose

@footer
pattern: span-left
@endfooter

---

<!-- milo: layout=section -->

# ラベル・色・対象

---

<!-- milo: layout=lab -->

# 色

`tone` は accent / default / muted。

@compose gap=80 height=240
@part a width=200
@box tone=accent
### A
@endbox
@endpart
@part b width=200
@box
### B
@endbox
@endpart
@part c width=200
@box tone=muted
### C
@endbox
@endpart
@part d width=200
@box tone=dark
### D
@endbox
@endpart
@arrow id=accent from=a to=b size=64 label="accent"
@arrow id=default from=b to=c size=64 label="default" tone=default
@arrow id=muted from=c to=d size=64 label="muted" tone=muted
@endcompose

@footer
pattern: tones
@endfooter

---

<!-- milo: layout=lab -->

# ラベルは外

横向きは矢印の上、縦向きは右上。内側には置かない。

@compose gap=160 height=280
@part left width=260
@box tone=muted
### 活用
短い
@endbox
@endpart
@part right width=260
@box tone=accent
### 探索
短い
@endbox
@endpart
@arrow id=trade from=left to=right size=72 label="トレードオフ" arrows=both
@endcompose

@footer
pattern: labels-both
@endfooter

---

<!-- milo: layout=lab -->

# 頂点から箱へ

`from=map.c to=note` で、箱に面した節点から結ぶ。

@compose gap=145 height=420
@part map width=640
@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C" level=high
@enddiagram
@endpart
@part note width=330
@box tone=accent
- 項目1
- 項目2
@endbox
@endpart
@arrow id=action from=map.c to=note size=56
@endcompose

@footer
pattern: node-to-box
@endfooter

---

<!-- milo: layout=lab -->

# 二つの図をつなぐ

環と放射を、大きな矢印で結ぶ。

@compose gap=125 align=start height=360
@part now width=555
## 図1

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpart
@part future width=555
## 図2

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpart
@arrow id=advance from=now to=future label="進む" size=65
@endcompose

@footer
pattern: diagrams
@endfooter

---

<!-- milo: layout=lab -->

# 上揃え

高さが違うまとまりでも、`align=start` なら上で揃えて結ぶ。

@compose gap=140 align=start height=360
@part short width=280
@box tone=accent
### 短い
一行
@endbox
@endpart
@part tall width=280
@box tone=dark
### 高い
- 項目1
- 項目2
- 項目3
@endbox
@endpart
@arrow id=go from=short to=tall size=72
@endcompose

@footer
pattern: align-start
@endfooter

---

<!-- milo: layout=lab -->

# 下揃え

@compose gap=140 align=end height=360
@part short width=280
@box tone=accent
### 短い
一行
@endbox
@endpart
@part tall width=280
@box tone=dark
### 高い
- 項目1
- 項目2
- 項目3
@endbox
@endpart
@arrow id=go from=short to=tall size=72
@endcompose

@footer
pattern: align-end
@endfooter

---

<!-- milo: layout=lab -->

# 矢印を否定する

`@cross target` に矢印の `id` を指定できる。

@compose gap=200 height=360
@part problem width=280
@box tone=muted
### 課題
うまくいかない
@endbox
@endpart
@part solution width=280
@box tone=muted
### 解決策
うまくいくようにする
@endbox
@endpart
@arrow id=proposal from=problem to=solution size=88 tone=muted
@cross target=proposal size=260 label="このつながりだけでは解決しない"
@endcompose

@footer
pattern: with-cross
@endfooter

---

<!-- milo: layout=lab -->

# 対象からの距離

`offset` で、外側の矢印と対象の間隔を変える。

@compose height=360
@part box width=480
@box tone=accent
### 対象
offset の違い
@endbox
@endpart
@arrow id=near target=box side=top size=48 offset=8 label="近"
@arrow id=far target=box side=bottom size=48 offset=48 label="遠"
@endcompose

@footer
pattern: offset
@endfooter
