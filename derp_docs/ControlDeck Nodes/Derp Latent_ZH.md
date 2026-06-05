# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">潜空间</span>

![[derpLatent_01.jpg]]
生成一张空白的潜空间图。一切从这里开始——没模型，没 checkpoint，一张白纸，加上你那些值得商榷的分辨率选择。

<span style="color: #ffc680"><strong>注意：</strong></span> 这节点走无线广播。下游用了老登加载器的话，需要 [[Management Nodes/Derp Router|derpRouter]] 来路由。有线直连不用。

### <span style="color: #80ffc0">能干啥</span>

<span style="color: #80aaff"><strong>横竖切换</strong></span>：点一下横屏变竖屏，宽高自动对调。手动改是默认节点才干的事。

<span style="color: #80aaff"><strong>分辨率选择</strong></span>：点数字切预设。省得你一天打四十次 "512" 和 "768"。

<span style="color: #80aaff"><strong>批次数量</strong></span>：点数字改一次出几张图。最少 1，最多看你显存有多肥。

#### <span style="color: #80ffc0">系统面板里的玩意儿</span>

<span style="color: #80aaff"><strong>潜空间配置</strong></span>：自定义宽高预设。别老512×512，有点追求。

<span style="color: #80aaff"><strong>加载配置</strong></span>：保存、读取、改名、复制。SD1.5一套，SDXL一套，Flux一套——不用脑子记每个模型吃多大分辨率。