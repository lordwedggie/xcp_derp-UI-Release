# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">模型加载器</span>

![[derpModelLoader_01.jpg]]
将 SDXL 模型（.safetensors 和 .pt 文件）加载到节点面板上，单击即可热切换模型——不用下拉菜单，不用在一堆叫 "final_final_v3_actually_final" 的文件里大海捞针。

<span style="color: #ffc680"><strong>重要：</strong></span> 此加载器需要 [[Management Nodes/Derp Router|derpRouter]] 才能工作。没有它，这玩意儿就是个花哨的镇纸。

### <span style="color: #80ffc0">功能</span>

<span style="color: #80aaff"><strong>刷新按钮</strong></span>：文件夹里有新模型了？点这个，别像个原始人一样重启 ComfyUI。

<span style="color: #80aaff"><strong>移除按钮</strong></span>：把模型从面板上踢出去。它不会记仇。大概。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动模型条目重新排列。纯外观——不会影响工作流输出，但能满足你的强迫症。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名称</strong></span>：切换模型显示中的文件夹路径。关掉它，就不用面对你那混乱的目录结构了。

<span style="color: #80aaff"><strong>切换模型时清除显存</strong></span>：选择新模型时立刻清空显存。默认开启，因为 ComfyUI 的内存管理已经够拉胯了，不需要你再囤积几个 G。

<span style="color: #80aaff"><strong>加载设置</strong></span>：保存、加载、重命名和复制面板排列——"人像模型"专用面板、"建筑渲染"专用面板，随你怎么分。默认配置故意留空，因为你的模型散落在十七个文件夹里，文件名还不一致，除了你自己没人能理清。