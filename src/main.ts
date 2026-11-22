import './style.css';
import { loadCatalogue, type Catalogue } from './data/loader';
import { announcementFor, battleAreaReport } from './game/announcements';
import {
  canFire,
  fireControlsLeft,
  fireRecord,
  fireVolley,
  shipsAbleToFire,
  startFirePhase,
  finishShip,
  pass,
  validTargets,
} from './game/fire';
import {
  assertNever,
  createGame,
  designOf,
  endTurn,
  findPlayer,
  findShip,
  lockInOrders,
  plottingPlayer,
  resign,
  resolveMovement,
  setOrder,
  type GameState,
  type MovementResolution,
  type Phase,
} from './game/state';
import { viewFor } from './game/visibility';
import type { Vec2 } from './rules/course';
import type { MoveResult } from './rules/movement';
import type { Order } from './rules/orders';
import type { Ship } from './rules/ship';
import { easeInOut, pathPoints, pathUpTo, poseAt, type AnimatedPose } from './view/animate';
import type { Circle } from './view/camera';
import { CameraController } from './view/cameraController';
import { CanvasRenderer } from './view/canvasRenderer';
import { OverheadProjection, type Projection } from './view/projection';
import { createPlayback, isFinished, restart, tick, type Playback } from './view/playback';
import type { BoardRenderer } from './view/renderer';
import { buildFireEnvelope, type FireEnvelope } from './view/fireEnvelope';
import { buildScene, pickShip, shipRadiusMu, type Scene, type SceneExplosion, type SceneTargetLine } from './view/scene';
import { enableSoundOnFirstGesture, playClick, setEngineSound } from './audio/sound';
import { isLocalHost } from './ui/localHost';
import { renderCourseClock } from './ui/courseClock';
import { Targeting } from './ui/targeting';
import { firedStatus, targetsFor, type FireTarget } from './ui/targetingModel';
import { renderFirePanel } from './ui/firePanel';
import { buildFirePanel, finishShipWarning, passWarning } from './ui/firePanelModel';
import { announceInitiative } from './ui/initiativeDialog';
import { announce, choose, confirm, isDialogOpen } from './ui/dialog';
import { getElement } from './ui/dom';
import { bindMapInput } from './ui/mapInput';
import { showDebugMenu, type DebugSource } from './ui/debugMenu';
import { showIntro } from './ui/introScreen';
import { renderOrderPanel } from './ui/orderPanel';
import { buildToolbar } from './ui/toolbarModel';
import { buildOrderPanel } from './ui/orderPanelModel';
import { cycleShip } from './ui/shipCycle';
import { renderSsd, type WeaponMark } from './ui/ssdPanel';

const BASE_URL = import.meta.env.BASE_URL;
const DATA_URL = `${BASE_URL}data/`;
const ASSETS_URL = `${BASE_URL}assets/`;

const MOVE_DURATION_MS = 2400;
const ZOOM_STEP = 1.35;
const EXPLOSION_DURATION_MS = 1400;
/** Phases in which the side panel shows weapons fire rather than movement orders. */
const FIRE_PHASES: ReadonlySet<Phase['kind']> = new Set(['firing', 'fireComplete', 'gameOver']);
/** The selected ship's range circles and arc lines, in every phase. */
const RANGE_COLOUR = '#2f6fd6';

interface Animation {
  moves: Record<string, MoveResult>;
  playback: Playback;
  /** The game as it stood before the move, which is what the animation draws. */
  before: GameState;
  /** The state to switch to when the animation ends, or null when replaying a move already made. */
  next: GameState | null;
}

interface TargetingSession {
  controller: Targeting;
  shooterId: string;
  /** The game before this ship fired. */
  before: GameState;
  /** The game after each volley so far. */
  state: GameState;
  /** What the map shows: it catches up with `state` as each volley finishes playing out. */
  shown: GameState;
  /** The target the camera last fitted, so stepping back to the same one doesn't refit. */
  fittedId: string | null;
}

class Game {
  private readonly projection: Projection = new OverheadProjection();
  private readonly renderer: BoardRenderer;
  private readonly canvas = getElement<HTMLCanvasElement>('map');
  private readonly ordersContainer = getElement('orders');
  private readonly ordersHeading = getElement('orders-heading');
  private readonly ssdContainer = getElement('ssd');
  private readonly ssdPanel = getElement('ssd-panel');
  private readonly turnStatus = getElement('turn-status');
  private readonly executeButton = getElement<HTMLButtonElement>('execute');
  private readonly resignButton = getElement<HTMLButtonElement>('resign');
  private readonly app = getElement('app');
  private readonly targetSide = getElement('target-side');
  private readonly shipNav = getElement('ship-nav');
  private readonly courseClock = getElement('course-clock');

  private readonly view: CameraController;
  private selectedShipId: string | null = null;
  private animation: Animation | null = null;
  /** The most recent movement phase, kept so it can be replayed. */
  private lastMovement: { moves: Record<string, MoveResult>; before: GameState } | null = null;
  /** Paths from the most recent movement phase, by ship id. */
  private trails: Record<string, Vec2[]> = {};
  private scene: Scene;
  private frameRequested = false;
  /**
   * The targeting session while a firing ship has a target on show: the
   * controller, the game before it fired, and the game after each volley so
   * far, which the map draws until the session ends.
   */
  private targeting: TargetingSession | null = null;
  /** Ships blowing up on the map. */
  private explosions: { position: Vec2; length: number; startedAt: number }[] = [];

  /** Removes every event listener this game added when it is disposed. */
  private readonly listeners = new AbortController();
  private readonly resizeObserver = new ResizeObserver(() => this.requestFrame());
  private disposed = false;

  /**
   * @param onMenu called when the players confirm they want to leave for the
   *   scenario list. The caller disposes the game.
   */
  constructor(
    private state: GameState,
    private readonly onMenu: () => void,
  ) {
    this.renderer = new CanvasRenderer(this.canvas, this.projection, ASSETS_URL, () => this.requestFrame());
    this.view = new CameraController(this.projection, this.renderer, () => this.requestFrame());
    this.scene = buildScene(state);
    this.view.jumpToFit(this.shipCircles(state.ships));
    this.bindToolbar();
    this.bindMap();
    this.resizeObserver.observe(this.canvas);
    renderCourseClock(this.courseClock);
    void this.enter(state, null);
  }

  // ----- Turn flow -----

  /**
   * The player whose eyes are on the screen: the one plotting orders, or null
   * during movement, when nothing is secret.
   */
  private get viewerId(): string | null {
    return plottingPlayer(this.state)?.id ?? null;
  }

  /**
   * Moves the game on to `next`. Shows the dialog for any phase or sub-phase
   * that has just started, then starts the ships moving once every player has
   * locked in their orders.
   */
  private async enter(next: GameState, previous: GameState | null): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.state = next;
    // A destroyed ship can't stay selected.
    if (this.selectedShipId !== null && findShip(next, this.selectedShipId) === undefined) {
      this.selectedShipId = null;
    }
    const plotter = plottingPlayer(next);
    const newSubPhase =
      plotter !== null && (previous === null || plottingPlayer(previous)?.id !== plotter.id || previous.turn !== next.turn);
    if (newSubPhase) {
      // Each player starts their sub-phase with one of their own ships
      // selected, so its orders are ready to plot.
      const selected = this.selectedShipId === null ? undefined : findShip(next, this.selectedShipId);
      if (selected === undefined || selected.playerId !== plotter.id) {
        this.selectedShipId = cycleShip(next.ships, null, 1, plotter.id)?.id ?? null;
      }
      // Show every ship, theirs and the enemy's, wherever the last player
      // left the camera. The game opens like this, so skip it at the start.
      if (previous !== null) {
        this.fitAllShips();
      }
    }
    // When movement begins, work out the moves now and zoom out to show every
    // ship, from where it starts to where it will end up, before anything moves.
    const resolution = next.phase.kind === 'moving' && previous?.phase.kind !== 'moving' ? resolveMovement(next) : null;
    if (resolution !== null) {
      // Nothing stays selected while the ships move, so no range circles or
      // highlight distract from the movement.
      this.selectedShipId = null;
      this.view.fit(
        Object.entries(resolution.moves).flatMap(([shipId, move]) => {
          const radius = this.ringRadius(shipId);
          return pathPoints(move).map((point) => ({ ...point, radius }));
        }),
      );
    }
    // Once firing is over, step back to show the whole battle.
    if (next.phase.kind === 'fireComplete' && previous?.phase.kind !== 'fireComplete') {
      this.fitAllShips();
    }
    const announcement = announcementFor(previous, next);
    // At the start of each go in the fire phase, pick a ship that can fire
    // (the one still firing, if any) and show its reach.
    if (next.phase.kind === 'firing' && announcement !== null) {
      const phase = next.phase;
      const firstShip = phase.activeShipId ?? shipsAbleToFire(next, phase.playerId)[0]?.id ?? null;
      this.select(firstShip, true);
    }
    this.renderPanels();
    this.requestFrame();

    if (announcement !== null) {
      const initiative = next.fire?.initiative;
      const winner = initiative ? findPlayer(next, initiative.winnerId) : undefined;
      const phase = next.phase;
      const first = phase.kind === 'firing' ? findPlayer(next, phase.playerId) : undefined;
      if (previous?.phase.kind === 'movementComplete' && initiative && winner !== undefined && first !== undefined) {
        await announceInitiative(next.players, initiative.rounds, winner, first, announcement);
      } else {
        await announce({
          eyebrow: `Turn ${announcement.turn}`,
          title: announcement.title,
          subtitle: announcement.subtitle,
          detail: announcement.detail,
          help: announcement.help,
          colour: announcement.colour,
          buttonLabel: next.phase.kind === 'gameOver' ? 'Back to scenarios' : undefined,
        });
      }
    }

    if (this.disposed) {
      return;
    }
    // The dialog hands focus back to whatever had it before, which may be
    // nothing (at the start of a game, the intro's Play button is gone). Give
    // it to the main button so Space or Enter carries on with the turn.
    this.focusMainActionIfLost();
    if (next.phase.kind === 'gameOver') {
      // The game is won: straight back to the scenario list, no "leave?" question.
      this.onMenu();
      return;
    }
    if (next.phase.kind === 'moving' && this.state === next && resolution !== null) {
      this.startMovement(resolution);
    }
    this.renderPanels();
  }

  /**
   * The main action button. While plotting it locks in the plotting player's
   * orders; once the ships have moved it starts the fire phase; during the
   * fire phase it passes the firing player's go, or finishes the ship they
   * are part-way through firing; and once firing is over it ends the turn.
   */
  private async mainAction(): Promise<void> {
    if (this.animation !== null || this.targeting !== null || isDialogOpen()) {
      return;
    }
    const phase = this.state.phase;
    const previous = this.state;
    switch (phase.kind) {
      case 'plotting':
        await this.lockIn();
        break;
      case 'movementComplete':
        // Replaying the move from here on would bring destroyed ships back, so it ends now.
        this.lastMovement = null;
        await this.enter(startFirePhase(previous, Math.random), previous);
        break;
      case 'firing':
        await (phase.activeShipId === null ? this.passGo() : this.finishActiveShip());
        break;
      case 'fireComplete':
        await this.enter(endTurn(previous), previous);
        break;
      case 'moving':
      case 'gameOver':
        // Nothing to do: the ships are moving, or the game is over.
        break;
      default:
        assertNever(phase);
    }
    this.focusMainActionIfLost();
  }

  /**
   * The firing player passes their go, after a warning that lists the ships
   * that could still fire and says what passing means. Cancel has the focus,
   * so a stray Enter can't pass by accident.
   */
  private async passGo(): Promise<void> {
    const phase = this.state.phase;
    if (phase.kind !== 'firing' || phase.activeShipId !== null) {
      return;
    }
    const previous = this.state;
    const player = findPlayer(previous, phase.playerId);
    const warning = passWarning(previous, phase.playerId);
    const confirmed = await confirm({
      title: warning.title,
      message: warning.message,
      confirmLabel: 'Pass',
      colour: player?.colour ?? null,
      safeDefault: true,
    });
    if (!confirmed || this.state !== previous) {
      return;
    }
    await this.enter(pass(previous, phase.playerId), previous);
  }

  /**
   * The ship part-way through firing finishes, though it could still fire,
   * after a warning saying what it could still hit. Cancel has the focus.
   */
  private async finishActiveShip(): Promise<void> {
    const phase = this.state.phase;
    if (phase.kind !== 'firing' || phase.activeShipId === null) {
      return;
    }
    const previous = this.state;
    const player = findPlayer(previous, phase.playerId);
    const warning = finishShipWarning(previous, phase.playerId);
    const confirmed = await confirm({
      title: warning.title,
      message: warning.message,
      confirmLabel: `Finish ${phase.activeShipId}`,
      colour: player?.colour ?? null,
      safeDefault: true,
    });
    if (!confirmed || this.state !== previous) {
      return;
    }
    await this.enter(finishShip(previous, phase.playerId), previous);
  }

  /**
   * The selected ship, if it belongs to the player whose go it is and may
   * fire now: not finished, something in reach, and no other ship part-way
   * through firing.
   */
  private firingShip(): Ship | null {
    const phase = this.state.phase;
    const ship = this.selectedShipId === null ? undefined : findShip(this.state, this.selectedShipId);
    if (phase.kind !== 'firing' || ship === undefined || ship.playerId !== phase.playerId) {
      return null;
    }
    if (phase.activeShipId !== null && phase.activeShipId !== ship.id) {
      return null;
    }
    return canFire(this.state, ship.id) ? ship : null;
  }

  /**
   * Where the selected ship's beams and torpedoes reach, in any phase: in the
   * fire phase only the weapons it hasn't fired yet. `pose` places it part-way through a
   * move while the movement plays.
   */
  private rangeEnvelope(state: GameState, pose?: AnimatedPose): FireEnvelope | null {
    const ship = this.selectedShipId === null ? undefined : findShip(state, this.selectedShipId);
    if (ship === undefined || state.phase.kind === 'gameOver') {
      return null;
    }
    const design = designOf(state, ship);
    const weaponsFired = FIRE_PHASES.has(state.phase.kind) ? fireRecord(state, ship.id).weaponsFired : [];
    const position = pose === undefined ? ship : { position: pose.position, course: ship.course };
    // Knocked-out weapons never fire again, so they are left out like fired ones.
    const unusable = [...weaponsFired, ...ship.weaponsLost];
    return buildFireEnvelope(position, design, unusable, RANGE_COLOUR, pose?.heading);
  }

  /**
   * Shows `targetId` as the selected firing ship's target: the target's SSD
   * opens in a column beside the firing ship's, the map narrows to make room
   * and fits every ship, and the controls to choose weapons and fire appear
   * under the firing ship's SSD. The player can step through every ship it
   * could fire at, and fire at several in turn while it has fire controls.
   */
  private startTargeting(targetId: string): void {
    const shooter = this.firingShip();
    if (shooter === null || this.targeting !== null || isDialogOpen()) {
      return;
    }
    const before = this.state;
    const targets = targetsFor(before, shooter.id);
    const startIndex = targets.findIndex((target) => target.ship.id === targetId);
    if (startIndex === -1) {
      return;
    }
    const shooterDesign = designOf(before, shooter);
    const colours = new Map(before.players.map((player) => [player.id, player.colour]));
    this.app.classList.add('targeting');
    const controller = new Targeting({
      shooter,
      shooterDesign,
      targets,
      startIndex,
      fireControlsLeft: fireControlsLeft(before, shooter),
      colour: colours.get(shooter.playerId) ?? '#ffffff',
      playerColours: colours,
      firedStatus: (shipId) => firedStatus(before, shipId),
      targetSide: this.targetSide,
      shooterContainer: this.ssdContainer,
      controlsContainer: this.ordersContainer,
      fire: (chosenTargetId, weapons) => {
        const result = fireVolley(session.state, shooter.id, chosenTargetId, weapons, Math.random);
        const after = result.next;
        session.state = after;
        return {
          volley: result.volley,
          targets: targetsFor(after, shooter.id),
          fireControlsLeft: fireControlsLeft(after, shooter),
          firedStatus: (shipId) => firedStatus(after, shipId),
        };
      },
      onTargetShown: (target) => this.showTarget(target),
      onHullDamageShown: (targetId, hullDamage) => {
        session.shown = {
          ...session.shown,
          ships: session.shown.ships.map((ship) => (ship.id === targetId ? { ...ship, hullDamage } : ship)),
        };
        this.requestFrame();
      },
      onVolleyShown: (volley) => {
        session.shown = session.state;
        const wreck = volley.destroyed ? findShip(before, volley.targetId) : undefined;
        if (wreck !== undefined) {
          const length = designOf(before, wreck).length;
          this.explosions.push({ position: { ...wreck.position }, length, startedAt: performance.now() });
        }
        this.requestFrame();
      },
      onClose: () => void this.closeTargeting(),
    });
    const session: TargetingSession = { controller, shooterId: shooter.id, before, state: before, shown: before, fittedId: null };
    this.targeting = session;
    this.renderPanels();
    controller.start();
  }

  /** Fits every ship into the map, narrowed now for the target's column, when a new target is shown. */
  private showTarget(target: FireTarget | null): void {
    const targeting = this.targeting;
    this.requestFrame();
    if (targeting === null || target === null || targeting.fittedId === target.ship.id) {
      return;
    }
    targeting.fittedId = target.ship.id;
    // The target column has just taken some of the map's width; the fit measures it afresh.
    this.fitAllShips();
  }

  /** Ends targeting: closes the target column and applies whatever was fired. */
  private async closeTargeting(): Promise<void> {
    const targeting = this.targeting;
    if (targeting === null) {
      return;
    }
    this.targeting = null;
    targeting.controller.dispose();
    this.app.classList.remove('targeting');
    this.renderer.resize();
    this.requestFrame();
    if (this.disposed) {
      return;
    }
    // The map has widened again: fit every ship into it, unless a new go's
    // announcement picks a ship and fits the map itself.
    const refit = targeting.state.phase.kind === 'firing' && announcementFor(targeting.before, targeting.state) === null;
    if (targeting.controller.fired) {
      this.selectedShipId = targeting.shooterId;
      await this.enter(targeting.state, targeting.before);
    } else {
      this.renderPanels();
    }
    if (refit && this.selectedShipId === targeting.shooterId && !this.disposed) {
      this.fitAllShips();
    }
    this.focusMainActionIfLost();
  }

  /** Asks the plotting player to confirm, then locks in their orders. */
  private async lockIn(): Promise<void> {
    const player = plottingPlayer(this.state);
    if (player === null || this.animation !== null || isDialogOpen()) {
      return;
    }
    const confirmed = await confirm({
      title: `Lock in ${player.name}'s orders?`,
      message: "Locked-in orders can't be changed, and stay hidden from the other side until the ships move.",
      confirmLabel: 'Lock in',
      colour: player.colour,
    });
    if (!confirmed || plottingPlayer(this.state)?.id !== player.id) {
      return;
    }
    const previous = this.state;
    await this.enter(lockInOrders(previous, player.id), previous);
  }

  /**
   * A player resigns, after confirming, and the other side wins. While a
   * player is plotting or firing, it's that player who resigns; otherwise
   * the players choose which side. Cancel has the focus either way.
   */
  private async askToResign(): Promise<void> {
    const phase = this.state.phase;
    if (isDialogOpen() || phase.kind === 'gameOver' || this.animation !== null || this.targeting !== null) {
      return;
    }
    const previous = this.state;
    const players = previous.players;
    const current = plottingPlayer(previous) ?? (phase.kind === 'firing' ? findPlayer(previous, phase.playerId) : undefined);
    let resigning: string | null = null;
    if (current !== undefined && current !== null) {
      const others = players.filter((player) => player.id !== current.id).map((player) => player.name);
      const confirmed = await confirm({
        title: `Resign, ${current.name}?`,
        message: `${others.join(' and ')} will win the game. This can't be undone.`,
        confirmLabel: 'Resign',
        colour: current.colour,
        safeDefault: true,
      });
      resigning = confirmed ? current.id : null;
    } else {
      const choice = await choose({
        title: 'Resign the game?',
        message: "Which side resigns? The other side wins the game. This can't be undone.",
        choices: [
          { value: '', label: 'Cancel', focus: true },
          ...players.map((player) => ({ value: player.id, label: `${player.name} resigns` })),
        ],
      });
      resigning = choice === '' ? null : choice;
    }
    if (resigning === null || this.state !== previous || this.disposed) {
      return;
    }
    await this.enter(resign(previous, resigning), previous);
  }

  /** Asks whether to abandon this game and go back to the scenario list. */
  private async askToLeave(): Promise<void> {
    if (isDialogOpen()) {
      return;
    }
    const leave = await confirm({
      title: 'Leave this game?',
      message: "It won't be saved. You'll go back to the scenario list.",
      confirmLabel: 'Leave game',
    });
    if (leave && !this.disposed) {
      this.onMenu();
    }
  }

  /** The game state and what the interface is doing, for the Debug popup's state dump. */
  debugSource(): DebugSource {
    return {
      state: this.state,
      context: {
        selectedShipId: this.selectedShipId,
        targetingShipId: this.targeting?.shooterId ?? null,
        animating: this.animation !== null,
        camera: this.view.camera,
        viewport: this.renderer.viewport,
      },
    };
  }

  /**
   * Stops this game: removes its event listeners and stops drawing, so a new
   * game can take over the same page.
   */
  dispose(): void {
    this.disposed = true;
    this.listeners.abort();
    setEngineSound(false);
    this.resizeObserver.disconnect();
    this.animation = null;
    this.view.stop();
    this.targeting?.controller.dispose();
    this.targeting = null;
    this.app.classList.remove('targeting');
    this.ordersContainer.replaceChildren();
    this.courseClock.hidden = true;
    this.ssdContainer.replaceChildren();
    this.ssdPanel.style.removeProperty('--player-colour');
    delete this.ssdPanel.dataset.player;
    this.turnStatus.replaceChildren();
  }

  // ----- Panels -----

  private renderPanels(): void {
    // Draw from the viewer's view of the game, so another side's secret orders never reach the screen.
    const viewerId = this.viewerId;
    const view = viewFor(this.state, viewerId);
    const firePhase = FIRE_PHASES.has(this.state.phase.kind);
    const targeting = this.targeting !== null;
    this.ordersHeading.textContent = targeting ? 'Targeting' : firePhase ? 'Weapons fire' : 'Movement orders';
    // While targeting, the targeting controls own the SSD and the panel below it.
    this.shipNav.hidden = targeting;
    // The course clock helps with plotting, so it shows only then.
    this.courseClock.hidden = this.state.phase.kind !== 'plotting';
    if (targeting) {
      // Nothing to draw here.
    } else if (firePhase) {
      renderFirePanel(this.ordersContainer, buildFirePanel(view, this.selectedShipId));
    } else {
      renderOrderPanel(this.ordersContainer, buildOrderPanel(view, this.selectedShipId, viewerId), view.players, {
        onOrder: (shipId, order) => this.plotOrder(shipId, order),
      });
    }
    const ship = this.selectedShipId === null ? null : (findShip(this.state, this.selectedShipId) ?? null);
    const design = ship === null ? null : designOf(this.state, ship);
    // In the fire phase, fade the weapons the ship has already fired this turn.
    const weaponMarks = new Map<number, WeaponMark>();
    if (ship !== null && design !== null && firePhase) {
      for (const index of fireRecord(this.state, ship.id).weaponsFired) {
        weaponMarks.set(index, 'fired');
      }
    }
    if (!targeting) {
      renderSsd(this.ssdContainer, ship, design, { weaponMarks });
    }
    // Tint the panel with the owning player's colour so it's clear whose ship this is.
    const owner = ship === null ? undefined : findPlayer(this.state, ship.playerId);
    if (owner === undefined) {
      this.ssdPanel.style.removeProperty('--player-colour');
      delete this.ssdPanel.dataset.player;
    } else {
      this.ssdPanel.style.setProperty('--player-colour', owner.colour);
      this.ssdPanel.dataset.player = owner.id;
    }

    const toolbar = buildToolbar(this.state, {
      animating: this.animation !== null,
      replayTurn: this.animation !== null && this.animation.next === null ? this.animation.before.turn : null,
      targeting,
    });
    const turn = document.createElement('strong');
    turn.textContent = toolbar.turn;
    this.turnStatus.replaceChildren(turn, ` · ${toolbar.activity}`);
    this.executeButton.textContent = toolbar.main.label;
    this.executeButton.title = toolbar.main.title;
    this.executeButton.disabled = toolbar.main.disabled;
    if (toolbar.main.colour === null) {
      this.executeButton.style.removeProperty('--lock-colour');
    } else {
      this.executeButton.style.setProperty('--lock-colour', toolbar.main.colour);
    }
    this.resignButton.disabled = toolbar.resignDisabled;
  }

  private plotOrder(shipId: string, order: Order): void {
    try {
      this.state = setOrder(this.state, shipId, order);
      this.selectedShipId = shipId;
    } catch (error) {
      // The inputs only offer legal values, so this is a safety net.
      console.warn(error);
    }
    this.renderPanels();
    this.requestFrame();
  }

  /**
   * Selects a ship. While plotting or firing, selecting any ship, by any
   * means and even the one already selected, fits every ship on the map, as
   * Fit all does, so the enemy stays in sight. At other times `centre`
   * (Prev / Next ship) centres the map on the ship.
   */
  private select(shipId: string | null, centre: boolean): void {
    this.selectedShipId = shipId;
    const ship = shipId === null ? undefined : findShip(this.state, shipId);
    const phase = this.state.phase;
    if (ship !== undefined && (phase.kind === 'plotting' || phase.kind === 'firing')) {
      this.fitAllShips();
    } else if (centre && ship !== undefined) {
      this.view.centreOn(ship.position);
    }
    this.renderPanels();
    this.requestFrame();
  }

  /**
   * Steps through the plotting player's ships, or the firing player's ships,
   * or every ship otherwise.
   */
  private cycleShip(step: 1 | -1): void {
    if (this.targeting !== null) {
      return;
    }
    const phase = this.state.phase;
    const playerId = phase.kind === 'firing' ? phase.playerId : this.viewerId;
    const ship = cycleShip(this.state.ships, this.selectedShipId, step, playerId);
    if (ship !== null) {
      this.select(ship.id, true);
    }
  }

  /**
   * A click on the map: show a highlighted enemy as the target, or select
   * whatever was clicked. While targeting, another highlighted enemy becomes
   * the target, and anything else ends targeting.
   */
  private clickShip(shipId: string | null): void {
    const targeting = this.targeting;
    if (targeting !== null) {
      if (targeting.controller.busy || (shipId !== null && targeting.controller.switchTo(shipId))) {
        return;
      }
      const fired = targeting.controller.fired;
      targeting.controller.cancel();
      if (!fired) {
        this.select(shipId, false);
      }
      return;
    }
    const shooter = this.firingShip();
    if (shooter !== null && shipId !== null && validTargets(this.state, shooter).some((target) => target.id === shipId)) {
      this.startTargeting(shipId);
      return;
    }
    this.select(shipId, false);
  }

  // ----- Camera -----

  /** Radius of a ship's base ring in mu, so fitting the view leaves the whole ring on screen. */
  private ringRadius(shipId: string): number {
    const ship = findShip(this.state, shipId);
    return ship === undefined ? 0 : shipRadiusMu(designOf(this.state, ship).length);
  }

  private shipCircles(ships: readonly { id: string; position: Vec2 }[]): Circle[] {
    return ships.map((ship) => ({ ...ship.position, radius: this.ringRadius(ship.id) }));
  }

  /** Fits every ship on the map, as Fit all does. */
  private fitAllShips(): void {
    this.view.fit(this.shipCircles(this.state.ships));
  }

  private bindToolbar(): void {
    getElement('prev-ship').addEventListener('click', () => this.cycleShip(-1), { signal: this.listeners.signal });
    getElement('next-ship').addEventListener('click', () => this.cycleShip(1), { signal: this.listeners.signal });
    getElement('fit-all').addEventListener('click', () => this.fitAllShips(), { signal: this.listeners.signal });
    getElement('menu').addEventListener('click', () => void this.askToLeave(), { signal: this.listeners.signal });
    this.resignButton.addEventListener('click', () => void this.askToResign(), { signal: this.listeners.signal });
    getElement('zoom-in').addEventListener('click', () => this.view.zoomBy(ZOOM_STEP), { signal: this.listeners.signal });
    getElement('zoom-out').addEventListener('click', () => this.view.zoomBy(1 / ZOOM_STEP), { signal: this.listeners.signal });
    this.executeButton.addEventListener('click', () => void this.mainAction(), { signal: this.listeners.signal });
    // Escape ends targeting (dialogs handle their own Escape).
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && this.targeting !== null && !isDialogOpen()) {
          event.preventDefault();
          this.targeting.controller.cancel();
        }
      },
      { signal: this.listeners.signal },
    );
  }

  /** Drag to pan, scroll or pinch to zoom, and click to pick a ship. */
  private bindMap(): void {
    bindMapInput(this.canvas, this.listeners.signal, {
      onPan: (from, to) => {
        this.view.pan(from, to);
        this.requestFrame();
      },
      onZoom: (point, factor) => {
        this.view.zoomAt(point, factor);
        this.requestFrame();
      },
      onClick: (point) => {
        const picked = pickShip(this.scene, point, this.view.camera, this.renderer.viewport, this.projection);
        this.clickShip(picked?.id ?? null);
      },
    });
  }

  // ----- Movement phase -----

  /** Starts animating everyone's moves. The game moves on to the next turn when it ends. */
  private startMovement(resolution: MovementResolution): void {
    if (this.state.phase.kind !== 'moving' || (this.animation !== null && this.animation.next !== null)) {
      return;
    }
    const before = this.state;
    this.trails = {};
    this.animation = {
      moves: resolution.moves,
      playback: createPlayback(MOVE_DURATION_MS),
      before,
      next: resolution.next,
    };
    this.lastMovement = { moves: resolution.moves, before };
    this.renderPanels();
    this.requestFrame();
  }

  /**
   * Plays the movement again from the start, from the Movement complete
   * popup. While ships are moving this restarts the animation; afterwards it
   * replays the last turn's movement without changing the game.
   */
  private replay(): void {
    if (this.animation !== null) {
      restart(this.animation.playback);
    } else if (this.lastMovement !== null) {
      this.animation = {
        moves: this.lastMovement.moves,
        playback: createPlayback(MOVE_DURATION_MS),
        before: this.lastMovement.before,
        next: null,
      };
    } else {
      return;
    }
    this.renderPanels();
    this.requestFrame();
  }

  private finishMovement(animation: Animation): void {
    this.animation = null;
    this.trails = Object.fromEntries(Object.entries(animation.moves).map(([shipId, move]) => [shipId, pathPoints(move)]));
    if (animation.next === null) {
      this.renderPanels();
      void this.afterMovement();
      return;
    }
    // The ships stay where they finished; the players can watch the move
    // again before going on to the fire phase.
    void this.enter(animation.next, this.state).then(() => this.afterMovement());
  }

  /**
   * Once the ships have finished moving (or a replay of the move has ended),
   * asks the players whether to watch it again or go on to the fire phase.
   * Escape closes the question and leaves the Fire phase button.
   */
  private async afterMovement(): Promise<void> {
    if (this.disposed || this.state.phase.kind !== 'movementComplete' || this.animation !== null || isDialogOpen()) {
      this.focusMainActionIfLost();
      return;
    }
    const choice = await choose({
      eyebrow: `Turn ${this.state.turn}`,
      title: 'Movement complete',
      message: 'Every ship has moved. Watch the movement again, or go on to the weapons fire phase.',
      notes: battleAreaReport(this.state),
      choices: [
        { value: 'replay', label: '↺ Replay movement' },
        { value: 'fire', label: 'Go to fire phase', primary: true },
      ],
    });
    if (this.disposed || this.state.phase.kind !== 'movementComplete') {
      return;
    }
    if (choice === 'replay') {
      this.replay();
    } else if (choice === 'fire') {
      await this.mainAction();
    } else {
      this.focusMainActionIfLost();
    }
  }

  /**
   * The main button is disabled while ships move, and a disabled button loses
   * keyboard focus. Once it is usable again, give it focus back so Enter or
   * Space presses it, unless the player has since focused something else.
   */
  private focusMainActionIfLost(): void {
    // Not during firing, where the button passes or finishes a ship: a stray Enter mustn't do that.
    // A closing dialog hands focus back to whatever had it, which can be this button from before
    // the fire phase began, so take it away too.
    if (this.state.phase.kind === 'firing') {
      if (document.activeElement === this.executeButton) {
        this.executeButton.blur();
      }
      return;
    }
    const active = document.activeElement;
    if ((active === null || active === document.body) && !this.executeButton.disabled && !isDialogOpen()) {
      this.executeButton.focus({ preventScroll: true });
    }
  }

  // ----- Drawing -----

  private requestFrame(): void {
    if (this.frameRequested || this.disposed) {
      return;
    }
    this.frameRequested = true;
    requestAnimationFrame((now) => {
      this.frameRequested = false;
      if (this.disposed) {
        return;
      }
      this.frame(now);
    });
  }

  private frame(now: number): void {
    this.renderer.resize();
    let again = this.view.update(now);

    let poses: Record<string, AnimatedPose> | undefined;
    let trails = this.trails;
    // While a move plays, the scene shows the ships as they were before it.
    let shown = this.targeting?.shown ?? this.state;
    if (this.animation !== null) {
      const animation = this.animation;
      const t = tick(animation.playback, now);
      if (isFinished(animation.playback)) {
        this.finishMovement(animation);
        trails = this.trails;
        shown = this.state;
      } else {
        shown = animation.before;
        const progress = easeInOut(t);
        poses = {};
        trails = {};
        for (const [shipId, move] of Object.entries(animation.moves)) {
          poses[shipId] = poseAt(move, progress);
          trails[shipId] = pathUpTo(move, progress);
        }
        again = true;
      }
    }

    // Fire phase extras: the firing ship's reach, its targets, and explosions.
    const shooter = this.animation === null ? this.firingShip() : null;
    let targetIds = shooter === null ? null : new Set(validTargets(this.state, shooter).map((target) => target.id));
    // While targeting: the ships it can still fire at, and a line to the one on show.
    let targetLine: SceneTargetLine | null = null;
    if (this.targeting !== null) {
      targetIds = this.targeting.controller.targetIds;
      const target = this.targeting.controller.target;
      const from = findShip(shown, this.targeting.shooterId);
      const to = target === null ? undefined : findShip(shown, target.ship.id);
      if (from !== undefined && to !== undefined && target !== null) {
        targetLine = {
          from: from.position,
          to: to.position,
          fromLength: designOf(shown, from).length,
          toLength: target.design.length,
          label: `${target.range.toFixed(1)} mu`,
        };
      }
    }
    this.explosions = this.explosions.filter((explosion) => now - explosion.startedAt < EXPLOSION_DURATION_MS);
    const explosions: SceneExplosion[] = this.explosions.map((explosion) => ({
      position: explosion.position,
      length: explosion.length,
      progress: Math.max(0, (now - explosion.startedAt) / EXPLOSION_DURATION_MS),
    }));
    // Targets and the selected ship pulse and explosions grow, so keep drawing while any is on screen.
    const selectedShown = this.selectedShipId !== null && findShip(shown, this.selectedShipId) !== undefined;
    again = again || selectedShown || (targetIds !== null && targetIds.size > 0) || explosions.length > 0;

    // Engines hum while the ships are moving on screen.
    setEngineSound(this.animation !== null);

    this.scene = buildScene(shown, {
      selectedShipId: this.selectedShipId,
      poses,
      trails,
      targetIds,
      targetLine,
      fireEnvelope: this.rangeEnvelope(shown, this.selectedShipId === null ? undefined : poses?.[this.selectedShipId]),
      explosions,
      time: now,
    });
    this.renderer.render(this.scene, this.view.camera);
    if (again) {
      this.requestFrame();
    }
  }
}

/** Draws the empty starfield on the map, as a backdrop for the intro screen. */
function drawBackdrop(): void {
  const canvas = getElement<HTMLCanvasElement>('map');
  const projection = new OverheadProjection();
  const renderer = new CanvasRenderer(canvas, projection, ASSETS_URL, () => undefined);
  renderer.resize();
  renderer.render({ ships: [], trails: [] }, { centre: { x: 0, y: 0 }, zoom: 10 });
}

/** The game being played, for the Debug popup. Null on the scenario list. */
let currentGame: Game | null = null;

/**
 * Shows the scenario list, then plays the chosen scenario. Leaving a game
 * through Menu comes back here.
 */
async function showMenuThenPlay(catalogue: Catalogue): Promise<void> {
  drawBackdrop();
  const entry = await showIntro(getElement('intro'), getElement('app'), catalogue.entries);
  const game: Game = new Game(createGame(entry.scenario, catalogue.designs), () => {
    game.dispose();
    currentGame = null;
    void showMenuThenPlay(catalogue);
  });
  currentGame = game;
  if (import.meta.env.DEV) {
    // Handy for poking at the game from the browser console during development.
    (window as unknown as { game: Game }).game = game;
  }
}

/**
 * Shows an error in the message box over the map and logs it. Used for a
 * scenario that fails to load, and for anything unexpected that goes wrong
 * later, so the game never just stops without saying why.
 */
function showError(error: unknown): void {
  const message = getElement('message');
  message.textContent = error instanceof Error ? error.message : String(error);
  message.hidden = false;
  console.error(error);
}

async function start(): Promise<void> {
  window.addEventListener('error', (event) => showError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => showError(event.reason));
  enableSoundOnFirstGesture();
  // A quiet tick for every button press, in the game, the dialogs and the intro.
  document.addEventListener('click', (event) => {
    // Not on the sound board's buttons, so each effect is heard on its own.
    if (event.target instanceof Element && event.target.closest('button:not(.sound-button)') !== null) {
      playClick();
    }
  });
  // The Debug button is for development: only on this machine, never on a deployed copy.
  const debug = getElement('debug');
  if (isLocalHost(location.hostname)) {
    debug.addEventListener('click', () => void showDebugMenu(currentGame?.debugSource() ?? null));
  } else {
    debug.remove();
  }
  try {
    await showMenuThenPlay(await loadCatalogue(DATA_URL));
  } catch (error) {
    showError(error);
  }
}

void start();
