# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">VAE 加载器</span>

![[derpVaeLoader_01.jpg]]
将 VAE 文件（.safetensors, .pt, .ckpt）加载到节点面板上，一键切换，再也不用碰那个反人类的默认下拉菜单。还能直接从模型文件里把 VAE 薅出来——单独下载 VAE 是给时间太多的人准备的。

<span style="color: #ffc680"><strong>重要：</strong></span> 此加载器需要 [[Management Nodes/Derp Router|derpRouter]] 才能工作。没有它，这玩意儿就是个装饰性方块。

### <span style="color: #80ffc0">功能</span>

<span style="color: #80aaff"><strong>刷新按钮</strong></span>：文件夹里冒出新的 VAE 了？点这个，别像活在 2022 年一样重启 ComfyUI。

<span style="color: #80aaff"><strong>移除按钮</strong></span>：把 VAE 从面板上踹走。它会自己找到回家的路。大概。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：按你当下的心情重新排列 VAE。纯外观——工作流不在乎，但你也许在乎。

<span style="color: #80aaff"><strong>搜索标签</strong></span>：输入关键字筛选 VAE 列表，不用在八十多个叫 "vae-ft-mse-840000-ema-pruned" 的文件里滚来滚去。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名称</strong></span>：切换 VAE 显示中的文件夹路径。如果你的目录名字让你尴尬，关掉就好。

<span style="color: #80aaff"><strong>从模型中提取 VAE</strong></span>：不用指向专门的 VAE 文件夹，直接把文件浏览器切到模型目录，从 checkpoint 文件里提取 VAE。少管一个文件夹，少忘下载一个东西。