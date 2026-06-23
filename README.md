xcp_derp-UI gives ComfyUI workflows cleaner, more intentional control surfaces without changing how the underlying graph works. It layers custom layouts, wireless routing, docking, stacking, and live theme control on top of familiar workflows, so complex setups stay readable, easier to drive, and much less likely to resemble a nervous spaghetti incident. Built for speed, built for control, and built for people who want their canvas to act like it was raised properly.
![[derp_docs/_assets/videos/test.faststart.mp4]]
## Key features
 **Themes support:** Unlike default ComfyUI nodes that only allow you to change the node's overall color (from a tiny selection), derp-UI nodes can use themes that can completely change the look of the node. 
 **Nodes Stacking:** Unlike default ComfyUI's clumsy Group method, derp-UI nodes can connect to each other vertically or horizontally into stacks, they will then behave like a single node, with multiple functions depending on the individual nodes in the stack.
 **Decking:** Special derp nodes such as Derp Image Deck allows Derp nodes or Stacks to be 'Decked' to any of its side edges, allowing fast and easy custom build UI surfaces for all your workflow needs.
 **Theme Extender:** You can assign any derp Theme to a default ComfyUI node via the right-click context menu in NODE 2.0. Default nodes use limited colors and settings than derp Nodes do, but hey, it's better than just color overlay!
 **Wireless signals:** All Derp nodes uses wireless signals for data transfer, you can tuck the real workhorse of your default ComfyUI nodes a mile away and not worry about spaghetti wires disrupting the wires view.
 **Wireless extenders:** You can also allow default ComfyUI nodes to emit wireless signals that derp-UI nodes receives, by using the default right-click context menu and assign a derp Wireless Extender to it.
 


---

xcp_derp-UI currently includes **25 nodes**: 7 Loader nodes (Model, Diffusion, CLIP, VAE, Sampler, Scheduler, LoRA Stack), 5 ControlDeck interactive nodes (Slider, Toggle, Swatch, Trigger Wall, Prompt Book), 3 Generator nodes (Latent, Seed V2, Image Deck), 5 Utility nodes (Concatenate, String V3, Skunk Works, Notes, Theme Manager V2), 2 Template nodes (Fatha + Uncle), 1 Management node (Router), and 2 Extenders (Bypass Extender, Wireless Extender).

[Full Node Index →](derp_docs/INDEX.md)
