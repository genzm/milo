---
title: Diagram regressions
---

<!-- milo: layout=lab -->

# 環状の4節点

@diagram layout=ring connect=none note=outside note-link=arrow geometry=regular width=1100 height=630
@item depth title="節点A" badge=1
短い本文
@item breadth title="節点B" badge=2
短い本文
@item structure title="節点C" badge=3
少し長い本文を入れる
@item time title="節点D" badge=4
短い本文
@enddiagram

@footer
ring｜4節点
@endfooter

---

<!-- milo: layout=lab -->

# 入れ子の木

@diagram layout=flow direction=right route=auto width=1250
@item issue title="入口"
短い本文
@item raw title="枝A"
さらに分かれる
@item ferment title="枝B"
短い本文
@item oxid title="枝C" level=high
少し長い本文を入れる
@item soy title="葉A1"
@item wheat title="葉A2"
@item salt title="葉A3"
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@link raw -> soy
@link raw -> wheat
@link raw -> salt
@enddiagram

@footer
flow｜3本の下に、さらに3本
@endfooter

---

<!-- milo: layout=lab -->

# 座標平面の3点

@diagram layout=field width=1280 height=620 guide=axes x-low="左" x-high="右" y-low="下" y-high="上"
@item c1 title="点1" x=-0.67 y=0.48 level=medium
@item c2 title="点2" x=0.57 y=0.48 level=medium
@item own title="点3" x=0.57 y=-0.52 level=high
@enddiagram

@footer
field｜3点
@endfooter

---

<!-- milo: layout=lab -->

# 放射の6枝

@diagram layout=radial center=issue width=1160 height=620
@item issue title="中心" level=high
@item question title="枝A"
短い本文
@item customer title="枝B"
短い本文
@item experience title="枝C"
少し長い本文を入れる
@item talk title="枝D"
短い本文
@item books title="枝E"
短い本文
@item words title="枝F"
短い本文
@link issue -- question
@link issue -- customer
@link issue -- experience
@link issue -- talk
@link issue -- books
@link issue -- words
@enddiagram

@footer
radial｜中心と6枝
@endfooter

---

<!-- milo: layout=lab -->

# 自由配置の合流

@canvas layout=free direction=right width=1260 height=540 route=curve
@node dislike frame=20,46,250,100 tone=muted
### 節点A
@node shared frame=20,374,250,108 tone=accent
### 節点B
@node nofriends frame=347,46,245,108
### 節点C
@node noidea frame=347,374,245,108
### 節点D
@node nearby frame=674,46,245,108
### 節点E
@node courage frame=674,374,245,108
### 節点F
@node lunch frame=991,198,245,138 tone=dark
### 合流
@edge dislike --> nofriends
@edge nofriends --> nearby
@edge nearby --> lunch
@edge shared --> noidea
@edge noidea --> courage
@edge courage --> lunch
@edge courage --> nofriends dashed=true tone=accent label="ラベル"
@endcanvas

@footer
free｜二つの流れが合流
@endfooter
