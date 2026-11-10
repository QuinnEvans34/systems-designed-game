# Ambient animation and sprite artwork

## Saved artwork

The original supplied backgrounds remain available. The game uses these new or
revised project assets:

- `assets/scenery/market-painted.png` — revised marketplace, with readable names
  incorporated into the three physical shop signs and the rail cleared for the
  animated train. This also supplies the reduced-motion market background.
- `assets/scenery/flower-heads-source.png` — retained earlier generated source;
  no longer used by the flower build or renderer.
- `assets/scenery/field-flower-heads.png` — six original painted blossoms from
  `FieldBg.png`, at their native scale in padded 64×64 cells.
- `assets/scenery/field-foreground.png` — original near fence and foliage
  silhouettes, composited above cows in a separate canvas.
- `assets/scenery/market-ambient-base.png` and `market-stars.png` — clean market
  painting plus isolated, original painted star pixels.
- `assets/scenery/ship-ambient-base.png` and `ship-stars.png` — equivalent ship
  layers, retaining the original room and return chute.

The market and retained earlier flower source were created with ImageGen.
The current flowers reuse the supplied field painting, preserving its native
pixel clusters, colours, and broad outlines. Offline preparation uses
`scripts/build-ambient-art.cjs`, with Playwright and the local game server.
The animated stems render behind all blossoms, keeping later branches from
crossing earlier petals. Near flowers and fence silhouettes cover the herd.
Cows scale continuously with distance from the field's vanishing line; their
hooves remain anchored and scale transitions follow their walking transitions.

The separate train sprite is drawn once in canvas and cached, then translated
at 54 scene pixels per second along the rail's diagonal. Its repeat includes a
quiet interval with no train visible. The stone window frame, planet, track and
support posts remain stationary. The clipping boundary follows the actual glass
arch rather than cutting across carriage roofs inside the window. The floating
milk-stock label has been removed from the selling stand.
The tank's milk surface, foam, bubble domes and
rising bubbles share the same surface calculation, behind fixed glass glints.

## Exact market edit prompt

> Use case: precise-object-edit. Image 1 is the EDIT TARGET, a 1672x941 pixel-art game marketplace background. Make an animation-ready revised background, same exact framing, scale, layout, palette, chunky pixel outlines and architecture. Change ONLY these details: (1) Turn the three booth roof signs into real physical illustrated shop signs incorporating their existing bottle, gear, cow icons AND clear small cream pixel lettering. Left wooden bottle sign: exact text 'SELL MILK'. Middle metal gear sign: exact text 'UPGRADES'. Right wooden cow sign: exact text 'COWS & TREATS'. Keep icons recognizable, reduce them slightly if needed to fit the text within their sign below the icon, with realistic wood/metal border, highlights and mounting. Lettering is painted onto sign surfaces, not floating UI. Signs remain in same locations and fit booth scale. (2) Remove only the orange-windowed train cars outside the upper-right large window, replacing them with seamless dark navy starry sky. KEEP the elevated diagonal grey railway beam and its support posts exactly in place; this is a clean plate so a separate animated train will run over it. Keep purple planet exactly. Preserve all stalls, floor, furniture, plants, walls, window borders, and everything else unchanged. No extra text. No new objects. Do not crop.

Edit target: `assets/MarketBg.png`. Opaque output saved as
`assets/scenery/market-painted.png`.

## Earlier flower sprite prompt (retained source only)

> Use case: stylized-concept sprite artwork. Image 1 is STYLE REFERENCE ONLY: the chunky outlined pixel-art farm game. Create a transparent game sprite sheet containing SIX isolated FLOWER HEADS ONLY (no stems, no leaves, no background, no text, no shadows outside silhouette). Strict grid 3 columns by 2 rows, each blossom centered in its equal sized cell with wide transparent padding. Top row left to right: (1) clean pink five-petal wildflower viewed front on with small golden center (2) similar pink five-petal flower tilted slightly left (3) small closed upright pink flower bud with dark outline. Bottom row left to right: (4) ivory-white five-petal daisy with golden orange center (5) similar ivory daisy seen in slight three-quarter angle (6) smaller clean pink five-petal wildflower with golden center. These will be displayed 30 to 48 pixels tall. Draw like carefully hand-authored pixel sprites: strong readable petal shapes, deliberate stair-step silhouette, 1 to 2 logical pixel near-black outlines, limited palette, pink coral shadow and light peach-pink highlights, white daisy warm cream highlights and cool pale sage shadows. Match existing farm's native pixel size and thick dark contours. Each flower is ONE coherent opaque silhouette with solid petals and center, NO pinholes, no messy wisps, no loose debris, no stems. Each cell contains only one flower head, no overlapping cells. Keep all six flowers roughly same bounding size. Actual transparent background.

Style reference: `assets/FieldBg.png`. Transparent output saved as
`assets/scenery/flower-heads-source.png`; prepared atlas saved as
`assets/scenery/field-flower-heads.png`.

## Verification

Run with the local game server and a Playwright installation available through
`PLAYWRIGHT_MODULE`:

```sh
npm test
node tests/browser-smoke.cjs
node tests/scenery-smoke.cjs
node tests/field-animation.cjs
node tests/ambient-art.cjs
node tests/scene-depth.cjs
```

`ambient-art.cjs` measures rendered pixels over deterministic animation frames:
individual star brightness changes, diagonal train travel, intervals without a
train, stationary rails and surroundings, milk motion inside the fixed tank,
and connected, opaque flower silhouettes without enclosed holes or edge clipping.
It saves measurements to `test-results/ambient-art-checks.json`.
