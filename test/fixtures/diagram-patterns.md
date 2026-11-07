---
title: 図式パターンテスト
description: ring / radial / field / free に加え、grid / columns / 解説矢印の配置を目視と自動テストで確認する
documentId: diagram-patterns
---

<!-- milo: layout=cover -->

# 図式パターンテスト

描画エンジン用。環・放射・座標・自由配置に加え、格子・列・解説矢印の形だけを並べる。

---

<!-- milo: layout=section -->

# 環

---

<!-- milo: layout=lab -->
<!-- pattern: ring-3 -->

# 3節点の環

項目が三つなら三角形。既定は上から反時計回り。

@diagram layout=ring connect=cycle start=top order=ccw
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram

@footer
pattern: ring-3｜三角形
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-4 -->

# 4節点の環

四つなら四角形。

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"
@enddiagram

@footer
pattern: ring-4｜四角形
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-6 -->

# 6節点の環

多くても正多角形のまま。

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"
@item e title="節点E"
@item f title="節点F"
@enddiagram

@footer
pattern: ring-6｜六角形
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-cw -->

# 時計回り

`order=cw` は並びが逆になる。

@diagram layout=ring connect=cycle start=top order=cw
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram

@footer
pattern: ring-cw｜時計回り
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-start-left -->

# 左から始める

`start=left` は最初の節点が左。

@diagram layout=ring connect=cycle start=left order=ccw
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"
@enddiagram

@footer
pattern: ring-start-left｜左始まり
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-none allow=NO_EDGES -->

# 線のない環

`connect=none` は頂点だけ。

@diagram layout=ring connect=none
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram

@footer
pattern: ring-none allow=NO_EDGES｜線なし
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-notes -->

# 外側の注記

頂点は動かさず、説明を外へ出す。

@diagram layout=ring connect=none note=outside note-link=arrow
@item a title="節点A" badge=1 level=high
少し長い本文を外側に置く。
@item b title="節点B" badge=2 level=high
少し長い本文を外側に置く。
@item c title="節点C" badge=3 level=low
少し長い本文を外側に置く。
@enddiagram

@footer
pattern: ring-notes｜外側注記
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-notes-leader -->

# 注記を引き出し線で

`note-link=leader` は矢印なし。

@diagram layout=ring connect=none note=outside note-link=leader
@item a title="節点A"
少し長い本文を外側に置く。
@item b title="節点B"
少し長い本文を外側に置く。
@item c title="節点C"
少し長い本文を外側に置く。
@enddiagram

@footer
pattern: ring-notes-leader｜引き出し線
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-mixed-notes -->

# 項目ごとに注記を変える

一部だけ外側、一部は注記なし。

@diagram layout=ring connect=cycle note=outside
@item a title="節点A" note=outside
少し長い本文を外側に置く。
@item b title="節点B" note=none
@item c title="節点C" note=outside
少し長い本文を外側に置く。
@enddiagram

@footer
pattern: ring-mixed-notes｜項目ごとの注記
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-levels -->

# 評価の段階

`level` で強調を変える。

@diagram layout=ring connect=cycle
@item a title="節点A" level=high
@item b title="節点B" level=medium
@item c title="節点C" level=low
@enddiagram

@footer
pattern: ring-levels｜high / medium / low
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: ring-grid -->

# 二つの環を並べる

同じスライドに独立した環。

@grid columns=2 gap=20
@panel
### 3節点

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpanel
@panel
### 4節点

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"
@enddiagram
@endpanel
@endgrid

@footer
pattern: ring-grid｜二つの環
@endfooter

---

<!-- milo: layout=section -->

# 放射

---

<!-- milo: layout=lab -->
<!-- pattern: radial-classic -->

# 自動の放射

`side` も `distance` も無いときは、重ならない半径に置く。

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@item d title="枝D"
@link hub -- a
@link hub -- b
@link hub -- c
@link hub -- d
@enddiagram

@footer
pattern: radial-classic｜自動半径
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-spatial -->

# 方向と距離

四方向に、近い・中・遠いを混ぜる。

@diagram layout=radial center=hub width=1400 height=800
@item hub title="中心" level=high
@item a title="上" side=top distance=far
@item b title="左" side=left distance=near
@item c title="下" side=bottom distance=far
@item d title="右" side=right distance=mid
@link hub -- a
@link hub -- b
@link hub -- c
@link hub -- d
@enddiagram

@footer
pattern: radial-spatial｜side と distance
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-same-side allow=OVERFLOW -->

# 同じ方向に二つ

同じ側でも、収まれば並べる。

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="上1" side=top distance=mid
@item b title="上2" side=top distance=mid
@link hub -- a
@link hub -- b
@enddiagram

@footer
pattern: radial-same-side allow=OVERFLOW｜同じ側に2枚
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-crowd allow=OVERFLOW,NO_EDGES -->

# 同じ方向に収まりきらない

長いカードを同じ側へ四つ置く。警告を出す。

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="非常に長いカードA" side=top distance=near
@item b title="非常に長いカードB" side=top distance=near
@item c title="非常に長いカードC" side=top distance=near
@item d title="非常に長いカードD" side=top distance=near
@enddiagram

@footer
pattern: radial-crowd allow=OVERFLOW,NO_EDGES｜同じ側に4枚
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-center -->

# 中心を指定する

最初の項目でなく、`center` で中心を決める。

@diagram layout=radial center=hub
@item a title="枝A"
@item hub title="中心"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram

@footer
pattern: radial-center｜center=hub
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-cycle -->

# 周囲を環で結ぶ

`connect=cycle` は中心を除いた周囲を結ぶ。

@diagram layout=radial center=hub connect=cycle
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram

@footer
pattern: radial-cycle｜周囲の環
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-directed -->

# 向きのある放射

中心から外へ片方向。

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -> a
@link hub -> b
@link hub <-> c label="ラベル"
@enddiagram

@footer
pattern: radial-directed｜向きのある線
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-uneven -->

# 長さの違う題

短い枝と長い枝が混ざる。

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="短"
@item b title="これは幅の差を出すための長い日本語タイトル"
@item c title="中くらいの題"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram

@footer
pattern: radial-uneven｜題の長さが違う
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: radial-sparse -->

# 枝が一本

中心と葉が一つ。

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@link hub -- a
@enddiagram

@footer
pattern: radial-sparse｜1本
@endfooter

---

<!-- milo: layout=section -->

# 座標平面

---

<!-- milo: layout=lab -->
<!-- pattern: field-axes allow=NO_EDGES -->

# 軸のある3点

指定した座標を保つ。

@diagram layout=field guide=axes x-low="左" x-high="右" y-low="下" y-high="上"
@item a title="点A" x=-0.7 y=0.6
@item b title="点B" x=0.5 y=0.4
@item c title="点C" x=0.8 y=-0.6
@enddiagram

@footer
pattern: field-axes allow=NO_EDGES｜3点と軸
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-aliases allow=NO_EDGES -->

# 別名の座標

`left` / `right` / `top` / `bottom`。

@diagram layout=field guide=axes x-low="左" x-high="右" y-low="下" y-high="上"
@item a title="点A" x=left y=top
@item b title="点B" x=right y=bottom
@item c title="点C" x=center y=middle
@enddiagram

@footer
pattern: field-aliases allow=NO_EDGES｜別名
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-origin allow=NO_EDGES -->

# 原点

`(0, 0)` は面の中央。

@diagram layout=field guide=axes
@item a title="点A" x=0 y=0
@enddiagram

@footer
pattern: field-origin allow=NO_EDGES｜原点
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-zones allow=NO_EDGES -->

# 領域

矩形の区画に点を置く。

@diagram layout=field guide=axes x-low="左" x-high="右" y-low="下" y-high="上"
@zone west label="区画A" x="-1:0" y="0:1"
@zone east label="区画B" x="0:1" y="0:1"
@item a title="点A" x=-0.5 y=0.5
@item b title="点B" x=0.5 y=0.5
@enddiagram

@footer
pattern: field-zones allow=NO_EDGES｜領域
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-clusters allow=NO_EDGES -->

# 所属

点のまとまりは凡例に出る。

@diagram layout=field guide=axes x-low="左" x-high="右" y-low="下" y-high="上"
@cluster g1 title="群A" tone=accent
@cluster g2 title="群B" tone=muted
@item a title="点A" x=-0.6 y=0.55 cluster=g1
@item b title="点B" x=-0.45 y=-0.35 cluster=g1
@item c title="点C" x=0.55 y=0.65 cluster=g2
@item d title="点D" x=0.7 y=-0.25 cluster=g2
@enddiagram

@footer
pattern: field-clusters allow=NO_EDGES｜所属
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-halo allow=NO_EDGES -->

# 所属の輪

同じ群を一つの囲みにする。

@diagram layout=field guide=axes x-low="左" x-high="右" y-low="下" y-high="上" cluster-region=halo
@cluster g1 title="群A" tone=accent
@cluster g2 title="群B" tone=muted
@item a title="点A" x=-0.68 y=0.58 cluster=g1
@item b title="点B" x=-0.8 y=0.08 cluster=g1
@item c title="点C" x=-0.28 y=0.22 cluster=g1
@item d title="点D" x=0.48 y=0.68 cluster=g2
@item e title="点E" x=0.82 y=0.22 cluster=g2
@item f title="点F" x=0.7 y=-0.38 cluster=g2
@enddiagram

@footer
pattern: field-halo allow=NO_EDGES｜所属の輪
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-cards allow=NO_EDGES -->

# 座標にカード

`shape=card` は点ではなくカード。題はカードの中。

@diagram layout=field
@item a title="カードA" x=-0.5 y=0.4 shape=card
@item b title="カードB" x=0.5 y=-0.3 shape=card
@enddiagram

@footer
pattern: field-cards allow=NO_EDGES｜カード
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-mixed allow=NO_EDGES -->

# 点とカードを混ぜる

@diagram layout=field guide=axes
@item a title="カードA" x=-0.45 y=0.35 shape=card
@item b title="点B" x=0.4 y=-0.4
@enddiagram

@footer
pattern: field-mixed allow=NO_EDGES｜点とカード
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: field-links -->

# 座標平面の線

点同士も `@link` で結べる。

@diagram layout=field guide=axes x-low="左" x-high="右" y-low="下" y-high="上"
@item a title="点A" x=-0.6 y=0.5
@item b title="点B" x=0.2 y=0.2
@item c title="点C" x=0.7 y=-0.4
@link a -> b
@link b -> c
@enddiagram

@footer
pattern: field-links｜点を結ぶ
@endfooter

---

<!-- milo: layout=section -->

# 自由配置

---

<!-- milo: layout=lab -->
<!-- pattern: free-merge -->

# 二つの流れが合流する

座標のまま置き、曲線で入る。

@canvas layout=free direction=right width=1260 height=540 route=curve
@node a frame=20,46,250,100
節点A
@node b frame=20,374,250,108
節点B
@node c frame=347,152,245,138
合流
@edge a --> c
@edge b --> c
@endcanvas

@footer
pattern: free-merge｜自由配置の合流
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: free-row -->

# 横に並ぶ

高さが同じなら、線は横に走る。

@canvas layout=free route=straight width=1260 height=420
@node a frame=40,140,220,100
節点A
@node b frame=420,140,220,100
節点B
@node c frame=800,140,220,100
節点C
@edge a --> b
@edge b --> c
@endcanvas

@footer
pattern: free-row｜横一列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: free-column -->

# 縦に並ぶ

@canvas layout=free route=straight width=900 height=620
@node a frame=330,40,220,100
節点A
@node b frame=330,240,220,100
節点B
@node c frame=330,440,220,100
節点C
@edge a --> b
@edge b --> c
@endcanvas

@footer
pattern: free-column｜縦一列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: free-shapes -->

# 形を変える

カード・楕円・菱形。

@canvas layout=free route=straight width=1260 height=420
@node a frame=40,140,220,100 shape=card
節点A
@node b frame=420,140,220,100 shape=ellipse
節点B
@node c frame=800,140,220,100 shape=diamond
節点C
@edge a --> b
@edge b --> c
@endcanvas

@footer
pattern: free-shapes｜形
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: free-arrows -->

# 矢印の向き

無し・始点・終点・両方。

@canvas layout=free route=straight width=1260 height=420
@node a frame=40,140,200,100
節点A
@node b frame=360,140,200,100
節点B
@node c frame=680,140,200,100
節点C
@node d frame=1000,140,200,100
節点D
@edge a --> b arrows=none
@edge b --> c arrows=start
@edge c --> d arrows=both
@endcanvas

@footer
pattern: free-arrows｜矢印
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: free-labels -->

# 線のラベル

@canvas layout=free route=curve width=1260 height=480
@node a frame=80,80,230,110
節点A
@node b frame=720,80,230,110
節点B
@node c frame=400,300,230,110
節点C
@edge a --> b label="ラベルA"
@edge a --> c label="ラベルB"
@edge b --> c dashed=true tone=accent label="ラベルC"
@endcanvas

@footer
pattern: free-labels｜線ラベル
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: free-frame -->

# frame で置く

`frame=x,y,width,height` はそのままの座標。

@canvas layout=free width=1000 height=420
@node a frame=48,60,210,100
節点A
@node b x=520 y=80 pinned
節点B
@edge a --> b
@endcanvas

@footer
pattern: free-frame｜frame と pinned
@endfooter

---

<!-- milo: layout=section -->

# 格子

---

<!-- milo: layout=lab -->
<!-- pattern: grid-3 -->

# 三列の格子

`columns=3` は同じ高さの三つの枠。

@grid columns=3 gap=16
@panel
### 図1

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpanel
@panel
### 図2

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"
@enddiagram
@endpanel
@panel
### 図3

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpanel
@endgrid

@footer
pattern: grid-3｜三列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: grid-wrap -->

# 折り返す格子

列は二つ、枠は三つ。三枚目は下の行へ。

@grid columns=2 gap=16
@panel
### 上左

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpanel
@panel
### 上右

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@item d title="節点D"
@enddiagram
@endpanel
@panel
### 下

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpanel
@endgrid

@footer
pattern: grid-wrap｜折り返し
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: grid-mixed -->

# 環と放射を並べる

種類の違う図を同じ高さで置く。

@grid columns=2 gap=20
@panel
### 環

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endpanel
@panel
### 放射

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endpanel
@endgrid

@footer
pattern: grid-mixed｜環と放射
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: grid-stack allow=NO_EDGES -->

# 格子の中で重ねる

`@stack` は枠の中で縦に積む。

@grid columns=2 gap=20
@panel
### 左
@stack
@box tone=default
上の箱
@endbox
@box tone=default
中の箱
@endbox
@box tone=dark
下の箱
@endbox
@endstack
@endpanel
@panel tone=accent
### 右
@stack
@box tone=default
短い本文を置く。
@endbox
@box tone=default
もう一つの箱。
@endbox
@endstack
@endpanel
@endgrid

@footer
pattern: grid-stack allow=NO_EDGES｜重ねる
@endfooter

---

<!-- milo: layout=section -->

# 列

---

<!-- milo: layout=lab -->
<!-- pattern: columns-2 -->

# 二つの等幅列

環と座標を左右に置く。

@columns
@column
### 環

@diagram layout=ring connect=cycle
@item a title="節点A"
@item b title="節点B"
@item c title="節点C"
@enddiagram
@endcolumn
@column
### 座標

@diagram layout=field guide=axes width=560 height=320 x-low="左" x-high="右" y-low="下" y-high="上"
@item a title="点A" x=-0.6 y=0.45
@item b title="点B" x=0.35 y=0.2
@item c title="点C" x=0.7 y=-0.4
@link a -> b
@link b -> c
@enddiagram
@endcolumn
@endcolumns

@footer
pattern: columns-2｜二つの列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: columns-3 allow=NO_EDGES -->

# 三つの等幅列

本文と箱だけ。線は無い。

@columns
@column
### 列A

短い本文を置く。

@box tone=muted
箱A
@endbox
@endcolumn
@column
### 列B

通常の **強調**。

@box tone=default
箱B
@endbox
@endcolumn
@column
### 列C

- 項目1
- 項目2
@endcolumn
@endcolumns

@footer
pattern: columns-3 allow=NO_EDGES｜三つの列
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: columns-mixed -->

# 図と説明の列

左に放射、右に箱を積む。

@columns
@column
### 放射

@diagram layout=radial center=hub
@item hub title="中心"
@item a title="枝A"
@item b title="枝B"
@item c title="枝C"
@link hub -- a
@link hub -- b
@link hub -- c
@enddiagram
@endcolumn
@column
### 説明
@stack
@box tone=accent
枝Aの説明
@endbox
@box tone=muted
枝Bの説明
@endbox
@box tone=default
枝Cの説明
@endbox
@endstack
@endcolumn
@endcolumns

@footer
pattern: columns-mixed｜図と説明
@endfooter

---

<!-- milo: layout=section -->

# 解説矢印

---

<!-- milo: layout=lab -->
<!-- pattern: compose-boxes -->

# 二つの箱を結ぶ

大きな矢印は flow の辺とは別。

@compose gap=160 height=360
@part left width=300
@box tone=accent
### 入口

短い本文を置く。
@endbox
@endpart
@part right width=300
@box tone=dark
### 出口

短い本文を置く。
@endbox
@endpart
@arrow id=go from=left to=right size=88
@endcompose

@footer
pattern: compose-boxes｜箱と箱
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-both -->

# 両向きの解説矢印

`arrows=both` は相互作用。

@compose gap=160 height=300
@part left width=300
@box tone=muted
### 側A
短い本文を置く。
@endbox
@endpart
@part right width=300
@box tone=accent
### 側B
短い本文を置く。
@endbox
@endpart
@arrow id=trade from=left to=right size=72 label="切替" arrows=both
@endcompose

@footer
pattern: compose-both｜両向き
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-diagrams -->

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
pattern: compose-diagrams｜二つの図
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-node -->

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
pattern: compose-node｜頂点から箱
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-side -->

# 図の外側に重ねる

`from` と `to` と `side` で、層の外に平行な矢印を置く。

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
@arrow id=span from=map.b to=map.c side=top label="上"
@arrow id=wide from=map.a to=map.c side=right label="外" tone=default
@endcompose

@footer
pattern: compose-side｜外側の矢印
@endfooter

---

<!-- milo: layout=lab -->
<!-- pattern: compose-column -->

# 縦に結ぶ

`layout=column` は上から下。

@compose layout=column gap=120 height=520
@part top width=360
@box tone=accent
### 上
短い本文を置く。
@endbox
@endpart
@part bottom width=360
@box tone=muted
### 下
短い本文を置く。
@endbox
@endpart
@arrow id=down from=top to=bottom size=72
@endcompose

@footer
pattern: compose-column｜縦の矢印
@endfooter
