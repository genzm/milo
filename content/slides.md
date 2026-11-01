---
title: 小さな実験室
description: 原稿・数式・画像・編集道具を内蔵する、自己編集可能な単一HTML。
---

<!-- milo: layout=cover -->

# 君とボク。

> あらゆる現実を、自分の方に捻じ曲げたのだ。

---

<!-- milo: layout=lab -->

# HTML-in-Canvas

@columns
@column

### どんなMarkdownかけますか? @align=center

通常のMarkdownを書けます。通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。
通常のMarkdownを書けます。

@endcolumn
@column

### 記法の種類 @align=center

- 箇条書き
- 数式 $x^2$, code `print()`

```
print()
```

@endcolumn
@endcolumns

---

<!-- milo: layout=lab -->

# ひとつの図で話す

@steps highlight=2
@step title="書く"
Markdownのまま
カードと矢印に
@step title="置く"
同じ高さの列
入れ子の箱
@step title="出す"
ひとつのHTML
PDFも同時に
@endsteps

---

<!-- milo: layout=lab -->

# 3つの置き方

@grid columns=3
@panel tone=accent
### カード

番号付きの流れは
steps に任せる

@box tone=default
中身だけ書く
@endbox
@endpanel
@panel
### 列

同じ高さの比較は
grid が揃える

@box tone=default
入れ子もできる
@endbox
@endpanel
@panel
### 線

関係は diagram
流れも diagram

@box tone=default
SVGでつなぐ
@endbox
@endpanel
@endgrid

---

<!-- milo: layout=lab -->

# ばらばら / まとまり

@grid columns=2
@panel
### × ばらばら
@stack
@box tone=default
座標と線を毎回書く
@endbox
@box tone=default
カードの高さが揃わない
@endbox
@box tone=dark
図に時間がとられる
@endbox
@endstack
@endpanel
@panel tone=accent
### ○ まとまり
@stack
@box tone=default
中身だけ書けばいい
@endbox
@box tone=default
miloが並べて揃える
@endbox
@box tone=dark
話に集中できる
@endbox
@endstack
@endpanel
@endgrid

---

<!-- milo: layout=lab -->

# HTML-in-Canvas

@canvas direction=right route=straight

@node write tone=muted
### 書く

文章、**強調**、数式 $x^2$ を
そのまま書く。

-->

@node measure
### 測る

本文の幅から
カードの大きさを決める。

-->

@node place tone=accent
### 置く

流れに並べて
矢印でつなぐ。

-->

@node show tone=dark
### 出す

Markdownの見た目のまま、
ひとつの図になる。

@endcanvas

---

<!-- milo: layout=lab -->

# 数式もそのまま

文章の中には $E = mc^2$ のように数式を書けます。

$$
f(t) = A e^{-\gamma t} \cos(\omega t)
$$

図やグラフは画像として貼り付けられます。

---

<!-- milo: layout=media -->

# Gifもおけるよ！

GIFも、画像も、ひとつのHTMLの中へ。  
「素材」から画像を差し替えると、そのまま文書に埋め込まれます。

![粒子の動きを描いたループアニメーション](./assets/flow.gif 'EMBEDDED GIF · オフラインでも再生できます')

説明用の数式も書けます。たとえば $E = \frac{1}{2}mv^2$。

---

<!-- milo: layout=lab -->

# Emphasis & Tasks

@grid columns=2
@panel
通常の **黒字強調** と ==アクセント強調== を使い分けられます。

@impact
73%
@endimpact
@endpanel
@panel tone=accent
### 次に進めること

- 通常の項目
- [ ] 仮説を確認する
- [x] データを集める
@endpanel
@endgrid

---

<!-- milo: layout=lab -->

# 関係と状態は、項目を書くだけ

@diagram layout=ring connect=cycle start=top order=ccw
@item access title="誰でも引ける" badge=1 level=high
@item speed title="速く引ける" badge=2 level=high
@item history title="遡って引ける" badge=3 level=low
@enddiagram

`level` は評価。色はテーマが決める。

---

<!-- milo: layout=lab -->

# 項目数で、形が決まる

@grid columns=2
@panel
### 3項目 → 三角形

@diagram layout=ring connect=cycle
@item a title="品質" badge=1
@item b title="速度" badge=2
@item c title="コスト" badge=3
@enddiagram
@endpanel
@panel
### 4項目 → 四角形

@diagram layout=ring connect=cycle
@item a title="品質" badge=1
@item b title="速度" badge=2
@item c title="コスト" badge=3
@item d title="安全性" badge=4
@enddiagram
@endpanel
@endgrid

---

<!-- milo: layout=lab -->

# 補足は、外側へ

@diagram layout=ring connect=none geometry=regular note=outside note-style=plain note-link=arrow
@item clear title="明確" badge=1 level=high
具体的に話せる。相手が迷わず動けるところまで落としてから話す。
@item concise title="簡潔" badge=2 level=high
重要点を短く話せる。長い話を、判断に必要な芯だけにする。
@item unique title="ユニーク" badge=3 level=high
独自の洞察がある。他の人が置いていない切り口を一つ足す。
@enddiagram

`note=outside` は正多角形を崩さず、説明を外向きの矢印でつなぐ。

---

<!-- milo: layout=lab -->

# A. 直列フロー

@diagram layout=flow direction=right
@item input title="入力"
@item analyze title="分析"
@item judge title="判断"
@item run title="実行" level=high
@link input -> analyze
@link analyze -> judge
@link judge -> run
@enddiagram

4ノードでも文字が極端に折り返されず、均等に配置される。

---

<!-- milo: layout=lab -->

# B. 分岐・合流

@diagram layout=flow direction=right route=auto
@item start title="入力"
@item pathA title="経路A"
@item pathB title="経路B"
@item join title="統合" level=high
@link start -> pathA
@link start -> pathB
@link pathA -> join
@link pathB -> join
@enddiagram

分岐・合流の階層が揃い、線の交差が最小限になる。

---

<!-- milo: layout=lab -->

# C. 縦方向フロー

@diagram layout=flow direction=down
@item find title="課題発見"
@item cause title="原因分析"
@item act title="打ち手" level=high
@link find -> cause
@link cause -> act
@enddiagram

横に収まらない構成でも、縦方向を選べる。

---

<!-- milo: layout=lab -->

# D. フィードバックループ

@canvas direction=right route=straight
@node plan
### 計画
-->
@node do
### 実行
-->
@node see
### 検証
@edge see --> plan dashed=true tone=accent label=フィードバック
@endcanvas

循環があってもノードを不規則に並べず、戻り線で示す。

---

<!-- milo: layout=lab -->

# 中心から広げる

@diagram layout=radial center=problem
@item problem title="顧客の課題"
@item cost title="コスト"
@item time title="時間"
@item quality title="品質"
@item support title="サポート"
@link problem -- cost
@link problem -- time
@link problem -- quality
@link problem -- support
@enddiagram

同じ `@item` と `@link` で、放射状の図にもできる。

---

<!-- milo: layout=lab -->

# 方向と距離も、宣言する

@diagram layout=radial center=problem
@item problem title="顧客の課題" level=high
@item cost title="コスト" side=top distance=far
@item time title="時間" side=left distance=near
@item quality title="品質" side=bottom distance=far
@item support title="サポート" side=right distance=mid
@link problem -- cost
@link problem -- time
@link problem -- quality
@link problem -- support
@enddiagram

`side` と `distance` は中心からの意味。位置を直接は動かさない。

---

<!-- milo: layout=lab -->

# 2つの軸で置く

@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"
@item a title="施策A" x=-0.7 y=0.6
@item b title="施策B" x=0.5 y=0.4
@item c title="施策C" x=0.8 y=-0.6
@enddiagram

Field は指定した座標を保ったまま、ラベルだけ避ける。

---

<!-- milo: layout=lab -->

# 領域とまとまり

@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"
@zone internal label="内部・長期" x="-1:0" y="0:1"
@zone external label="外部・長期" x="0:1" y="0:1"
@cluster business title="事業" tone=accent
@cluster product title="プロダクト" tone=muted
@item a title="コスト" x=-0.6 y=0.55 cluster=business
@item b title="時間" x=-0.45 y=-0.35 cluster=business
@item c title="品質" x=0.55 y=0.65 cluster=product
@item d title="サポート" x=0.7 y=-0.25 cluster=product
@enddiagram

Zone は空間の区分。Cluster は項目の所属。

---

<!-- milo: layout=lab -->

# まとまりを囲む

@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期" cluster-region=halo
@zone internal label="内部・長期" x="-1:0" y="0:1"
@zone external label="外部・長期" x="0:1" y="0:1"
@cluster business title="事業" tone=accent
@cluster product title="プロダクト" tone=muted
@item cost title="コスト" x=-0.68 y=0.58 cluster=business
@item hire title="採用" x=-0.8 y=0.08 cluster=business
@item org title="組織" x=-0.28 y=0.22 cluster=business
@item time title="時間" x=-0.48 y=-0.42 cluster=business
@item quality title="品質" x=0.48 y=0.68 cluster=product
@item exp title="体験" x=0.26 y=0.16 cluster=product
@item price title="価格" x=0.82 y=0.22 cluster=product
@item support title="サポート" x=0.7 y=-0.38 cluster=product
@enddiagram

`cluster-region=halo` は同じ所属を一つの囲みにする。箱ではなく、点をまとめて包む。
