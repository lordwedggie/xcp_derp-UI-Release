# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">潜空间</span>

![[derpLatent_01.jpg]]
生成一张空白的 latent 图像，可配置宽、高和批次数量。

<span style="color: #ffc680"><strong>注意：</strong></span> 此节点以无线信号广播输出。如果下游使用老登加载器，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>横竖切换</strong></span>：在横屏和竖屏模式之间切换，宽高自动对调。

<span style="color: #80aaff"><strong>分辨率选择</strong></span>：点击分辨率数字循环切换预设尺寸。

<span style="color: #80aaff"><strong>批次数量</strong></span>：点击数字编辑一次生成的 latent 数量。最小 1。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>潜空间配置</strong></span>：创建和管理分辨率预设，自定义宽高组合。

<span style="color: #80aaff"><strong>加载配置</strong></span>：保存、读取、改名、复制配置文件。可为不同模型（SD1.5、SDXL、Flux 等）分别准备分辨率预设。