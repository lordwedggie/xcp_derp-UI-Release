# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">种子 V2</span>

![[derpSeedV2.jpg]]
给工作流输出一个种子值。点数字随机摇号，手动输也行，还能设成自动递增——跟抽奖似的往框里敲数字，太掉价了。

<span style="color: #ffc680"><strong>注意：</strong></span> 这节点走无线广播。下游用了老登加载器的话，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由。有线直连不用。

### <span style="color: #80ffc0">能干啥</span>

<span style="color: #80aaff"><strong>种子显示</strong></span>：大号数字，点一下随机。切编辑模式输你觉得有缘的那个数。

<span style="color: #80aaff"><strong>模式切换</strong></span>：随机、递增、固定、递减轮着来。随机每把出新种子，递增往上加，固定死不动，递减……你懂的。

<span style="color: #80aaff"><strong>执行按钮</strong></span>：播放键排队出图。ComfyUI 忙着的时候灰着，双重排队的后果是同一张图生成四十七份。

<span style="color: #80aaff"><strong>停止按钮</strong></span>：停下当前生成。只有真有事可停的时候才亮。

#### <span style="color: #80ffc0">系统面板里的玩意儿</span>

<span style="color: #80aaff"><strong>历史记录</strong></span>：保留几个之前的种子。越多越要翻，越翻越想不起来哪个是好的。

<span style="color: #80aaff"><strong>小数位数</strong></span>：种子显示几位数。默认 15，因为 ComfyUI 的种子又大又长，你的选择困难也是。

<span style="color: #80aaff"><strong>幸运数字</strong></span>：显示个"幸运数字"——有时候你只需要把锅甩给宇宙。

---

<span style="color: #ffc680"><strong>⚠ 注意：</strong>这节点用的是 Uncle 框架，不是 Fatha。所以有些布局问题修不了——跑是能正常跑，但偶尔间距对齐会抽风，忍忍吧。Fatha 版在路上了……等我哪天有心情跟种子逻辑死磕三天的时候。</span>