# <span style="color: #ff8080">老登</span> <span style="color: #ffffff">教程</span>

Derp Tutorial 是 derp-UI 的入门节点。新安装后，它会出现在当前工作流中，然后让你在新的 ComfyUI 标签页中打开预置教程工作流。

### <span style="color: #80ffc0">功能</span>

<span style="color: #80aaff"><strong>简介区域</strong></span>：给新用户一个简短的起点，不会直接替换当前工作流。

<span style="color: #80aaff"><strong>工作流按钮</strong></span>：每个按钮都会在新标签页中打开一个预置教程工作流。这是用户点击触发，浏览器不太会把它当成未授权弹窗。

<span style="color: #80aaff"><strong>自动显示开关</strong></span>：打开 <strong>不再自动显示这个教程</strong> 后，当前主版本的教程不会在启动时再自动出现。以后如果有新的主版本教程，仍然可以再次显示。

### <span style="color: #80ffc0">教程工作流文件</span>

预置教程工作流位于：

`user/derpNodes/workflows/tutorials/`

该文件夹下的文件会显示为节点按钮。例如，`user/derpNodes/workflows/tutorials/basics.json` 会显示为一个教程按钮，并通过 `/xcp/load/workflows?name=tutorials/basics` 加载。

---

[? 返回索引](../INDEX_ZH.md)
