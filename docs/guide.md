# Full Thrust Light: guide

How to play, and notes on the code. See the [README](../README.md) for how to
build and run the game.

## How to play

The game opens on the scenario list. The first scenario is selected, and the
box below the list shows its title, a short description and its forces; choose another with a click or the
arrow keys, then press **Play** (or Enter). **Menu** in the toolbar leaves
the game, after asking, and returns to the list.

**Resign** in the toolbar concedes the game and the other side wins. While a
player is plotting or firing, it's that player who resigns; at other times
the popup asks which side. It always asks first, with **Cancel** selected.
The victory popup then says who resigned.

**Rules** in the toolbar opens the *Full Thrust Light* rules PDF from Ground
Zero Games in a new tab. **About** shows the game's version (e.g. *V0.0.2*): ask
a tester for it to know which build they are playing. During a game it also
has **Copy game state**, which puts the game on the clipboard as JSON to paste
into a bug report (the same dump as the Debug popup's).

**Winning.** A side loses when it has no ships left in the battle, whether
destroyed or gone. The map has no edges, so the rules' "a ship that leaves
the table is out of the game" works from distance instead: the battle area
moves with the fight.
- A ship that ends a move more than **144 mu** from every enemy ship is out
  of reach. It is marked *Leaving* under its name on the map and in its
  Movement orders panel, and the Movement complete popup says so.
- If it is still out of reach after the next move, it **leaves the battle**
  and may not return. If it ends that move within 144 mu of an enemy, the
  warning is lifted. This is how to disengage: plot away and keep going.
- Every ship is judged from where all the ships ended, before any leave, so
  ships on both sides can leave in the same move. If the last ships on both
  sides leave together, the game is a **draw**.
- The victory popup says whether the losing side's ships were all
  destroyed, or some left the battle.

The game is hot seat: both players share one screen (or one person plays both
sides). Each turn goes:

1. **Order plotting, Player One.** A dialog announces the phase, with a line
   saying what to do. Player One plots orders for their ships and presses
   **Lock in orders**, then confirms.
2. **Order plotting, Player Two.** The same for Player Two.
3. **Movement.** The view zooms out to show every ship, from where it starts
   to where it will end up, and a dialog announces the phase. The selected
   ship is deselected, then all ships move at once.
4. **Movement complete.** The ships stay where they finished and a popup
   offers **Replay movement** (watch it again; the popup comes back when it
   ends) or **Go to fire phase**. Escape closes the popup and leaves the
   toolbar's **Fire phase** button. Once the fire phase starts the move can't
   be replayed, as that would show destroyed ships back in play.
5. **Weapons fire.** If no ship can reach an enemy, a dialog says so and
   the button changes to **End turn**. If only one side can reach an enemy,
   that side fires with no initiative roll, and the dialog says why.
   Otherwise each player rolls a die for initiative, ties rolling again, and
   the highest roll fires first. Players then
   take turns, one ship per go (see *Firing* below). Every go starts with a
   dialog saying whose go it is and, in brief, how to fire (under the
   initiative result on the first go). When firing is over,
   the map zooms out to show every ship;
   press **End turn** to start the next turn.

Orders are secret until the ships move. Ship positions, facings and ship
systems displays are open book: anyone can examine any ship.

Player One flies the green fleet and Player Two the red, from the two
record sheets in the rules. The same class differs between them: green ships
have more hull boxes but less thrust, and different weapons. For example,
the green frigate carries a class 3 beam where the red has a class 2.

Every ship's systems display uses the same hull outline, drawn a size
bigger for each larger class: frigate, destroyer, light cruiser, heavy
cruiser, then battlecruiser. The systems are the same size on all of them,
so the battlecruiser's display is the biggest. On a short screen every display
shrinks by the same amount.

- **Plot orders** in the Movement orders panel, under the ship systems
  display on the right. It works on the selected ship: select a ship on the
  map, or with `Prev ship` / `Next ship` at the bottom of the panel, which
  step through the plotting player's ships. Each player starts their plotting
  with one of their own ships selected.
- For one of your own ships the panel shows its current velocity (V) and
  course (C), then the inputs: a thrust change, and a turn of **P** (port,
  anticlockwise), **–** (no turn) or **S** (starboard, clockwise) with a
  number of course points.
  Below them are the resulting V and C and the thrust used. Only legal values
  are offered: at most half a ship's thrust, rounded up, can go on turning,
  and the total cannot exceed its thrust. A ship with no order keeps its
  course and velocity.
- For an enemy ship the panel shows its current V and C and what it did last
  turn, but its orders for this turn only as *locked in* or *not plotted
  yet*. Locked-in orders can't be changed.
- Once everyone has locked in, the panel shows each ship's order for the turn
  and its result.
- **Map**: drag to pan, scroll or pinch to zoom, click a ship to select it.
  While plotting or firing, selecting a ship by any means (a click, `Prev
  ship` / `Next ship`, or the game picking one) fits every ship on the map,
  as `Fit all` does, so the enemy stays in sight. So does showing a target,
  and closing the targeting view. The fit is around the ships themselves,
  not their range circles. At other times `Prev ship` / `Next ship` centre
  the map on the ship they select. At the start of each player's plotting
  the map fits every ship too.
- Selecting any ship, your own or the enemy's, shows its **ship systems
  display** (weapons with fire arcs, fire control, hull boxes and drives) on a
  background tinted with its owner's colour. The selected ship has a pulsing
  blue dashed ring round its base.
- **Strength bar**: a yellow bar above every ship shows its hull: 1 px
  high for frigates and destroyers, 3 px for cruisers and 5 px for the
  battlecruiser. It is as long as the ship's sprite when undamaged and shortens from the right as
  hull boxes are crossed out, dropping as hits are rolled.
- Courses are clock-face headings fixed to the map: 12 is up, 3 is right.
  While plotting, the course clock in the top-right corner of the Movement
  orders panel shows which way each course points.
- **Range circles**: the selected ship, yours or the enemy's, always shows
  how far its beams reach: dashed rings every 12 mu, labelled, with the arcs
  its beams cover in each band shaded light blue and dotted lines between the
  six fire arcs. Unfired pulse torpedoes add an orange dash-dot arc at
  30 mu across their own arcs. The ship's base ring keeps its owner's colour.
  They follow the ship while it moves.
- **Scale**: the bar in the bottom right corner of the map shows 12 mu, the
  width of a range band, unless that would be too short or too long to read
  at the current zoom, when it shows another round distance.
- **Backdrop**: stars range from white through blue to red, with a few faint
  galaxies and soft blue nebulae. It is generated from fixed seeds, so it
  looks the same every game.

### Firing

- On your go, select one of your ships (on the map, or with `Prev ship` /
  `Next ship`, which step through all your ships). The map fits every ship,
  and shows the ship's **reach** (see *Range circles* above), counting only
  the beams it hasn't fired yet. Enemy ships it can hit get a
  pulsing yellow ring; everything else is dimmed.
- Click a ringed enemy on the map to **target** it. There is no popup: the targeting view keeps the map
  in sight:
  - the target's systems display opens in a new column beside your ship's,
    tinted in its owner's colour, with a note if it has already fired this
    turn;
  - the map narrows to make room and fits every ship, with a
    bright yellow line between them labelled with the range.
- On your ship's display the beams that can hit the target are ringed in
  yellow, with a tag showing the dice each rolls at this range, and all start
  chosen. Click a beam (or Tab to it and press Space) to hold it back for
  another target; its ring turns dashed. Weapons that can't fire are faded,
  with the reason in their tooltip and summed up below.
- Under your ship's display are the range, arc and fire controls left, the
  **dice pool** (how many dice will be rolled), **◀ Prev** and **Next ▶** to
  step through the other ships you could fire at (or click one on the map),
  and **Cancel** and **Fire!**. Fire! has focus whenever a target is shown,
  so Enter or Space fires. Escape, a click on anything else on the map, or
  the toolbar's main button (which reads **Cancel targeting**) also cancels.
  These buttons stay pinned to the bottom of the panel, so they are in view
  however short the screen. Once you fire, the pools disappear, the line reads e.g.
  *Fired · 1 fire control left*, and the weapons that fired fade as fired
  when the dice are done.
- The dice roll under the target's display: grey misses (1–3), amber 1
  damage (4–5), red 2 damage (6). The damage is then crossed off the target's
  hull boxes one at a time, each with a small explosion, and the map catches
  up. A destroyed ship is stamped *Destroyed* and explodes on the map.
- **Threshold checks.** If a volley completes a row of the target's hull
  boxes (but doesn't destroy it), the ship's alarm sounds and every system
  still working is checked, as the rules describe:
  - one die per weapon, fire control and drive. A system is lost on a 1 at
    the first row, 1–2 at the second and 1–3 at the third;
  - if one volley completes more than one row, only the worst row is rolled
    for, with 1 added (e.g. rows 1 and 2 together: lost on 1–3);
  - to keep play moving, the systems are checked a group at a time: all
    the weapons, then all the fire controls, then all the drives. Every
    system in the group gets a pulsing dotted yellow ring on the target's
    display, and its own die rolls under the dice beside its name, all at
    once. Any that fail then explode one after another and are crossed
    out in red. (Faded weapons are
    ones fired this turn, not lost ones.)
  Lost systems never work again. A lost weapon can't fire (it is *knocked
  out* in the Weapons fire panel and left out of the range circles), a lost
  fire control means one fewer target a turn (with none left the ship can't
  fire), and a lost drive takes its thrust away from the orders panel.
- If the ship still has a fire control and beams that can reach another
  ship, the volley ends with **Close** and **Next target ▶**: Next target
  (or ◀ Prev / Next ▶, or a click on a highlighted ship) shows another
  target with **Fire!**, and **Close** stays on hand to stop, keeping what
  was fired. Otherwise press **Continue**. The toolbar's main button reads
  **Continue** too after a volley (greyed out only while the dice roll), so
  there is always a way on. Either way the target column closes and the map
  widens again.
- The Weapons fire panel lists each weapon's state: *ready*, *fired*,
  *nothing in reach*, *no fire control left* (an enemy is in reach but every
  fire control has been used), *target already fired at* (it only reaches
  ships this ship has already engaged) or *not fired* (the ship has finished,
  or the phase is over).
- Each fire control lets a ship engage one target per turn, and each weapon
  fires once. Once a ship has fired it keeps your go until it has nothing
  left it can fire at (it then finishes by itself and play passes on), or
  until you press **Finish** (the main button reads e.g. *Finish BC1*). That
  asks first, saying what the ship could still fire at; the ship then fires
  no more this turn.
- Firing is optional: the rules say ships *may* fire. When no ship is
  part-way through firing, the main button is **Pass**: you fire nothing
  this go and play passes to the other side. Passing locks no ship out: if
  the other side then fires a ship, it's your go again. Pass always asks
  first, listing your ships that could still fire and explaining that if
  the other side passes too (or already has, or has nothing left to fire),
  weapons fire ends and those ships won't fire this turn.
- As in the rules, players alternate ship by ship "until all desired firing
  is completed": the phase ends when both sides pass one after the other,
  or when no ship on either side can fire. A side with nothing left to fire
  is told so in the popup at the start of the next go, and is skipped, so
  the other side fires its remaining ships in a row.
- So a stray Enter can't pass or finish a ship, those popups have **Cancel**
  selected, and the main button never takes the keyboard focus during the
  fire phase.
- Beams roll their class in dice up to 12 mu and one fewer per further
  12 mu, so a class 3 reaches 36 mu. Range is centre to centre, rounded to
  0.1 mu. No weapon fires through a ship's aft arc.
- **Pulse torpedoes** (the launchers marked with an asterisk) reach 30 mu
  through their own arcs. They are chosen on the SSD like beams, with a tag
  showing the score they need to hit, and sit in their own **Torpedoes** pool
  beside the beam dice pool. Beams and torpedoes fired at one ship share one
  fire control, as the rules allow.
  - Each torpedo rolls one die to hit: 2+ up to 6 mu, 3+ to 12, 4+ to 18,
    5+ to 24 and 6 to 30. All of a ship's torpedoes are rolled together.
  - Each hit then rolls a damage die, and does the number rolled.
  - The beams are rolled and their damage crossed off first; then the
    torpedoes launch, roll to hit (amber hits, grey misses) and roll damage
    (red). Any threshold check comes once both are done.
  - Torpedoes aimed at a ship the beams destroy are launched and wasted:
    they count as fired.
  - On the map, unfired torpedoes show as an orange dash-dot arc at 30 mu,
    labelled "30 mu torpedoes".
- The map has no edges: ships can fly as far as they like and are never
  removed for leaving the table. Positions are in mu, with 0,0 between the
  two fleets at the start.

### Tablets

The game plays on a tablet held in landscape (portrait isn't supported).
Drag to pan, pinch to zoom and tap to select. On a touch screen every button
and dropdown is at least 44 px, and a tap picks a ship a little further from
its base ring than a mouse click does. Hover hints don't show on touch.

### Sound

Most sound effects are generated in the browser with the Web Audio API
(`src/audio/sound.ts`). The hull hits, ship explosions and engines are
recorded clips (see *Credits* in the README). Browsers only allow sound after the first
click or key press, so the game is silent until then. There are sounds for:

- button presses, and choosing or holding back a weapon while targeting;
- a chime when a phase dialog appears;
- thrusters while ships move (recorded, looped);
- dice rattling as they tumble, and a clack as each one lands;
- beams firing: all the beams in a volley fire together, each a buzzing,
  swirling phaser-style whine that fades into a reverb; higher classes are
  deeper, louder and longer. The dice are thrown while the beams are still
  sounding;
- a short explosive crunch as each hull box is crossed off, and as a system
  is knocked out by a threshold check (recorded);
- a single deep "whah" of a klaxon when a threshold check starts, and a
  bright rising ping for each system that passes;
- a long explosive crunch, played half as loud again, when a ship is
  destroyed (recorded);
- a pulse torpedo launching: Laser 2 from Kenney's *Digital SFX Set*
  (recorded).

**Sound effects**, in the Debug popup (see [Debugging](#debugging)), opens
a window with each sound on a button:
- **In use:** the sounds the game plays now;
- **Beam candidates:** lasers, phasers and zaps from Kenney's *Digital SFX
  Set*, as possible replacements for the generated beams.

There is no mute or volume control yet.

## Debugging

A **Debug** button in the toolbar, shown only when the game runs on
localhost, opens a popup for development:
- **Sound effects:** the temporary sound board, above.
- **Copy state:** puts the whole game state on the clipboard as JSON,
  ready to paste into a bug report or a chat.
- **Save state:** saves the same JSON to the downloads folder, named
  for the scenario, turn and phase, e.g.
  `ft-state-introductory-t3-firing-2026-11-17-1405.json`.

The JSON holds every ship, the orders plotted so far, the fire phase, the
log and the designs in play, plus what the interface was doing: the
selected ship, the ship being targeted from, whether ships were moving or
dice rolling, and where the map was looking (camera and map size). Its
`gameVersion` (e.g. *V0.0.2*) says which build of the game it came from. On
a published copy, where Debug is hidden, the About popup's **Copy game
state** copies the same JSON.

## Deploying

`npm run build` writes the site to `dist/`. It is entirely client-side static
files, built with relative paths so it works from any folder on any web
server. It must be served over HTTP: opening `dist/index.html` straight from
disk does not work, because browsers block module scripts and data requests
from `file://`.

`npm run preview` serves the build locally, or use any static server, for
example `python3 -m http.server -d dist 8080`.

The build works as a GitHub Pages project site
(`https://<user>.github.io/<repo>/`) with no changes. Publish the contents of
`dist/`, either:

- from a GitHub Actions workflow using `actions/upload-pages-artifact` with
  `path: dist` and `actions/deploy-pages` (set *Settings → Pages → Source* to
  *GitHub Actions*), or
- by pushing the contents of `dist/` to a `gh-pages` branch and choosing that
  branch under *Settings → Pages*.

`dist/` includes an empty `.nojekyll` file so GitHub Pages serves the files
as they are rather than running them through Jekyll.

This repo uses the `gh-pages` branch, served at
<https://retroredge.github.io/full-thrust-lite/>. The branch holds only the
built files. To publish a new build, first raise the version, which the
About popup shows. It is set only in `package.json`; `npm version` updates it
and the lock file (use `minor` or `major` for bigger steps), then commit it:

```sh
npm version patch --no-git-tag-version
git commit -am "Version 0.0.3"
```

Then build and publish:

```sh
npm run build
git worktree add ../ftl-pages gh-pages
rm -rf ../ftl-pages/* && cp -R dist/. ../ftl-pages/
git -C ../ftl-pages add -A && git -C ../ftl-pages commit -m "Publish game build"
git -C ../ftl-pages push
git worktree remove ../ftl-pages
```

## Project layout

| Path | Contents |
|---|---|
| `public/data/designs/` | Ship designs (JSON) in a folder per fleet (`red/`, `green/`): drives, hull, weapons, SSD size and weapon rows |
| `public/data/scenarios/` | Scenarios (JSON): number, title, players, ships, start positions, velocities and courses; `index.json` lists them |
| `public/assets/` | Ship sprites for the map |
| `src/rules/` | Game rules with no browser dependencies: courses, orders, movement, the battle area (`battleArea.ts`), beam fire and hull damage |
| `src/data/` | Loading and validating designs and scenarios |
| `src/game/` | Game state and turn flow (per-player plotting, lock-in, movement, weapons fire in `fire.ts`), what each player may see (`visibility.ts`), phase announcements and the movement log |
| `src/audio/` | Generated sound effects |
| `src/view/` | Scene, camera and the camera controller (fitting, gliding and zooming the view), projection, animation, starfield, fire envelopes (weapon reach) and the canvas renderer |
| `src/ui/` | Movement orders and weapons fire panels for the selected ship, the toolbar's status and main button (`toolbarModel.ts`), map input (`mapInput.ts`), ship systems display, phase dialogs, the targeting view (`targeting.ts`), dice and course clock |
| `src/text.ts` | Helpers for the English shown to players: lists ("A, B and C") and plurals |
| `src/main.ts` | The `Game` class, which runs turns and ties the rules, view and panels together |
| `tests/` | Vitest suites, mirroring `src/`; `tests/support/` has shared fixtures, including a `gameState()` builder |
| `tools/` | Scripts for reading the rules PDF, such as the weapon arcs |

The game plane is flat 2D, measured in mu. The view goes through a
`Projection` and a `BoardRenderer` interface (`src/view/`), so an isometric or
3D renderer can be added without changing the rules or game state.

### Turn flow and a future computer player

`src/game/state.ts` is the authority on whose turn it is: `phase` is either
`{ kind: 'plotting', playerId }`, `{ kind: 'moving' }` or
`{ kind: 'movementComplete' }`. `setOrder` only accepts orders for the
plotting player's ships, `lockInOrders` hands plotting to the next player or
starts movement once everyone has locked in, `resolveMovement` moves the ships
and checks the battle area (ships out of reach are warned, then leave, which
can end the game),
`startFirePhase`, `fireVolley`, `pass` and `finishShip`
(`src/game/fire.ts`) run the fire phase (`firing`, then `fireComplete`, or
`gameOver` when one side is wiped out), and `endTurn` starts the next turn.
Dice come from a random source passed in, so tests can script every roll.

The interface draws everything from `viewFor(state, viewerId)`
(`src/game/visibility.ts`), which strips out orders the viewer may not see.
A computer player will plug in at the same points: given
`viewFor(state, itsId)`, it chooses orders, applies them with `setOrder` and
calls `lockInOrders`, so it can neither see nor change the other side's
orders.

### Adding ships and scenarios

Designs live in a folder per fleet: `public/data/designs/red/` and
`public/data/designs/green/`, one file per class, e.g. `green/frigate.json`.
Each design's `fleet` and `id` must match its folder and file name. Each
design has a `code`, its naval shorthand (e.g. `FF`), which the scenario list
uses to describe the forces.

A design's `ssd` sets how its ship systems display is drawn: a `size` from
1 (smallest, the frigates) to 5 (the battlecruisers), and `weaponRows`, how
many weapons sit side by side in each row from the bow, 1 or 2, taking the
weapons in order. Sizes 1 and 2 have room for two rows of weapons, 3 and 4
for three, and 5 for four. For example,
`"ssd": { "size": 5, "weaponRows": [2, 2, 1, 2] }` gives the
red battlecruiser its two torpedoes, then two class 3s, a class 2 and two
class 1s. Everything else is placed automatically: the fire controls below
the weapons, then the hull boxes, with the drives in the tail. The tests in
`tests/ui/ssdModel.test.ts` check that every shipped design fits inside the
outline with nothing overlapping.

In a scenario in `public/data/scenarios/`, each player names their `fleet`
(e.g. `"fleet": "green"`), and each ship's `design` names a class in that
fleet (e.g. `"design": "frigate"`).

A scenario has a `number` (its place in the list), a `name` (the title shown
in the list) and a `description` (a short paragraph shown when it is
selected; a long one scrolls within the box). To add one, create its file and add its `id` to
`public/data/scenarios/index.json`. The Forces line on the scenario list is
worked out from the ships, largest class first.

Files are validated when loaded, and any problems are shown on screen.

### Ship art

Each ship on the map is a top-down photo of a painted miniature, one per class
in each fleet: `public/assets/ships/<code>-<fleet>.png`, e.g. `FF-green.png`.
They are cut out from the table with a transparent background, keep any of
the black hex base that shows, and point bow up, straightened along the hull.
A design's `sprite` names its image. The image is drawn as long as the
design's `length` in mu, so `length` sets how big a class looks, separately
for each fleet.

The ship systems displays are drawn in code (`src/ui/ssdModel.ts`): one hull
outline, a simplified version of the record sheet's battlecruiser, shared by
every ship.
