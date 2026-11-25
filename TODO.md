# To do

## Touch screens

Built 2026-11-25 for tablets in landscape (portrait isn't wanted), after a
tester's iPad reports: 44 px controls and 16 px dropdown text under
`@media (pointer: coarse)`, a wider tap margin for ships on touch, the page
sized to Safari's visible height (`100dvh`), and focus that never scrolls the
page. Checked in Chrome at iPad size only. Still open:

1. **Try it on a real iPad.** Pinch-zoom, pan, the dropdowns and the fire
   phase haven't been played on one since these fixes.
2. **Hover tooltips don't exist on touch.** SSD icon tooltips (weapon arcs)
   and button hints won't show. Minor: players read the SSD itself.

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

## Testing

1. **End-to-end tests.** Every test is a Vitest unit test in Node; nothing
   drives the real page, so bugs in `src/main.ts`, the DOM, CSS, focus and
   scrolling go unseen (both iPad bugs of 2026-11-24/25 were there). Idea: a
   small Playwright suite behind `npm run test:e2e`, kept out of `npm test`,
   running desktop Chromium and a landscape iPad in WebKit (Safari's engine,
   with touch):
   - a full turn of the Introductory Scenario, plotting to End turn;
   - the toolbar button while targeting: Cancel targeting, then Continue
     after a volley, then End turn;
   - on the iPad: the toolbar stays on screen and the page never scrolls,
     Fire! and Continue are in view, no visible control is under 44 px, and
     the Turn row fits on one line.

   Dice are random, so tests either accept any result or need a test hook to
   fix them (the game already passes `Math.random` in). Needs Playwright and
   its browsers as dev dependencies, a few hundred MB.
