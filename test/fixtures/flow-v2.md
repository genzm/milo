---
title: Flow v2
---

<!-- milo: layout=lab -->

# 直列フロー

@diagram layout=flow direction=right
@item in title="入力"
@item analyze title="分析"
@item judge title="判断"
@item run title="実行"
@link in -> analyze
@link analyze -> judge
@link judge -> run
@enddiagram

---

<!-- milo: layout=lab -->

# 分岐合流

@diagram layout=flow direction=right
@item start title="入力"
@item a title="経路A"
@item b title="経路B"
@item join title="統合"
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram

---

<!-- milo: layout=lab -->

# 固定高さ

@canvas layout=flow direction=right height=80
@node a
### 入力
長い本文が領域に収まらない。
-->
@node b
### 実行
こちらも長い。
@endcanvas
