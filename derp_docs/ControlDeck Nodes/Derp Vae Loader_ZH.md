# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">VAE 加载器</span>

![image](../_assets/images/derpVaeLoader_01.jpg)
把 VAE 文件（.safetensors / .pt / .ckpt）加载到面板上，一键切换。支持直接从模型文件里提取 VAE，不用单独下载。

<span style="color: #ffc680"><strong>重要：</strong></span> 需要 [derpRouter](../Management%20Nodes/Derp%20Router.md) 才能工作。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>刷新</strong></span>：新 VAE 文件加入文件夹后点一下，不用重启。

<span style="color: #80aaff"><strong>移除</strong></span>：从面板上删掉一个 VAE。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动 VAE 条目调整顺序。

<span style="color: #80aaff"><strong>搜索</strong></span>：输入关键字筛选 VAE 列表。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名</strong></span>：开关 VAE 条目中文件夹路径的显示。

<span style="color: #80aaff"><strong>从模型提取 VAE</strong></span>：开启后，文件浏览器会指向模型目录，直接从 checkpoint 文件里读取 VAE，不需要单独的 VAE 文件夹。