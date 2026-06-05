# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">种子 V2</span>

![[derpSeedV2.jpg]]
为工作流输出一个种子值。点数字随机摇号，手动输也行，还能设自动递增。

<span style="color: #ffc680"><strong>注意：</strong></span> 此节点以无线信号广播种子值。如果下游使用老登加载器，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>种子显示</strong></span>：大号数字，点一下随机，切编辑模式手动输入那个你觉得有缘的数。

<span style="color: #80aaff"><strong>模式切换</strong></span>：随机、递增、固定、递减轮着来。随机每把出新种子，递增往上加，固定不动，递减往下减。

<span style="color: #80aaff"><strong>执行按钮</strong></span>：排队出图。ComfyUI 忙碌时禁用——双重排队的后果是同一张图生成四十七份。

<span style="color: #80aaff"><strong>停止按钮</strong></span>：停止当前生成。仅在工作时有反应。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>历史记录</strong></span>：保留多少个之前的种子值。越多越要翻，翻着翻着就忘了哪个是好的。

<span style="color: #80aaff"><strong>小数位数</strong></span>：种子显示的位数。默认 15。

<span style="color: #80aaff"><strong>幸运数字</strong></span>：显示一个随机幸运数——有时候你只需要把锅甩给宇宙。

---

<span style="color: #ffc680"><strong>⚠ 注意：</strong>此节点基于 Uncle 框架构建，而非 Fatha。存在一些无法通过补丁修复的布局问题，不影响正常使用。计划未来用 Fatha 重写。</span>