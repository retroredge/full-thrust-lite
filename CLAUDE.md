# CLAUDE.md

A browser game of turn-based starship combat, played hot seat, based on GZG's
free *Full Thrust Light* rules. See `README.md` for the tech stack and how to
build and run it, `docs/guide.md` for how to play and the project layout, and
`TODO.md` for deferred work.

## Commands

```sh
npm run dev        # Vite dev server on http://localhost:5173
npm test           # Vitest, the full suite
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint (type-aware) and a Prettier check
npm run format     # Prettier: rewrite files in the house style
npm run build      # typecheck, lint, then build to dist/
```

After every change, however small, run the typecheck and the full test suite,
and make sure the build passes (it lints too) before calling the work done.
Run `npm run format` before building if the Prettier check fails.

Lint is oxlint, not ESLint: typescript-eslint can't read TypeScript 7, while
oxlint's type-aware rules (`oxlint-tsgolint`) are built on it. Config is in
`.oxlintrc.json`; promise mistakes (`no-floating-promises`,
`no-misused-promises`) are errors. Prettier's config is `.prettierrc.json`
(single quotes, 130 columns); `index.html` and Markdown are left alone.

## Stack

TypeScript (strict), Vite and Vitest, with no runtime libraries or framework:
- plain DOM through the `h()` / `svg()` helpers in `src/ui/dom.ts`;
- native `<dialog>`s, opened through `src/ui/dialog.ts`;
- a 2D canvas for the map;
- the Web Audio API for sound.

Ship designs and scenarios are JSON in `public/data/`. Designs are in a folder
per fleet (`designs/red/`, `designs/green/`), and each scenario player names
their `fleet`.

## Architecture

- `src/rules/` holds the game rules as pure functions with no browser
  dependencies. Keep it that way: it is what makes a computer player possible
  later.
- `src/game/` holds the immutable `GameState` and turn flow. `src/main.ts`
  (the `Game` class) drives the UI from it.
- `src/view/` turns state into a `Scene`, which `CanvasRenderer` draws
  through a `Projection`.
- `src/ui/` holds the panels and dialogs. Logic worth testing goes in a
  pure `*Model.ts` module next to the DOM code, as in `firePanelModel.ts` and
  `targetingModel.ts`.
- Tests mirror `src/` under `tests/`.

## Conventions

- **Spelling:** British in code and text (`colour`), with distance in mu.
- **Comments:** doc comments explain what and why, in plain English.
- **Player colours:** Player One `#4cc27a` (green), Player Two `#e8322b`
  (red). They are set in the scenario JSON.
- **README:** keep it short: what the repo is, the tech stack, how to build
  and run, Credits, Licences and Disclaimer. Feature detail lives in `docs/guide.md`; keep that up
  to date with every user-visible change. Unbuilt work goes in `TODO.md`.
- **Commits:** only when the user asks. Use one short-line messages, never
  push, and never commit the rules PDF (GZG's copyright). The game links to
  GZG's published copy instead.
- **Art:** the ship sprites are photos of the user's own painted minis,
  `public/assets/ships/<code>-<fleet>.png`, cut out, bow up. A design's
  `length` sets how big it is drawn, per fleet.
- **SSDs:** every ship shares one hull outline drawn in code
  (`src/ui/ssdModel.ts`) at five sizes, 1 for frigates up to 5 for
  battlecruisers. The system icons are the same size on every ship (weapons
  are 40 px), so bigger ships look bigger. A design's `ssd` gives its size and
  weapon rows; everything else is laid out automatically.
- **Sound:** beams, dice, the threshold klaxon and interface sounds are generated in
  `src/audio/sound.ts`. The hull hit, ship destroyed and engine sounds are
  recorded CC0 clips from Kenney in `public/sounds/`, played through
  `playSample`. Credit any new clips under Credits in the README. The sound board
  (`src/ui/soundBoard.ts`) is temporary, for choosing sounds, and opens from the Debug popup. Pulse
  torpedoes use `kenney-digital/laser2.mp3`.
- **Version:** set only in `package.json` (shown as e.g. *V0.0.2* in the
  About popup and in state dumps as `gameVersion`, through `src/version.ts`). Raise it before every publish
  to GitHub Pages; see *Deploying* in `docs/guide.md`.
- **Touch screens:** tablets in landscape only, never portrait. Touch sizes
  (44 px controls, 16 px dropdown text) live in one `@media (pointer: coarse)`
  block at the end of `src/style.css`; the desktop layout is unchanged.
  Focus calls use `preventScroll`, since the page must never scroll.

## Checking in the browser

In dev builds `window.game` is the running `Game`, for poking at it from the
console. For example, `game.select('CL1')` selects a ship, and
`game.startTargeting(id)` starts targeting in the fire phase.

The toolbar's **Debug** button (`src/ui/debugMenu.ts`) shows only on
localhost. It opens the sound board, and copies or saves the game state as
JSON (`src/game/stateDump.ts`). When the user pastes or names a dump, read
`state` for the game and `context` for what the interface was doing.
