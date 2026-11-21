---
title: 検査の確認
---

<!-- milo: layout=lab -->

# 問題のないスライド

短い段落です。

- 項目A
- 項目B

---

<!-- milo: layout=lab -->

# 下にはみ出す

- 一つ目の項目
- 二つ目の項目
- 三つ目の項目
- 四つ目の項目
- 五つ目の項目
- 六つ目の項目
- 七つ目の項目
- 八つ目の項目
- 九つ目の項目
- 十番目の項目
- 十一番目の項目
- 十二番目の項目
- 十三番目の項目
- 最後に見えない項目

---

<!-- milo: layout=lab -->

# 枠の中で切れる

```
const aVeryLongIdentifierName = someFunctionWithAVeryLongName(argumentNumberOne, argumentNumberTwo, argumentNumberThree, argumentNumberFour, argumentNumberFive);
```

---

<!-- milo: layout=lab -->

# 図が収まらない

@diagram layout=radial center=problem
@item problem title="中心"
@item a title="非常に長いカードA" side=top distance=near
@item b title="非常に長いカードB" side=top distance=near
@item c title="非常に長いカードC" side=top distance=near
@item d title="非常に長いカードD" side=top distance=near
@link problem -- a
@link problem -- b
@link problem -- c
@link problem -- d
@enddiagram

---

<!-- milo: layout=lab -->

# 記法と画像の誤り

@box tone=purple
色の指定が誤っている
@endbox

![外部の画像](https://example.com/missing.png)
