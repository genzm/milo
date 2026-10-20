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



@canvas direction=right route=curve

@node markdown tone=accent

### Markdown

文章、**強調**、数式 $x^2$ を、そのままHTMLとして描画します。

-->

@node layout shape=round

### Canvas

- flowで自動配置
- freeで座標指定
- SVGで接続

-->

@node slide tone=dark

### Slide

Markdownの見た目を保ったまま、ひとつの図になります。

@endcanvas

@impact
死ぬほど使いやすい @align=center
@endimpact

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

@columns
@column

通常の **黒字強調** と ==アクセント強調== を使い分けられます。

@impact
73%
@endimpact

@endcolumn
@column

### 次に進めること

- 通常の項目
- [ ] 仮説を確認する
- [x] データを集める

@endcolumn
@endcolumns
