# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">路由器</span>

![[derpRouter_01.jpg]]
老登工作流的中央路由。在节点之间无线路由信号，让加载器们能互相通信——一根线都不用拉。

<span style="color: #ffc680"><strong>重要：</strong></span> 每个老登加载器都需要工作流中有至少一个路由器。请先添加此节点。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>信号检测</strong></span>：自动发现工作流中所有在广播无线信号的节点，显示检测数量和已添加数量。

<span style="color: #80aaff"><strong>添加信号</strong></span>：从检测到的信号中选择添加为输出，支持搜索——四五十个节点没人想一个个翻。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动输出信号重新排列。这个排序不是摆设——输出顺序会影响节点收多个信号时的行为。

<span style="color: #80aaff"><strong>刷新注册表</strong></span>：新加了节点？点一下就好，不用删了路由器再加回来。

<span style="color: #80aaff"><strong>跳转到节点</strong></span>：点一个信号条目，画布自动飞过去。流程早乱成蜘蛛网了，谁还记得 VAE 加载器扔哪了。

<span style="color: #80aaff"><strong>孤儿信号</strong></span>：已删除节点留下的信号会一闪一闪提醒你清理。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示 ID</strong></span>：在信号名称旁显示节点 ID。两个节点重名时能救命。

<span style="color: #80aaff"><strong>显示槽位名</strong></span>：显示完整节点名（含槽位后缀）。关了更清爽。

<span style="color: #80aaff"><strong>显示信号类型</strong></span>：每条信号后标注类型（MODEL、CLIP、VAE 等），信号多了就看出好了。

<span style="color: #80aaff"><strong>显示虚拟连线</strong></span>：路由器和连接的节点之间画虚拟线。纯视觉效果，但看着挺爽。

<span style="color: #80aaff"><strong>隐藏连接槽</strong></span>：开启后连接槽只在选中节点时显示，不然画布跟赛博朋克电路板似的。

<span style="color: #80aaff"><strong>排序方式</strong></span>：按名称、类型或 ID 排序信号列表。