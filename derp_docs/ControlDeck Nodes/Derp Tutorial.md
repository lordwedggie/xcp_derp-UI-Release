# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Tutorial</span>

Derp Tutorial is the little welcome mat for derp-UI. On a fresh install it appears in the current graph, then lets you open bundled tutorial workflows in new ComfyUI tabs.

### <span style="color: #80ffc0">What It Does</span>

<span style="color: #80aaff"><strong>Intro panel</strong></span>: Gives new users a short starting point without replacing the workflow they already have open.

<span style="color: #80aaff"><strong>Workflow buttons</strong></span>: Each button opens a bundled tutorial workflow in a new browser tab. The click comes from you, so browsers are much less likely to block it.

<span style="color: #80aaff"><strong>Auto-show toggle</strong></span>: Turn on <strong>Do not auto show this tutorial again</strong> to stop this tutorial major version from appearing on startup. A future major tutorial version can still show up if there is something important to explain.

### <span style="color: #80ffc0">Tutorial Workflow Files</span>

Bundled tutorial workflows live under:

`user/derpNodes/workflows/tutorials/`

Files in that folder are listed as buttons on the node face. For example, `user/derpNodes/workflows/tutorials/basics.json` appears as a tutorial button and loads through `/xcp/load/workflows?name=tutorials/basics`.

---

[? Back to Index](../INDEX.md)
