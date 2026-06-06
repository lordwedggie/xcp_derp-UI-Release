# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">串联器</span>

无线 STRING 信号串联节点。从画布各处选择多个信号，无需连线，将它们拼接成一个文本输出。信号数量无上限。拖拽排序，右键隐藏预览，由 derpRouter 负责路由分发。

---

## 工作原理

这个节点不接收有线连接。它监听无线信号注册表，让你选择要组合的 STRING 类型信号。每个选中的信号都会有一个独立的条目，显示实时文本预览，组合结果会作为新的无线信号广播出去，供 derpRouter 或其他无线接收器使用。

<span style="color: #80aaff"><strong>选择信号</strong></span> 通过节点底部的下拉菜单。只有来自 signalOut 节点的 STRING 类型信号会显示。

<span style="color: #80aaff"><strong>拖拽排序</strong></span> 任意信号条目上下移动。串联顺序按照视觉效果从上到下排列。

<span style="color: #80aaff"><strong>切换预览</strong></span> 右键点击任意信号条目可显示或隐藏其文本预览。信号较多时可隐藏预览以保持节点紧凑。

<span style="color: #80aaff"><strong>移除信号</strong></span> 通过每个条目上的关闭按钮。

<span style="color: #80aaff"><strong>自动调整大小</strong></span> 节点高度会随信号增减自动变化。宽度固定为 180px。

<span style="color: #80aaff"><strong>循环保护</strong></span> 防止选择串联器下游节点的信号，避免无限信号循环。

---

<span style="color: #ffc680">**注意：**</span> 此节点需要 [derpRouter](../Management%20Nodes/Derp%20Router.md) 来将输出路由到接收器。有线连接对它无效，它是纯无线节点。

---

## 端口

| 端口 | 方向 | 类型 | 描述 |
|------|------|------|------|
| Output | 输出 | STRING | 所有选中信号串联后的结果 |
