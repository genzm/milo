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
分岐は canvas

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

@node markdown tone=muted
### Markdown

文章、**強調**、数式 $x^2$ を
そのまま描画します。

-->

@node layout tone=accent
### Canvas

- flowで自動配置
- freeで座標指定
- SVGで接続

-->

@node slide tone=dark
### Slide

Markdownの見た目を保ったまま、
ひとつの図になります。

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
