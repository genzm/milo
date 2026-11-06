---
title: Flow v2
---

<!-- milo: layout=lab -->

# 直列フロー

@diagram layout=flow direction=right
@item in title="始点"
@item analyze title="節点A"
@item judge title="節点B"
@item run title="終点"
@link in -> analyze
@link analyze -> judge
@link judge -> run
@enddiagram

---

<!-- milo: layout=lab -->

# 分岐合流

@diagram layout=flow direction=right
@item start title="始点"
@item a title="経路A"
@item b title="経路B"
@item join title="合流"
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram

---

<!-- milo: layout=lab -->

# 多段の分岐合流

@diagram layout=flow direction=right route=curve
@item in title="始点"
@item a1 title="経路A"
@item a2 title="経路B"
@item mid title="合流1"
@item b1 title="経路C"
@item b2 title="経路D"
@item out title="合流2"
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

---

<!-- milo: layout=lab -->

# 固定高さ

@canvas layout=flow direction=right height=80
@node a
### 始点
長い本文が領域に収まらない。
-->
@node b
### 終点
こちらも長い。
@endcanvas
