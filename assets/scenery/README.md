# Field animation layers

The field now composites a clean sky, independent cloud sprites, a transparent
static landscape, separate tree silhouettes, a rotating windmill, and rigged
flowers. Clouds move at fractional positions on every animation frame. The
flower stems bend around fixed roots; blossom sprites follow their tips.
No background rectangle moves with a tree, leaf, or flower.

- `field-world.png`: original landscape with transparent sky, trees, and rotor;
  restored ground replaces the former positions of the four moving plants.
- `field-foreground.png`: near fence and foliage silhouettes, rendered above
  the herd in `farm-foreground` so cows stay behind the foreground.
- `field-clouds.png`: transparent cloud texture atlas from `FieldBg.png`.
- `field-tree-left.png`, `field-tree-right.png`: transparent original trees.
- `field-flower-heads.png`: six original blossom heads from `FieldBg.png` on a
  192×128 transparent atlas. Padded 64×64 cells preserve the painting's native
  scale, colours, pixel clusters, and broad dark contours.
- `field-ground-clean.png`: the clean plate used only through four local plant
  regions, with six-pixel blended boundaries. Other landscape pixels retain the
  original artwork.

`scripts/build-field-art.cjs` prepares these layers using browser canvas. Run it
against the local server with Playwright available through `PLAYWRIGHT_MODULE`.
The game loads the prepared PNGs directly, including in `file://` mode.

## Market and ship layers

- `market-painted.png`: revised market painting with shop names painted inside
  the three physical roof signs and an empty elevated rail outside the window.
- `market-ambient-base.png`, `ship-ambient-base.png`: paintings with the selected
  stars removed into tiny interpolated sky footprints.
- `market-stars.png`, `ship-stars.png`: the actual painted stars as transparent
  layers. Individual stars fade independently over the clean sky.
- `flower-heads-source.png`: retained earlier generated sheet; no longer used
  to prepare the flower atlas or by the game.

`scripts/build-ambient-art.cjs` prepares the star layers and flower atlas. Run it
after `scripts/build-field-art.cjs` if rebuilding all the art. Both scripts use
the same local server and `PLAYWRIGHT_MODULE` setting. The train is a cached
pixel-art carriage sprite drawn by `game/scenery.js`; only that sprite moves,
following the rail slope and clipping to the inner window. The milk tank uses
one moving surface shared by its liquid, foam, rising bubbles and surface domes;
fixed glass reflections are composited in front. Ambient motion runs at display
cadence, advances only in the visible scene, and respects reduced motion. Reduced
motion retains the new signs and the cleaned flower art.

Exact generation prompts and artwork provenance are in
[art-animation-notes.md](../../docs/art-animation-notes.md).

The clean plate was edited from `assets/FieldBg.png` using the built-in ImageGen
tool. Its exact prompt was:

> Edit target: provided pixel-art farm game background. Use-case precise-object-edit. Create a clean background plate for layering animation. Preserve the entire image composition, every original object position, pixel art style, colors, field, trees, barn, fences and rocks. ONLY remove these flower objects and restore the plausible background behind them: (1) the tall pink flowering stalks in the bottom left, approximately x=20..106, y=683..849 on the original 1672x941 image; (2) the tall pink flowering stalks at the bottom right, approximately x=1566..1640, y=683..862; (3) the single white daisy in the open grass at x=560..610,y=846..891; (4) the single white daisy at x=1067..1115,y=847..891. Remove stalks, blossom heads, leaves belonging to those stalks, and their dark outlines. Restore simple plain grass / unobscured wooden fence / foreground foliage that would be behind those plants, using the exact same pixel-art style. No replacement flowers at those positions. Keep all other daisies and plants untouched. Keep all clouds and windmill and all sky unchanged; this edit is ONLY a flower-removal clean plate. Do not add or move any object. Keep exact original landscape aspect ratio and framing, no crop. This clean plate will be used ONLY through precise masks covering the removed plants; please make background restoration seamless.
