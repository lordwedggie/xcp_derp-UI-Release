# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">路由器</span>

![[derpRouter_01.jpg]]
老登工作流的中央路由节点。在节点之间无线路由信号，让加载器节点能够互相通信，无需手动连线。

<span style="color: #ffc680"><strong>重要：</strong></span> 每个老登加载器节点都需要工作流中有至少一个路由器。请先添加此节点。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>信号检测</strong></span>：自动发现工作流中所有正在广播无线信号的节点，显示检测数量和已添加数量。

<span style="color: #80aaff"><strong>添加信号</strong></span>：从检测到的信号中选择添加为输出，支持搜索。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动输出信号重新排列。输出顺序会影响节点接收多个信号时的优先级。

<span style="color: #80aaff"><strong>刷新注册表</strong></span>：添加新节点后刷新信号列表，无需删除并重新添加路由器。

<span style="color: #80aaff"><strong>跳转到节点</strong></span>：点击信号条目，画布自动定位到对应的广播节点。

<span style="color: #80aaff"><strong>孤儿信号</strong></span>：已删除节点留下的信号会闪烁提示，方便清理。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示 ID</strong></span>：在信号名称旁显示节点 ID。节点重名时便于区分。

<span style="color: #80aaff"><strong>显示槽位名</strong></span>：显示完整节点名（含槽位后缀）。关闭后显示更简洁。

<span style="color: #80aaff"><strong>显示信号类型</strong></span>：在每条信号后标注类型（MODEL、CLIP、VAE 等）。

<span style="color: #80aaff"><strong>显示虚拟连线</strong></span>：显示路由器与连接节点之间的无线虚拟连线，纯视觉效果。

<span style="color: #80aaff"><strong>隐藏连接槽</strong></span>：开启后连接槽仅在节点被选中时显示，保持画布整洁。

<span style="color: #80aaff"><strong>排序方式</strong></span>：按名称、类型或 ID 排序信号列表。