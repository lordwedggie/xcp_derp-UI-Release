# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">CLIP 加载器</span>

![image](../_assets/images/derpClipLoader_01.jpg)
加载 CLIP 模型文件，支持配置权重精度和设备设置。兼容 23 种不同的 CLIP 架构。

<span style="color: #ffc680"><strong>重要：</strong></span> 需要 [derpRouter](../Management%20Nodes/Derp%20Router.md) 才能工作。

### <span style="color: #80ffc0">能干什么</span>

<span style="color: #80aaff"><strong>CLIP 模型面板</strong></span>：将 CLIP 文件加载到面板上，一键切换。

<span style="color: #80aaff"><strong>刷新</strong></span>：新增 CLIP 文件后更新列表。

<span style="color: #80aaff"><strong>清空</strong></span>：清空整个面板。面板为空时按钮禁用。

<span style="color: #80aaff"><strong>移除</strong></span>：单独删除一个 CLIP 条目。

<span style="color: #80aaff"><strong>拖拽排序</strong></span>：拖动条目调整顺序。

<span style="color: #80aaff"><strong>搜索</strong></span>：关键字筛选 CLIP 列表。

<span style="color: #80aaff"><strong>设置开关</strong></span>：标题栏的 ⚙️ 按钮。面板加载完成后可关闭以隐藏文件浏览器和 CLIP 类型/设备选项，保持界面简洁。需要添加新模型或修改设置时重新打开即可。

#### <span style="color: #80ffc0">节点内选项（⚙️ 开启时可见）</span>

<span style="color: #80aaff"><strong>CLIP 类型</strong></span>：选择 CLIP 模型的架构类型。共 23 种，从 stable_diffusion 到 ideogram4。

<span style="color: #80aaff"><strong>CLIP 设备</strong></span>：选择加载位置——default（GPU）或 cpu。显存不足时可卸载到 CPU。

#### <span style="color: #80ffc0">系统面板选项</span>

<span style="color: #80aaff"><strong>显示文件夹名</strong></span>：开关文件夹路径的显示。

---

[? Back to Index](../INDEX.md)
