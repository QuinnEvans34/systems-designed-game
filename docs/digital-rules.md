# Digital game rules

> All values below are the defaults. Change them in [game_config.yaml](../game_config.yaml); see the README section "Changing game values".

These rules implement the game design document (high-level game flow, game items, upgrades and background area functions). The three illustrated areas are **Field → Ship → Market**. All play happens inside the background art.

## The loop

1. **Beam** a cow up from the field. It leaves the field and is now aboard the ship.
2. On the ship, put **one cow at a time** on the milking pad and press **MILK**. Each cow gives **one bottle of its own milk**.
3. While aboard, a cow can also be **upgraded** by dragging an upgrade item onto it in the cow storage screen.
4. A cow that has been milked and/or upgraded is **exhausted**. Send it home through the **return chute**. It **rests** in the field before it can be beamed up again.
5. **Sell** milk at the market for coins. Spend coins on **new base cows**, **cow upgrade items** and **ship upgrades**.

### Flow rules

- A beamed-up cow is no longer in the field.
- The ship holds at most **ship cow capacity** cows.
- The ship holds at most **ship bottle capacity** bottles of milk, across all types.
- Each trip aboard, a cow can be milked once and upgraded once. Upgrading first gives the better milk on the same trip.
- A cow can't be moved, sent home or upgraded while the milker is working on it.

## Cows and milk

| Cow | Milk | Sells for |
| --- | --- | --- |
| Base cow | Milk | 5 |
| Chocolate cow | Chocolate milk | 15 |
| Strawberry cow | Strawberry milk | 30 |
| Doughnut cow | Coffee | 65 |
| Almond cow | Almond milk | 150 |

## Cow upgrades (linear)

Upgrades follow base → chocolate → strawberry → doughnut → almond. A step can't be skipped. Each item works only on the cow type directly before its output.

| Item | Input cow | Output cow | Cost |
| --- | --- | --- | --- |
| Chocolate bar | Base | Chocolate | 20 |
| Strawberry | Chocolate | Strawberry | 50 |
| Latte cup | Strawberry | Doughnut | 75 |
| Almond | Doughnut | Almond | 120 |

## Ship upgrades (middle market stand)

Costs are rounded to the nearest coin after applying the multiplier per level.

| Upgrade | Starting value | Per level | Starting cost | Cost multiplier | Max level |
| --- | --- | --- | --- | --- | --- |
| Milking time | 15 s | −3 s | 5 | ×1.3 | 4 (3 s) |
| Ship cow capacity | 3 cows | +1 cow | 20 | ×1.5 | 7 (10 cows) |
| Ship bottle capacity | 5 bottles | ×1.5 (rounded) | 10 | ×1.3 | 8 |
| Ship stealth | 10 | ×1.5 | 20 | ×1.8 | 6 |

## Values not set by the design doc (tuning choices for playtesting)

| Rule | Value |
| --- | --- |
| Starting herd | 5 base cows in the field, 0 coins |
| Herd limit | 20 cows total (field + ship) |
| New base cow (right market stand) | 15 coins |
| Rest time for an exhausted cow | 30 seconds |
| Suspicion per beam | 250 ÷ stealth (25 at the starting stealth of 10) |
| Suspicion cooldown | −1.5 per second; a beam that would push suspicion over 100 is blocked |
| Max upgrade levels | As listed above, so capacities stay within the herd limit and milking time stays positive |

## Areas

**Field.** Holds your stockpile of cows. Cows hop around and sometimes graze. Move the UFO along the X axis with the mouse or ← → (A/D). Beam the cow under it with a click or Space. On touch screens, tapping flies the UFO there and beams. Only one beam happens at a time. The cow rides up the tractor beam and shrinks into the ship. Resting cows lie down with a timer. The suspicion meter shows how close Earth is to noticing.

**Ship.**
- The **cow storage monitor** on the console shows how many cows are aboard. Clicking it opens the cow storage screen, which lists every cow aboard and your upgrade items. Drag an item onto a cow to upgrade it, or select an item and then click the cow.
- **Milking pad:** the first cow aboard steps onto an empty pad when you enter the ship. Click a cow (or drag it) to swap it into the middle. An occupied pad is preserved when traveling.
- **MILK button** on the overhead milker. The milker box comes down from the ceiling, covers the cow, shakes and puffs steam, then lifts.
- **Return chute:** send cows back to Earth. The cow enters the fixed chute, then a small pod flies away outside the ship's window with exhaust behind its engine.
- **Milk inventory:** the HUD counter and inventory show your bottles; there is no separate milk-storage control in the ship scene.

**Market.** The stands are clickable and highlight on hover. Alien cats hop around and drink the milk you've sold.
- **Left stand:** sell milk.
- **Middle stand:** ship upgrades.
- **Right stand:** new cows and cow upgrade items.

**Inventory.** Available anywhere from the **INVENTORY** button or the **I** key. It shows milk by type, upgrade items, and how many cows are in the field and on the ship.

## Saving

Progress saves in the browser under the `moo-ving-v3` key. It saves after actions, when a milking finishes, every 5 seconds, and when you leave the page. Time away (up to 4 hours) is simulated on return, so milkings finish and resting cows wake up. The field guide menu has backup download and restore, plus a confirmed fresh start. Saves from the older idle version use a different key and are ignored.

## Art

The game uses matching pixel-art sprites for cows, upgrade items, the milker, the fixed return chute, and the departing return pod. Resting cows use their idle sprite with floating "z z z". Text panels and the cow monitor share a stepped slate frame. Sprite sources and prompts are documented in [assets/sprites/README.md](../assets/sprites/README.md).
