# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">扩散模型加载器</span>

![image](../_assets/images/derpDiffusionLoader_01.jpg)
加载扩散模型文件到面板上，支持选择权重精度。CLIP 模型加载请使用单独的 [老登 CLIP 加载器](Derp%20Clip%20Loader_ZH.md)。

<span style="color: #ffc680"><strong>重要：</strong></span> 需要 [derpRouter](../Management%20Nodes/Derp%20Router.md) 才能工作。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>扩散模型面板</strong></span>：加载和切换扩散模型。点击激活，拖拽排序。

<span style="color: #80aaff"><strong>刷新</strong></span>：新增模型文件后更新列表。

<span style="color: #80aaff"><strong>清空</strong></span>：清空面板。面板为空时按钮禁用。

<span style="color: #80aaff"><strong>移除</strong></span>：单独删除一个条目。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动条目调整顺序。

<span style="color: #80aaff"><strong>搜索</strong></span>：输入关键字筛选模型列表。

<span style="color: #80aaff"><strong>设置开关</strong></span>：标题栏的 ⚙️ 按钮。面板加载完成后可关闭以隐藏文件浏览器，保持界面简洁。需要添加新模型时重新打开即可。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名</strong></span>：开关文件夹路径的显示。

<span style="color: #80aaff"><strong>权重精度</strong></span>：选择扩散模型的加载精度。可选：default、fp8_e4m3fn、fp8_e4m3fn_fast、fp8_e5m2。低精度占用更少显存。