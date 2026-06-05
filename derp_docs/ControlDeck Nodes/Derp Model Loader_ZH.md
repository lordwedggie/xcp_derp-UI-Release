# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">模型加载器</span>

![[derpModelLoader_01.jpg]]
把 SDXL 模型（.safetensors / .pt）加载到面板上，点一下就能切换——告别下拉菜单，告别在两百多个叫"最终版_v3_真不改了"的文件里扒拉。

<span style="color: #ffc680"><strong>重要：</strong></span> 需要 [[Management Nodes/Derp Router|derpRouter]] 才能工作。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>刷新</strong></span>：下了新模型？点一下，不用重启 ComfyUI。

<span style="color: #80aaff"><strong>移除</strong></span>：从面板上删掉一个模型。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动条目调整顺序，纯属强迫症福利——不影响实际输出。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名</strong></span>：开关文件夹路径的显示。关了就不用直视自己那混乱的目录结构了。

<span style="color: #80aaff"><strong>切换模型时清显存</strong></span>：换模型自动释放 VRAM。默认开着，毕竟 ComfyUI 的内存管理懂的都懂。

<span style="color: #80aaff"><strong>加载配置</strong></span>：保存、读取、改名、复制面板排列。给不同用途准备不同的模型组合。默认配置为空——每个人的文件夹结构都不一样，这题没法代答。