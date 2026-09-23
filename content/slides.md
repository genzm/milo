---
title: 小さな実験室
description: 原稿・数式・動く図・編集道具を内蔵する、自己編集可能な単一HTML。
---

```milo:model wave
{
  "input": "t",
  "parameters": {
    "A": 1.0,
    "gamma": 0.2,
    "omega": 3.0
  },
  "expression": "A * exp(-gamma * t) * cos(omega * t)"
}
```

<!-- milo: layout=cover -->

# 君とボク。

> あらゆる現実を、自分の方に捻じ曲げたのだ。

---

<!-- milo: layout=lab -->

# HTML-in-Canvas

@canvas layout=flow direction=right height=340 route=curve

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

---

<!-- milo: layout=lab -->

# Lean Analytics

減衰率は **{{wave.gamma}}**。係数を動かすと、同じモデルから図を描き直します。

::equation{model="wave"}

::plot{model="wave" from="0" to="10"}

::slider{param="wave.gamma" label="減衰率 γ" min="0" max="1" step="0.01"}
::slider{param="wave.omega" label="角振動数 ω" min="0.5" max="7" step="0.1"}

式をクリックすると、元のモデルを編集できます。

---

<!-- milo: layout=media -->

# Gifもおけるよ！

GIFも、画像も、ひとつのHTMLの中へ。  
「素材」から画像を差し替えると、そのまま文書に埋め込まれます。

![粒子の動きを描いたループアニメーション](./assets/flow.gif 'EMBEDDED GIF · オフラインでも再生できます')

説明用の数式も書けます。たとえば $E = \frac{1}{2}mv^2$。
