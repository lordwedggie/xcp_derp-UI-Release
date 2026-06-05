# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">VAE 加载器</span>

![[derpVaeLoader_01.jpg]]
把 VAE 文件加载到面板上，一键切换。支持直接从模型文件里提取 VAE——单独下载？那是给硬盘空间太多的人准备的。

<span style="color: #ffc680"><strong>重要：</strong></span> 需要 [[Management Nodes/Derp Router|derpRouter]] 才能工作。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>刷新</strong></span>：新 VAE 进文件夹了？点一下，不用重启。

<span style="color: #80aaff"><strong>移除</strong></span>：从面板上删掉一个 VAE。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动条目调整顺序。

<span style="color: #80aaff"><strong>搜索</strong></span>：敲关键字筛选，不用在几十个 "vae-ft-mse-840000-ema-pruned" 里翻白眼。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名</strong></span>：开关文件夹路径的显示。

<span style="color: #80aaff"><strong>从模型提取 VAE</strong></span>：开启后浏览器指向模型目录，直接从 checkpoint 里读 VAE。少管一个文件夹，少忘下一件事。