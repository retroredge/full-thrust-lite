# To do

## Touch screens

Deferred. Not yet tried on a touch device. Text is already big enough: a CSS
pixel is about the same physical size on a tablet as on a laptop, and the
smallest text was raised for every device on 2026-11-18. What remains:

1. **Small touch targets.** Measured on 2026-11-18, against the usual 44 px
   (Apple's 44 pt, WCAG AAA):
   - order dropdowns (thrust, turn amount): 35×25 and 43×25 px, and the
     P / – / S turn buttons: 34×24 px, all used for every ship every turn;
   - the targeting view's Prev / Next: 59×26 px (see also *Next target sits
     where Fire! appears* below);
   - toolbar buttons, including − and +: 30 px tall (30×30 px);
   - Fire!, Cancel, Pass, Lock in orders, Prev ship / Next ship: 30 px tall;
   - popup buttons (Begin, Lock in…): 34 px tall.

   The scenario list rows (about 42 px) and SSD weapon icons (41–48 px) are
   close enough. Fix: enlarge them to at least 44 px only on touch screens,
   with `@media (pointer: coarse)`, leaving the desktop layout unchanged.
2. **Dropdowns zoom the page on iOS.** Safari zooms in when a dropdown with
   text under 16 px gets focus, and the order dropdowns are 13 px. Fix: 16 px
   dropdown text in the same `@media (pointer: coarse)` block.
3. **Ships are small to tap.** A tap or click picks a ship within 4 px of its
   base ring, which is at least 13 px in radius, so about 34 px across; a
   frigate is about 37 px across with all of Big Fleet Battle in view. Ships
   on the same side are at least 120 px apart there, so the margin can grow
   for touch alone (`pointerType === 'touch'` on the pointer event) without
   picking the wrong ship (`pickShip` in `src/view/scene.ts`).
4. **Hover tooltips don't exist on touch.** SSD icon tooltips (weapon arcs)
   and button hints won't show. Minor: players read the SSD itself.

Already fine on touch: pan, pinch-zoom and tap-to-select on the map (pointer
events, `touch-action: none`), native pickers for the order dropdowns, and
swipe-scrolling the orders sheet.

## Game flow

Ships out of reach of every enemy now leave the battle (built 2026-11-18;
see *Winning* in `docs/guide.md`). Still open:

1. **Running away gives a draw, not a defeat.** In a two-player game, if
   one side's whole remaining fleet gets more than 144 mu from every enemy,
   every ship on the other side is out of reach too. Both are warned
   together and leave together, so the game is a draw. The rules count a
   player who withdraws their surviving ships as defeated. Ideas: in that
   case the side with more hull boxes left in the battle wins; or the side
   whose own moves opened the distance loses.
2. **Stalemate.** Crippled ships that can't hurt each other but stay within
   144 mu never end the game. Idea: a draw once neither side has a ship
   that can fire (a working weapon and fire control).

## Small issues

Found in a play-through of scenario 1 on 2026-11-17.

1. **Game buttons look live behind the scenario list.** Lock in orders (and
   now Resign) look active before a game has started.
2. **Phase popups cover the action.** The plotting, movement and fire
   popups sit in the middle of the map, over the ships and their labels.
3. **Movement-phase wording.** The empty Movement orders panel says "Select
   a ship to see or plot its orders" while ships move, when nothing can be
   plotted.
4. **Lost system out of sight.** After a threshold check the 3-line list
   ends scrolled to the last group (the drives), so the line for a system
   that was knocked out can be out of view, and the outcome line ("1 system
   knocked out.") doesn't name it.
5. **"Has already fired this turn" doesn't say which ship.** On the target
   card it means the target has fired; "CL1 has already fired this turn"
   would be clearer.
6. **"Begin" on every popup.** "Weapons fire complete: End the turn when
   ready" and "Player One to fire" also say Begin, where there's nothing to
   begin; OK or Continue would fit.
7. **Map labels overlap ships.** The range-ring labels ("12 mu") and the
   yellow range pill on the targeting line ("6.0 mu") can sit on a ship or
   its name.
8. **Next target sits where Fire! appears.** A quick double-click on Next
   target fires at the new target before you've looked at it.
9. **Held-back weapons are faint.** Weapons clicked off before Fire! only
    get a faint dashed ring and a dimmed tag, hard to tell from selected
    ones at a glance.
10. **Range circles on a ship that can't fire.** A ship with no working fire
    control still shows its range circles and arcs when selected.
11. **Plotting with nothing to plot.** A player with no ship that has a
    working drive still gets the plotting popup, Lock in and a confirm every
    turn. Plotting could be skipped for them, with a note.
12. **Bare victory screen.** It has no summary (turns played, ships lost and
    surviving on each side), no way to stay and look at the final board, and
    the map behind it is empty because the camera doesn't frame the
    survivors (`fitAllShips()` in `src/main.ts` may be all that needs).
