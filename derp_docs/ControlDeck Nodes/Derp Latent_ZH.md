# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">潜空间</span>

![[derpLatent_01.jpg]]
生成一个可配置宽度、高度和批次数量的空白潜空间。一切从这里开始——没有模型，没有 checkpoint，只有一张白纸和你那令人质疑的分辨率选择。

<span style="color: #ffc680"><strong>注意：</strong></span> 此节点以无线信号形式广播输出。如果下游使用老登加载器，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由信号。

### <span style="color: #80ffc0">功能</span>

<span style="color: #80aaff"><strong>横竖屏切换</strong></span>：点击在横屏和竖屏模式之间切换。自动交换宽高——手动调是默认节点才干的事。

<span style="color: #80aaff"><strong>分辨率选择器</strong></span>：点击分辨率显示来循环切换预设尺寸。省得你一天打四十遍 "512" 和 "768"。

<span style="color: #80aaff"><strong>批次数量</strong></span>：点击数字编辑一次生成多少个潜空间。最小 1，最大看你愿意牺牲多少显存。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>潜空间配置</strong></span>：创建和管理分辨率预设。自定义宽高组合，别老是用 512×512 和 768×768。

<span style="color: #80aaff"><strong>加载设置</strong></span>：保存、加载、重命名和复制配置文件。给 SD1.5、SDXL、Flux 分别准备一套预设——不用脑子记你的模型到底吃哪种分辨率。