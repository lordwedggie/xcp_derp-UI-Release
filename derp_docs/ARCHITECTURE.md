# Architecture

xcp_derp-UI (v0.7.10) replaces ComfyUI/LiteGraph node rendering with custom systems.

## Frameworks

| Framework | Path | Role |
|-----------|------|------|
| Fatha | `js/fatha/` | Virtual node/layout orchestration, draw lifecycle, docking, DOM shield, content viewport |
| Herbina | `js/herbina/` | Widget library, canvas/HTML painters, animation, sound |
| Basta | `js/fatha/basta.js` | Floating screen-space overlay panels |
| Motha | `js/motha/` | Theme, palette, effect, theme-weight systems |
| Backend | `python/` | Node shells, HTTP routes (`python/xcp_routes/`), LoRA API, asset sync |

## Node Categories

- `js/derps/loaders/` — Model, CLIP, VAE, Diffusion, Sampler, Scheduler loaders
- `js/derps/controldeck/` — ImageDeck, LoraStack, SeedV2/V3, Slider, Toggle, TriggerWall, PromptBook
- `js/derps/utils/` — Concatenate, Notes, Skunk, SliderV2Editor
- `js/derpSignalOut.js` — Wireless signal router

## Full Documentation

Canonical framework docs and developer notes live in the knowledge base at
`D:\_AI_KnowledgeBase\derp-UI\`. For agents, load the `derp-ui-dev` skill.
