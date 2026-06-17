# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Seed V2</span>

![image](../_assets/images/derpSeedV2.jpg)
Outputs a seed value for your workflow. Click the number to randomize it, type a specific seed, or set it to auto-increment — because typing random numbers into a box like some kind of lottery addict is beneath you.

<span style="color: #ffc680"><strong>Note:</strong></span> This node broadcasts its seed as a wireless signal. If you're using derp loaders downstream, you'll need a [derpRouter](../Management%20Nodes/Derp%20Router.md) to route it. 

### <span style="color: #80ffc0">Features</span>

<span style="color: #80aaff"><strong>Seed display</strong></span>: Shows the current seed in nice big digits. Click it to randomize, or switch to edit mode and type whatever cosmic number speaks to you.

<span style="color: #80aaff"><strong>Mode control</strong></span>: Cycles through Random, Increment, Fixed, and Decrement. Random gives you a new seed every queue. Increment counts up. Fixed stays the same until you change it. Decrement... well, you get it.

<span style="color: #80aaff"><strong>Execute button</strong></span>: The play button queues a prompt. Disabled while ComfyUI is busy because double-queuing is how you end up with 47 copies of the same image.

<span style="color: #80aaff"><strong>Stop button</strong></span>: Halts the current generation. Only lights up when there's actually something to stop.

#### <span style="color: #80ffc0">System Panel Options</span>

<span style="color: #80aaff"><strong>History Logs</strong></span>: How many previous seeds to keep in the history. More logs, more scrolling, more "wait, which one was the good one?"

<span style="color: #80aaff"><strong>Decimals</strong></span>: How many digits your seed should have. Default is 15 because ComfyUI seeds are massive and so is your indecision.

<span style="color: #80aaff"><strong>Lucky Num</strong></span>: Displays a "lucky number" — because sometimes you just need the universe to pick for you.

---

<span style="color: #ffc680"><strong>⚠ Warning:</strong> This node is built on the Uncle framework, not Fatha. As a result it has layout quirks that cannot be fixed without a full rewrite. It runs fine, but it'll occasionally do something weird with spacing or alignment and you'll just have to live with it. A Fatha-based replacement is planned... eventually... when I find the time and the will to stare at seed logic for three days straight.</span>

---

[? Back to Index](../INDEX.md)
