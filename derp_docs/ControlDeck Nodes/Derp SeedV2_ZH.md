# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">种子 V2</span>

![[derpSeedV2.jpg]]
为工作流输出一个种子值。点击数字随机生成，手动输入指定种子，或者设为自动递增——像抽奖上瘾者一样往框里敲随机数，太掉价了。

<span style="color: #ffc680"><strong>注意：</strong></span> 此节点以无线信号形式广播种子值。如果下游使用老登加载器，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由信号。

### <span style="color: #80ffc0">功能</span>

<span style="color: #80aaff"><strong>种子显示</strong></span>：用大号数字显示当前种子。点击随机化，或切换到编辑模式输入任何你觉得有缘的数字。

<span style="color: #80aaff"><strong>模式控制</strong></span>：在随机、递增、固定、递减之间循环切换。随机模式每次队列给新种子。递增往上加。固定不变直到你手动改。递减……你懂的。

<span style="color: #80aaff"><strong>执行按钮</strong></span>：播放按钮触发队列。ComfyUI 忙碌时禁用——双重队列的后果是同一张图生成 47 份。

<span style="color: #80aaff"><strong>停止按钮</strong></span>：停止当前生成。只有确实有东西可停的时候才亮。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>历史记录</strong></span>：保留多少个之前的种子。越多记录，越要翻，越会想"等等，刚才那个好的到底是哪个？"

<span style="color: #80aaff"><strong>小数位数</strong></span>：种子显示多少位数字。默认 15，因为 ComfyUI 的种子很大，你的选择困难症也很大。

<span style="color: #80aaff"><strong>幸运数字</strong></span>：显示一个"幸运数字"——有时候你只需要让宇宙帮你选。

---

<span style="color: #ffc680"><strong>⚠ 警告：</strong>此节点基于 Uncle 框架构建，而非 Fatha。因此存在无法通过补丁修复的布局问题。跑是能正常跑，但偶尔会在间距或对齐上抽风，你只能忍了。基于 Fatha 的替代版本正在计划中……等我有空、有精力盯着种子逻辑连续肝三天的时候吧。</span>