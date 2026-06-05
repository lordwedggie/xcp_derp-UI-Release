# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">路由器</span>

![[derpRouter_01.jpg]]
老登工作流的中枢神经系统。在节点之间无线路由信号，让你的模型加载器、采样器加载器以及其他所有加载器能够互相通信，一根可见的线都不需要。没有这个节点，那些加载器都只是非常自信的镇纸。

<span style="color: #ffc680"><strong>重要：</strong></span> 每个老登加载器节点都需要工作流中至少有一个老登路由器。先加它。必须的。

### <span style="color: #80ffc0">功能</span>

<span style="color: #80aaff"><strong>信号检测</strong></span>：自动发现工作流中所有正在广播无线信号的节点。显示检测到的信号数量和已添加为输出的数量。

<span style="color: #80aaff"><strong>添加信号下拉菜单</strong></span>：浏览检测到的信号并将其添加为输出。内置搜索，毕竟你的工作流有四十几个节点，没人想一个一个翻。

<span style="color: #80aaff"><strong>拖拽排序输出</strong></span>：拖动输出信号重新排列。跟加载器面板不同，这个排序真的有用——输出顺序会影响节点接收多个信号时的优先级。

<span style="color: #80aaff"><strong>刷新注册表</strong></span>：工作流里加了新节点？点刷新，别像个疯子一样删了路由器再加回来。

<span style="color: #80aaff"><strong>跳转到节点</strong></span>：点击信号条目，画布自动跳转到广播该信号的节点。毕竟你的工作流已经乱成蜘蛛网了，你早忘了 VAE 加载器放哪了。

<span style="color: #80aaff"><strong>孤儿信号动画</strong></span>：来自已删除节点的信号会以微妙动画脉冲闪烁，直到你清理掉它们。用负罪感逼你维护工作流，一个孤儿信号都不放过。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示信号 ID</strong></span>：在信号名称旁边显示节点 ID。当两个节点名字相同你分不清谁是谁的时候很有用。

<span style="color: #80aaff"><strong>显示槽位名称</strong></span>：显示完整的节点名称包括槽位后缀。关掉它能让显示更简洁。

<span style="color: #80aaff"><strong>显示槽位类型</strong></span>：在每个条目后面追加信号类型（MODEL、CLIP、VAE 等）。路由冷门信号类型时特别有用。

<span style="color: #80aaff"><strong>显示虚拟链接</strong></span>：显示路由器与已连接节点之间的无线虚拟链接线。纯视觉效果，但看着很爽。

<span style="color: #80aaff"><strong>隐藏链接槽位</strong></span>：开启后，链接槽位只在节点被选中时显示。省得你的画布看起来像赛博朋克电路板。

<span style="color: #80aaff"><strong>信号排序方式</strong></span>：按名称、类型或 ID 对信号列表排序。每个人对列表该怎么排都有自己的执念。