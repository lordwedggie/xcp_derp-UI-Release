# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">种子 V2</span>

![[derpSeedV2.jpg]]
管种子的！你可以让它随机生成一个数字，也可以自己输，还可以让它每次自动加 1。我一般用随机，因为选数字好累。

<span style="color: #ffc680"><strong>注意：</strong></span> 这个节点是通过无线信号发出去的。如果你后面用了老登加载器，需要 [[Management Nodes/Derp Router|derpRouter]] 来帮忙传信号。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>种子显示</strong></span>：好大一个数字！点一下就变成随机的新数字。你也可以切到编辑模式自己打。

<span style="color: #80aaff"><strong>模式切换</strong></span>：随机、递增、固定、递减，四种模式来回切。随机就是每次出图给个新数字，递增就每次加 1，固定就不变，递减就每次减 1。

<span style="color: #80aaff"><strong>执行按钮</strong></span>：按这个就开始出图。如果 ComfyUI 正在忙，它会变灰，因为不能同时跑两次嘛——不然会出来一堆一样的图。

<span style="color: #80aaff"><strong>停止按钮</strong></span>：不想跑了就按这个停下来。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>历史记录</strong></span>：保存之前用过哪些种子。存多了要翻好久才能找到哪个是好的……

<span style="color: #80aaff"><strong>小数位数</strong></span>：种子数字显示几位。默认 15 位，好长。

<span style="color: #80aaff"><strong>幸运数字</strong></span>：显示一个随机数，可能是好运气的数字吧，我也不知道，但看着挺开心的。

---

<span style="color: #ffc680"><strong>⚠ 注意：</strong>这个节点用的是 Uncle 框架，不是 Fatha。所以偶尔布局会有点怪怪的，但不影响使用。等我学会 Fatha 了就给它重写一个！</span>