# Known Bugs

## Medium Priority

### TriggerWall side-deck height can disrupt deck layouts

When `derpTriggerWall` is decked to the side of a deck, it can very easily become very tall and screw up the entire layout.

We may need to clip a `REGION` display with a scrollbar, or figure out another approach. The current structure for setting up triggers is also confusing as frak and needs to be cleared up.

This is medium priority because it works right now, and PONY/SDXL workflows are not used as often these days.
