# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">路由器</span>

![[derpRouter_01.jpg]]
老登工作流的中央神经。在节点之间无线路由信号，让你的模型加载器、采样器加载器等等能互相唠嗑，一根线都不用拉。没这东西，上面那些加载器全是高价镇纸。

<span style="color: #ffc680"><strong>重要：</strong></span> 每个老登加载器都得有至少一个路由器在流程里。先加它，必须的。

### <span style="color: #80ffc0">能干啥</span>

<span style="color: #80aaff"><strong>信号检测</strong></span>：自动发现流程里所有在发无线信号的节点。告诉你测到几个、加了几个。

<span style="color: #80aaff"><strong>添加信号</strong></span>：从检测到的信号里挑着加。带搜索，流程里四五十个节点谁一个一个翻。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：输出可以拖来拖去重新排。跟加载器面板不一样，这个排序是认真的——输出顺序会直接影响节点收多个信号时的行为。

<span style="color: #80aaff"><strong>刷新注册表</strong></span>：新加了节点？点一下，别傻乎乎删了路由器再加回来。

<span style="color: #80aaff"><strong>跳到节点</strong></span>：点一个信号条目，画布直接飞过去。流程早乱成蜘蛛网了，谁还记得 VAE 加载器扔哪了。

<span style="color: #80aaff"><strong>孤儿信号</strong></span>：删掉的节点留下的信号会一闪一闪的，提醒你该清理了。

#### <span style="color: #80ffc0">系统面板里的玩意儿</span>

<span style="color: #80aaff"><strong>显示 ID</strong></span>：信号名旁边跟个节点 ID。两个节点重名的时候能救命。

<span style="color: #80aaff"><strong>显示槽位名</strong></span>：完整节点名包括槽位后缀。关掉清爽。

<span style="color: #80aaff"><strong>显示信号类型</strong></span>：每条后面标上 MODEL、CLIP、VAE。信号类型多了就看出来好了。

<span style="color: #80aaff"><strong>显示虚拟连线</strong></span>：路由器和连着的节点之间画虚拟线。好看，但没啥实际用。

<span style="color: #80aaff"><strong>隐藏连接槽</strong></span>：开了之后连接槽只在点中节点时显示。不然画布跟赛博朋克电路板似的。

<span style="color: #80aaff"><strong>排序方式</strong></span>：按名字、类型还是 ID 排。每个人对"该怎么排"都有执念。