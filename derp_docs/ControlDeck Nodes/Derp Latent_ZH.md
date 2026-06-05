# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">潜空间</span>

![[derpLatent_01.jpg]]
生成一张空白的 latent 图像，可配置宽、高和批次数量。一切从这里开始——没模型，没 checkpoint，就一张白纸。

<span style="color: #ffc680"><strong>注意：</strong></span> 此节点以无线信号广播输出。如果下游使用老登加载器，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>横竖切换</strong></span>：在横屏和竖屏之间切换，宽高自动对调——手动改是默认节点才干的事。

<span style="color: #80aaff"><strong>分辨率选择</strong></span>：点数字循环切换预设尺寸，省得一天打四十次 "512"。

<span style="color: #80aaff"><strong>批次数量</strong></span>：点数字编辑一次生成的 latent 数量。最小 1。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>潜空间配置</strong></span>：创建和管理分辨率预设，自定义宽高组合。

<span style="color: #80aaff"><strong>加载配置</strong></span>：保存、读取、改名、复制配置文件。SD1.5 一套，SDXL 一套，Flux 一套——不用脑子记每个模型吃多大分辨率。