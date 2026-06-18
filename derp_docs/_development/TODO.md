# TODO — Future Nodes & Features

## Planned Nodes

- [ ] **Derp Book Browser** — browse and load prompt books with preview
    > [!NOTE]- Details
    > - Can load and display the content of standard markdown files (GitHub) correctly.
    > - Can view and play embedded video files.
    > - As per 0.8x spec it needs to be a hybrid again, not just canvas-only.

- [ ] **Derp Image Gallery** — grid view of generated images with metadata overlay
    > [!NOTE]- Details
    > - 

- [ ] **Derp Workflow Snapshot** — save/restore partial workflow states
    > [!NOTE]- Details
    > - 

## Planned Features

- [x] **Collapsed header `_ON` theme colors** — `headerMain.btnColor` needs palette + theme-aware `_ON` when collapsed
    > [!NOTE]- Details
    > - 

- [ ] **SVG icon system for ICONBUTTON** — SVG paths cached to `ImageBitmap`, zero runtime overhead
    > [!NOTE]- Details
    > - 

- [ ] **Browser UI for local LLMs** — auto-inject character `.md` files into system prompt
    > [!NOTE]- Details
    > - 

- [ ] **Deck Pressure V2** — stable multi-branch docking with per-branch collapse groups
    > [!NOTE]- Details
    > - 

- [ ] **Theme weight live preview** — real-time preview when editing weight files
    > [!NOTE]- Details
    > - 

- [ ] **Palette string color hot-reload** — reload `_defaultPalette.json` without full theme refresh
    > [!NOTE]- Details
    > - 

- [ ] **Wireless signal graph viz** — visual overlay showing wireless connections between nodes
    > [!NOTE]- Details
    > - 

## Polish / UX

- [ ] **Picker Header Row** — Assign unused _ON key from '#'picker optional key
    > [!NOTE]- Details
    > - 

- [ ] **Drag-select multiple nodes in docked stacks**
    > [!NOTE]- Details
    > - 

- [ ] **Undo for dock/undock operations**
    > [!NOTE]- Details
    > - 

- [ ] **Node search/filter in canvas** — Ctrl+F
    > [!NOTE]- Details
    > - 

## Performance

- [ ] **Lazy-load inactive docked branches** — don't render off-screen members
    > [!NOTE]- Details
    > - 

- [ ] **Shared ImageBitmap cache for ICONBUTTON glyphs** — SVG → Canvas → ImageBitmap
    > [!NOTE]- Details
    > - 

- [ ] **Incremental layout rebuild** — only dirty regions, not full node
    > [!NOTE]- Details
    > - 
