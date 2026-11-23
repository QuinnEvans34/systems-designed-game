# Game sprite art

These transparent PNGs match the supplied scenes: stepped dark-plum outlines, clustered pixel shading, warm highlights, and muted pastel colors. Created with the built-in image generator using the original scenes and UI sheet as references. Exact prompts and source filenames are in [prompts.json](prompts.json).

| Assets | Size | Layout |
| --- | --- | --- |
| `cow-base.png`, `cow-chocolate.png`, `cow-strawberry.png`, `cow-doughnut.png`, `cow-almond.png` | 512 × 331 | One static idle sprite per file. The almond is just an almond shell with four legs, with no head or tail. |
| `chocolate-bar.png`, `strawberry-treat.png`, `latte-cup.png`, `almond-treat.png` | 96 × 96 | One centered inventory sprite per file. |
| `cow-eggnog.png`, `cow-skeleton.png` | 512 × 331 | Christmas eggnog cow and friendly skeleton cow, facing right with a shared hoof baseline. |
| `festive-spice.png`, `bone-biscuit.png` | 96 × 96 | Upgrade treats for almond → eggnog → skeleton. |
| `bottle-eggnog.png`, `bottle-skim.png` | 34 × 80 | Golden eggnog with a red cap and holly; white skim milk with a blue cap and bone label. |
| `return-pod.png` | 256 × 384 | The return craft seen flying away outside the ship window, with exhaust from its bottom engine. |
| `return-chute.png` | 1218 × 1292 | Fixed open return chute inside the ship. Generated with the built-in imagegen tool; prompt and references are recorded in `return-chute-prompt.json`. |
| `milker.png` | 384 × 256 | One housing with space for the live nameplate, status lamp and progress meter. |

The runtime uses nearest-neighbor rendering. The current game uses these single-frame cow sprites in the field, on the ship, in inventory, in the shop and in drag previews. Eating poses and animated resting indicators have been removed; exhausted cows still rest according to the game rules, using their static idle art. Sprite definitions live in `game/style.css` and `game/app.js`.

The eggnog and skeleton additions use the existing cow and item sprites as style references. Their exact prompts, source filenames, and export sizes are in [new-cows-prompts.json](new-cows-prompts.json). Both milk bottles also appear when market cats drink those products.

Text panels and controls share the stepped, slate-colored frame in `assets/ui/panel-frame.svg`, including the cow storage monitor, HUD, dialogue, inventory, market, tips, and status labels.
