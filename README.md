# Moo-ving Violations

A single-player game about a little alien with a very big dairy dream. Beam up Earth cows, milk them one at a time aboard your saucer, upgrade them into fancier cows, and sell the milk at the Galactic Marketplace.

The illustrated backgrounds are the game. You click the UFO, the cows, the ship's machines and the market stands directly in the scenes.

## Play

Open **[index.html](index.html)** in a modern browser, keeping `game/` and `assets/` beside it. No install, build, account, or internet connection is required.

Or use Node 18 or later:

```sh
npm start
```

Visit **http://localhost:4173**. On Windows PowerShell, use `npm.cmd start` if execution policy blocks `npm.ps1`.

## How to play

Choose **Play** to start freely, or **Play with tutorial** for Miso's short introduction. The tutorial follows just your first cow through beaming, milking and selling one bottle. After the sale, click any highlighted market stand for a brief overview of all three stands and how ship and cow upgrades work. No purchase is required; dismiss the explanation and play freely. You can skip the tutorial at any time, and its progress saves with your dairy.

1. **Field.** Move the UFO with the mouse or **← →**. When a cow glows under it, **click or press Space** to beam it up. Each beam raises Earth's suspicion.
2. **Ship.** The first cow aboard teleports onto an empty milking pad when you enter the ship. Click a cow hologram on the bottom control panel, or drag it onto the pad, to teleport another cow in. The podium beside the pad displays its name, status and milking progress. Press **MILK** on the overhead milker (or **M**). One cow gives one bottle of its milk.
3. **Upgrade.** Click the **cow storage monitor** and drag a treat onto a cow: base → chocolate → strawberry → doughnut → almond.
4. **Send it home.** Milked or upgraded cows are exhausted. Use the podium's down arrow or drag a cow onto the **return chute** and watch their pod fly away outside. The podium's return arrow teleports the cow back to storage. Exhausted cows rest in the field before they can be beamed again.
5. **Market.** The left stand buys milk, the middle stand upgrades your ship, and the right stand sells new cows and treats.

Press **I** (or the INVENTORY button) anywhere to see your milk, items and cows. Keys **1 / 2 / 3** travel between scenes. Progress saves automatically in this browser. The ☰ menu has a field guide, fullscreen, backup download/restore, and a confirmed fresh start.

All prices, capacities and upgrade values are listed in [docs/digital-rules.md](docs/digital-rules.md).

## Changing game values

Every number in the game lives in **[game_config.yaml](game_config.yaml)**. That includes starting coins and cows, milk prices, treat costs, ship upgrade starting values, increments, cost multipliers and max levels, rest time, the herd limit, and suspicion. Each value has a comment explaining it.

- **With `npm start`:** save the file and refresh the browser. The server picks up changes automatically.
- **Opening `index.html` directly:** run `npm run config` after editing. It converts the YAML into `game/config.js`, which the page loads (browsers won't let a local page read a `.yaml` file directly).

If something's wrong, such as a typo, a word where a number belongs, or bad indentation, you get a message naming the setting or line. It appears in the terminal and as a warning in the game, which keeps running on the last good settings. Saved games keep their progress when you change values. To see new *starting* values, use ☰ → "Start completely over".

## Files

| Path | Purpose |
| --- | --- |
| [index.html](index.html) | Full-screen game's entry point |
| [game_config.yaml](game_config.yaml) | **All game values. Edit this one.** |
| [game/config.js](game/config.js) | Generated from the YAML by `npm run config`. Don't edit. |
| [scripts/config.js](scripts/config.js) | Reads and checks the YAML, writes `game/config.js` |
| [game/engine.js](game/engine.js) | Game rules: cows, milking, upgrades, market, saves |
| [game/app.js](game/app.js) | Scenes: UFO and beam, milker, return chute and pod launch, market stands, drag and drop, dialogs |
| [game/style.css](game/style.css) | World layout, sprite crops, animation, and responsive styles |
| [game/scenery.js](game/scenery.js) | Subtle ambient scene animations, paused in hidden tabs and disabled for reduced motion |
| [game/field-animation.js](game/field-animation.js) | Layered field animation: smooth clouds, foreground trees, windmill, and bending flower stems |
| [assets/scenery/](assets/scenery/README.md) | Transparent field layers, restored ground, and asset preparation notes |
| [assets/](assets/) | Original supplied game art, plus matching cow, treat and equipment sprites in [assets/sprites/](assets/sprites/README.md) |
| [docs/digital-rules.md](docs/digital-rules.md) | Current rules and tuning values |
| [docs/spec-sheet.md](docs/spec-sheet.md) | Original tabletop concept and course-system relationships |
| [demo/arcade.html](demo/arcade.html) | Preserved original flying prototype |
| [tests/](tests/) | Economy tests and optional browser checks |

The `demo/index.html` link opens the current game. Saves from earlier versions use separate keys. They are left alone, but this version doesn't load them.

## Verify

```sh
npm test
```

Use `npm.cmd test` in PowerShell if needed. The rules suite uses Node's built-in test runner with no dependencies. It tests the rules against a fixed copy of the design-doc values ([tests/fixtures/design-doc-config.yaml](tests/fixtures/design-doc-config.yaml)), so your edits don't break it. Separate checks confirm that *your* `game_config.yaml` is valid and playable. It checks the design-doc values (milk prices, the upgrade chain, ship upgrade costs), one-at-a-time milking, ship and bottle capacity, exhaustion and rest, linear cow upgrades, stealth and suspicion, the herd limit, offline time, save validation, and randomized sessions.

Optional browser verification requires Playwright and the running local server:

```sh
node tests/browser-smoke.cjs
node tests/scenery-smoke.cjs
node tests/field-animation.cjs
node tests/ambient-art.cjs
node tests/scene-depth.cjs
```

An existing `playwright-core` installation can be supplied through `PLAYWRIGHT_MODULE`. Browser checks verify UI priority while targeting and abducting cows, automatic placement on the milking pad, milking, the return chute and outside pod launch, market trading, and dragging a treat onto a cow. They also cover inventory, save/resume, backup restore, reset, narrow layouts, and direct `file://` play. Screenshots go to ignored `test-results/`.

Scenery checks cover dragging a hologram to teleport a cow, podium status and controls, ambient animation in all three scenes, reduced motion, cats staying in the central walkway, and console visibility on portrait and short landscape screens.

Field animation checks inspect rendered pixels for clean sky behind the rotor,
cloud occlusion by trees, continuous subpixel movement, anchored flower roots,
and stationary ground and fence textures. They also measure the live animation
frame cadence and save a motion recording to `test-results/field-animation.webm`.

Ambient art checks measure actual star brightness, train travel and the quiet
interval between passes, stationary rails and window surroundings, boiling milk
contained by the tank, and connected flower silhouettes without holes or fringes.
Scene depth checks cover perspective scaling with anchored hooves, both foreground
fences occluding cows, the removed market badge, and intact train windows inside
the arch.
The revised paintings, asset preparation steps, and exact artwork prompts are
documented in [docs/art-animation-notes.md](docs/art-animation-notes.md).
