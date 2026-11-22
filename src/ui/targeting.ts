import { playBeam, playExplosion, playSelect, playTorpedo } from '../audio/sound';
import type { Volley } from '../game/fire';
import { ARC_NAMES, weaponLabel, type Ship, type ShipDesign } from '../rules/ship';
import { dieElement, tumble } from './dice';
import { h, svg } from './dom';
import { animateDamage, sleep, toneFor } from './fireEffects';
import { ssdDrawing } from './ssdPanel';
import { animateThreshold } from './thresholdEffects';
import { weaponChoices, type FireTarget, type WeaponChoice } from './targetingModel';
import { plural } from '../text';

/** Beams in one volley fire together, each within this many seconds of the first. */
const BEAM_SPREAD_S = 0.03;
/** How long after the beams fire the dice are thrown, so the crack of the shot is heard first. */
const DICE_AFTER_BEAMS_MS = 150;
/** Torpedoes in one volley launch one after another, this far apart. */
const TORPEDO_STAGGER_MS = 140;
/** How long after the first torpedo launches its to-hit dice are thrown. */
const DICE_AFTER_TORPEDOES_MS = 450;

/** What a volley did, and what the shooter can still do afterwards. */
export interface FireOutcome {
  volley: Volley;
  /** Ships the shooter can still fire at; empty once it has finished. */
  targets: FireTarget[];
  fireControlsLeft: number;
  /** Text for whether each ship has fired yet, by ship id, after the volley. */
  firedStatus: (shipId: string) => string;
}

export interface TargetingOptions {
  shooter: Ship;
  shooterDesign: ShipDesign;
  /** Every ship the shooter could fire at now; Prev and Next step through them. */
  targets: FireTarget[];
  /** The target to show first, as an index into `targets`. */
  startIndex: number;
  fireControlsLeft: number;
  /** The firing player's colour. */
  colour: string;
  /** Each player's colour, by player id, to tint the target's panel. */
  playerColours: ReadonlyMap<string, string>;
  /** Whether a ship has fired yet this turn, as text. */
  firedStatus: (shipId: string) => string;
  /** The column beside the firing ship's panel that shows the target. */
  targetSide: HTMLElement;
  /** Where the firing ship's SSD goes, with its beams and torpedoes to click. */
  shooterContainer: HTMLElement;
  /** Where the dice pool, target buttons and Fire! go, under the firing ship's SSD. */
  controlsContainer: HTMLElement;
  /** Fires the chosen weapons at a target. Called once per volley. */
  fire(targetId: string, weaponIndexes: number[]): FireOutcome;
  /** A new target is on show (or null after a volley until the next is picked). */
  onTargetShown(target: FireTarget | null): void;
  /**
   * A volley has finished playing out (dice rolled, damage crossed off, any
   * destruction shown), so the map can catch up with it.
   */
  onVolleyShown(volley: Volley): void;
  /** A hull box has just been crossed off the target's SSD, so the map's strength bar can drop with it. */
  onHullDamageShown(targetId: string, hullDamage: number): void;
  /** The player has finished targeting: cancelled, closed or continued. */
  onClose(): void;
}

/**
 * Choosing a target and firing at it, docked beside the map instead of in a
 * popup, so the map stays in view. The target's SSD fills a column next to
 * the firing ship's; the firing ship's beams and torpedoes are clicked on its
 * own SSD; the dice pools, ◀ Prev / Next ▶ and Fire! sit under it; and the dice roll under
 * the target's SSD, which then has its hull boxes crossed off one by one. If
 * the ship can still fire at another ship after a volley, Prev and Next stay
 * to pick it.
 */
export class Targeting {
  private targets: FireTarget[];
  private fireControls: number;
  private current: number;
  /** The target whose SSD is on show; it stays after a volley until another is picked. */
  private shown: FireTarget | null = null;
  private choices: WeaponChoice[] = [];
  private notes: string[] = [];
  private volleyShown = false;
  private busyFiring = false;
  private firedAny = false;
  private closed = false;
  private firedStatus: (shipId: string) => string;
  private shooterDrawing: SVGSVGElement = svg('svg', {});
  private targetDrawing: SVGSVGElement = svg('svg', {});

  private readonly targetHeading = h('h2', {});
  private readonly targetTitle = h('div', { class: 'ssd-header' });
  private readonly targetCard = h('div', { class: 'ssd-card target-ssd-card' });
  private readonly targetFired = h('p', { class: 'target-fired' });
  private readonly targetPanel = h('section', { class: 'panel ssd-panel target-panel' });
  private readonly diceArea = h('div', { class: 'fire-dice', 'aria-live': 'polite' });
  private readonly result = h('p', { class: 'fire-result', 'aria-live': 'polite' });
  private readonly outcomeHint = h('p', { class: 'fire-hint' });
  /** The threshold check after a volley that completes a row of the target's hull boxes. */
  private readonly thresholdArea = h('div', { class: 'threshold', 'aria-live': 'polite', hidden: true });

  private readonly meta = h('p', { class: 'targeting-meta' });
  private readonly poolNumber = h('span', { class: 'dice-pool-number' });
  private readonly poolUnit = h('span', { class: 'dice-pool-unit' });
  private readonly pool = h(
    'div',
    { class: 'dice-pool', 'aria-live': 'polite' },
    h('span', { class: 'dice-pool-label' }, 'Dice pool'),
    this.poolNumber,
    this.poolUnit,
  );
  /** The pulse torpedoes chosen, rolled separately after the beams: how many and the score they need. */
  private readonly torpedoNumber = h('span', { class: 'dice-pool-number' });
  private readonly torpedoUnit = h('span', { class: 'dice-pool-unit' });
  private readonly torpedoPool = h(
    'div',
    { class: 'dice-pool torpedo-pool', 'aria-live': 'polite' },
    h('span', { class: 'dice-pool-label' }, 'Torpedoes'),
    this.torpedoNumber,
    this.torpedoUnit,
  );
  private readonly prevButton = h(
    'button',
    { type: 'button', class: 'fire-target-step', title: 'Show the previous ship you could fire at' },
    '◀ Prev',
  );
  private readonly nextButton = h(
    'button',
    { type: 'button', class: 'fire-target-step', title: 'Show the next ship you could fire at' },
    'Next ▶',
  );
  private readonly targetCount = h('span', { class: 'fire-target-count' });
  private readonly targetNav = h('div', { class: 'fire-target-nav' }, this.prevButton, this.targetCount, this.nextButton);
  private readonly hint = h('p', { class: 'fire-hint' });
  /** Cancel before the first volley; Close (keeping what was fired) after it. */
  private readonly cancelButton = h('button', { type: 'button' }, 'Cancel');
  private readonly fireButton = h('button', { type: 'button', class: 'primary fire-button' }, 'Fire!');
  /** After a volley with more targets left: go straight to the next one. */
  private readonly nextTargetButton = h('button', { type: 'button', class: 'primary', hidden: true }, 'Next target ▶');
  /** After the last volley. */
  private readonly continueButton = h('button', { type: 'button', class: 'primary', hidden: true }, 'Continue');

  constructor(private readonly options: TargetingOptions) {
    this.targets = options.targets;
    this.fireControls = options.fireControlsLeft;
    this.current = Math.min(Math.max(0, options.startIndex), this.targets.length - 1);
    this.firedStatus = options.firedStatus;

    this.targetPanel.append(this.targetHeading, this.targetTitle, this.targetCard, this.targetFired);
    options.targetSide.replaceChildren(
      this.targetPanel,
      h(
        'section',
        { class: 'panel target-outcome' },
        h('h2', {}, 'Dice'),
        this.outcomeHint,
        this.diceArea,
        this.result,
        this.thresholdArea,
      ),
    );
    options.targetSide.hidden = false;

    options.controlsContainer.style.setProperty('--dialog-accent', options.colour);
    options.controlsContainer.replaceChildren(
      h(
        'div',
        { class: 'targeting' },
        this.meta,
        h('div', { class: 'targeting-row' }, h('div', { class: 'dice-pools' }, this.pool, this.torpedoPool), this.targetNav),
        this.hint,
        h('div', { class: 'targeting-actions' }, this.cancelButton, this.fireButton, this.nextTargetButton, this.continueButton),
      ),
    );

    this.prevButton.addEventListener('click', () => {
      this.showTarget(this.current < 0 ? this.targets.length - 1 : this.current - 1);
      this.fireButton.focus();
    });
    this.nextButton.addEventListener('click', () => {
      this.showTarget(this.current + 1);
      this.fireButton.focus();
    });
    this.cancelButton.addEventListener('click', () => this.cancel());
    this.continueButton.addEventListener('click', () => this.cancel());
    this.nextTargetButton.addEventListener('click', () => {
      this.showTarget(0);
      this.fireButton.focus();
    });
    this.fireButton.addEventListener('click', () => void this.fireVolley());
  }

  /** Shows the first target. Call once the caller is ready for `onTargetShown`. */
  start(): void {
    this.showTarget(this.current);
    this.fireButton.focus();
  }

  /** True while the dice and damage are playing out; nothing else may happen then. */
  get busy(): boolean {
    return this.busyFiring;
  }

  /** The target on show, if any. */
  get target(): FireTarget | null {
    return this.shown;
  }

  /** Ships that can be fired at now. */
  get targetIds(): Set<string> {
    return new Set(this.targets.map((target) => target.ship.id));
  }

  /** Shows a ship clicked on the map, if it can be fired at. Returns whether it could. */
  switchTo(shipId: string): boolean {
    const index = this.targets.findIndex((target) => target.ship.id === shipId);
    if (index === -1 || this.busyFiring) {
      return false;
    }
    this.showTarget(index);
    this.fireButton.focus();
    return true;
  }

  /** Stops targeting (Cancel, Close, Continue, Escape or a click elsewhere), unless the dice are rolling. */
  cancel(): void {
    if (this.busyFiring || this.closed) {
      return;
    }
    this.closed = true;
    this.options.onClose();
  }

  /** Whether any volley was fired. */
  get fired(): boolean {
    return this.firedAny;
  }

  /** Clears the target column and the controls. */
  dispose(): void {
    this.closed = true;
    this.options.targetSide.hidden = true;
    this.options.targetSide.replaceChildren();
    this.options.controlsContainer.replaceChildren();
    this.options.controlsContainer.style.removeProperty('--dialog-accent');
    this.options.shooterContainer.replaceChildren();
  }

  /**
   * Shows the buttons that fit the moment, so there is always a way on:
   * - `aim`: a target is on show. Fire!, and Cancel (or Close once a volley
   *   has been fired, which keeps what was fired);
   * - `busy`: the dice and damage are playing out; no buttons;
   * - `result`: a volley has just landed. Close and Next target if the ship
   *   can fire again, otherwise Continue.
   */
  private setActions(mode: 'aim' | 'busy' | 'result'): void {
    const more = this.targets.length > 0;
    this.cancelButton.textContent = this.firedAny ? 'Close' : 'Cancel';
    this.cancelButton.hidden = !(mode === 'aim' || (mode === 'result' && more));
    this.fireButton.hidden = mode !== 'aim';
    this.nextTargetButton.hidden = !(mode === 'result' && more);
    this.continueButton.hidden = !(mode === 'result' && !more);
  }

  /** Shows the beam dice and the torpedoes chosen, each in its own pool, and whether Fire! can be pressed. */
  private updatePool(): void {
    const chosen = this.choices.filter((choice) => choice.selected);
    const beams = chosen.filter((choice) => choice.kind === 'beam');
    const torpedoes = chosen.filter((choice) => choice.kind === 'torpedo');
    const total = beams.reduce((sum, choice) => sum + choice.dice, 0);
    const hasBeams = this.choices.some((choice) => choice.kind === 'beam');
    const torpedoChoices = this.choices.filter((choice) => choice.kind === 'torpedo');

    this.pool.hidden = !hasBeams && torpedoChoices.length > 0;
    this.poolNumber.textContent = String(total);
    this.poolUnit.textContent = plural(total, 'die', 'dice');
    this.pool.classList.toggle('dice-pool-empty', total === 0);

    // Every torpedo aimed at one target is at the same range, so needs the same score.
    this.torpedoPool.hidden = torpedoChoices.length === 0;
    this.torpedoNumber.textContent = String(torpedoes.length);
    this.torpedoUnit.textContent = `${torpedoChoices[0]?.toHit ?? 0}+ to hit`;
    this.torpedoPool.classList.toggle('dice-pool-empty', torpedoes.length === 0);

    const shooterId = this.options.shooter.id;
    const kinds = torpedoChoices.length > 0 ? (hasBeams ? 'beam or torpedo' : 'torpedo') : 'beam';
    this.hint.textContent =
      chosen.length === 0
        ? `Click a ${kinds} with a dashed ring on ${shooterId}'s display to fire it.`
        : `Click a ${kinds} on ${shooterId}'s display to hold it back or fire it.${this.notes.length > 0 ? ` Not firing: ${this.notes.join(', ')}.` : ''}`;
    this.fireButton.disabled = chosen.length === 0;
  }

  /** Shows one target: its SSD, and the shooter's weapons as they bear on it, all chosen. */
  private showTarget(index: number): void {
    const count = this.targets.length;
    if (this.busyFiring || count === 0) {
      return;
    }
    this.current = ((index % count) + count) % count;
    const target = this.targets[this.current]!;
    this.shown = target;
    if (this.volleyShown) {
      // Clear the last volley away, ready to fire at this target.
      this.volleyShown = false;
      this.diceArea.replaceChildren();
      this.result.replaceChildren();
      this.outcomeHint.textContent = '';
      this.thresholdArea.replaceChildren();
      this.thresholdArea.hidden = true;
    }
    this.setActions('aim');
    this.targetCard.classList.remove('ssd-destroyed');
    this.targetNav.hidden = count < 2;
    this.targetCount.textContent = `Target ${this.current + 1} of ${count}`;

    const { shooter, shooterDesign } = this.options;
    const weapons = weaponChoices(shooterDesign, target.bearings);
    this.choices = weapons.choices;
    this.notes = weapons.notes;

    // The target, tinted in its owner's colour.
    const colour = this.options.playerColours.get(target.ship.playerId);
    if (colour === undefined) {
      this.targetPanel.style.removeProperty('--player-colour');
      delete this.targetPanel.dataset.player;
    } else {
      this.targetPanel.style.setProperty('--player-colour', colour);
      this.targetPanel.dataset.player = target.ship.playerId;
    }
    this.targetHeading.textContent = `Target · ${target.ship.id}`;
    this.targetTitle.replaceChildren(
      h('span', { class: 'ssd-title' }, `${target.ship.id} · ${target.ship.name}`),
      h('span', { class: 'ssd-class' }, target.design.className),
    );
    this.targetDrawing = ssdDrawing(target.ship, target.design);
    this.targetCard.replaceChildren(this.targetDrawing);
    this.targetFired.textContent = this.firedStatus(target.ship.id);
    this.outcomeHint.textContent = 'The dice roll here when you fire.';

    // The shooter, with the weapons that bear on this target ringed and clickable.
    this.shooterDrawing = ssdDrawing(shooter, shooterDesign, {
      weaponMarks: weapons.marks,
      weaponBadges: weapons.badges,
      weaponTitles: weapons.titles,
    });
    this.options.shooterContainer.replaceChildren(
      h(
        'div',
        { class: 'ssd-header' },
        h('span', { class: 'ssd-title' }, `${shooter.id} · ${shooter.name}`),
        h('span', { class: 'ssd-class' }, shooterDesign.className),
      ),
      h('div', { class: 'ssd-card' }, this.shooterDrawing),
    );
    const fcs = this.fireControls;
    this.showMeta(target, `Uses 1 of ${fcs} ${plural(fcs, 'fire control')} left`);

    for (const choice of this.choices) {
      this.bindWeapon(choice);
    }
    this.updatePool();
    this.options.onTargetShown(target);
  }

  /** The line under the firing ship's SSD: who fires at whom, the range and arc, then `status`. */
  private showMeta(target: FireTarget, status: string): void {
    this.meta.replaceChildren(
      h('strong', {}, `${this.options.shooter.id} → ${target.ship.id}`),
      ` · ${target.range.toFixed(1)} mu · ${ARC_NAMES[target.arc]} arc`,
      h('br', {}),
      status,
    );
  }

  /** Makes a weapon icon on the shooter's SSD a checkbox the player can click or press. */
  private bindWeapon(choice: WeaponChoice): void {
    const icon = this.shooterDrawing.querySelector<SVGGElement>(`[data-weapon="${choice.index}"]`);
    if (icon === null) {
      return;
    }
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('role', 'checkbox');
    icon.setAttribute(
      'aria-label',
      choice.kind === 'torpedo'
        ? `${choice.label}, ${choice.toHit ?? 0}+ to hit`
        : `${choice.label}, ${choice.dice} ${plural(choice.dice, 'die', 'dice')}`,
    );
    const sync = () => {
      icon.classList.toggle('ssd-weapon-selected', choice.selected);
      icon.classList.toggle('ssd-weapon-available', !choice.selected);
      icon.setAttribute('aria-checked', String(choice.selected));
      this.updatePool();
    };
    const toggle = () => {
      if (this.volleyShown) {
        return;
      }
      choice.selected = !choice.selected;
      playSelect(choice.selected);
      sync();
    };
    icon.addEventListener('click', toggle);
    icon.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        toggle();
      }
    });
    sync();
  }

  /** A labelled row of dice in the dice panel, added at once and rolled by `roll`. */
  private diceGroup(label: string, dice: SVGSVGElement[]): HTMLElement {
    const group = h(
      'div',
      { class: 'fire-dice-group' },
      h('span', { class: 'fire-dice-label' }, label),
      h('span', { class: 'fire-dice-row' }, ...dice),
    );
    this.diceArea.append(group);
    return group;
  }

  /** Tumbles the dice in these groups together. Their colours, which give the result away, show once they land. */
  private async roll(groups: readonly HTMLElement[]): Promise<void> {
    const dice = groups.flatMap((group) => [...group.querySelectorAll<SVGSVGElement>('svg.die')]);
    groups.forEach((group) => group.classList.add('rolling'));
    await tumble(dice);
    groups.forEach((group) => group.classList.remove('rolling'));
  }

  private async fireVolley(): Promise<void> {
    const chosen = this.choices.filter((choice) => choice.selected).map((choice) => choice.index);
    if (chosen.length === 0 || this.busyFiring || this.volleyShown || this.current < 0) {
      return;
    }
    const target = this.targets[this.current]!;
    let outcome: FireOutcome;
    try {
      outcome = this.options.fire(target.ship.id, chosen);
    } catch (error) {
      this.result.textContent = error instanceof Error ? error.message : String(error);
      return;
    }
    const volley = outcome.volley;
    this.firedAny = true;
    this.volleyShown = true;
    this.busyFiring = true;
    this.targetNav.hidden = true;
    this.setActions('busy');
    this.hint.textContent = '';
    this.outcomeHint.textContent = '';
    // The volley is gone: the dice pools no longer apply, and the fire control is spent.
    this.pool.hidden = true;
    this.torpedoPool.hidden = true;
    const left = outcome.fireControlsLeft;
    this.showMeta(target, `Fired · ${left} ${plural(left, 'fire control')} left`);
    // The weapons that fired keep their ring; those held back fade.
    for (const choice of this.choices) {
      const icon = this.shooterDrawing.querySelector<SVGGElement>(`[data-weapon="${choice.index}"]`);
      icon?.removeAttribute('tabindex');
      if (!choice.selected) {
        icon?.classList.remove('ssd-weapon-available');
        icon?.classList.add('ssd-weapon-unavailable');
      }
    }

    const targetId = target.ship.id;
    const torpedoesFired = volley.torpedoes.length > 0;

    // The beams fire first, all at once, and their dice are thrown while they sound.
    if (volley.weapons.length > 0) {
      const { shooterDesign } = this.options;
      for (const roll of volley.weapons) {
        playBeam(shooterDesign.weapons[roll.weaponIndex]?.class ?? 1, Math.random() * BEAM_SPREAD_S);
      }
      await sleep(DICE_AFTER_BEAMS_MS);
      const groups = volley.weapons.map((roll) => {
        const weapon = shooterDesign.weapons[roll.weaponIndex];
        return this.diceGroup(
          weapon === undefined ? `Weapon ${roll.weaponIndex + 1}` : weaponLabel(weapon),
          roll.rolls.map((score) => dieElement(score, toneFor(score))),
        );
      });
      await this.roll(groups);
      this.result.replaceChildren(
        torpedoesFired
          ? `Beams: ${volley.beamDamage === 0 ? 'all miss' : `${volley.beamDamage} damage`}.`
          : volley.damage === 0
            ? 'All misses: no damage.'
            : h('span', {}, h('strong', {}, `${volley.damage} damage`), ` to ${targetId}`),
      );
      await animateDamage(this.targetDrawing, volley.hullBefore, volley.hullAfterBeams, (damage) =>
        this.options.onHullDamageShown(targetId, damage),
      );
    }

    // Then the torpedoes: launched one after another, rolled to hit together, then a damage die for each hit.
    if (torpedoesFired) {
      volley.torpedoes.forEach((_, index) => window.setTimeout(playTorpedo, index * TORPEDO_STAGGER_MS));
      await sleep(DICE_AFTER_TORPEDOES_MS);
      const separator = volley.weapons.length > 0 ? ' ' : '';
      if (volley.torpedoes.every((torpedo) => torpedo.hitRoll === null)) {
        const launched = `${plural(volley.torpedoes.length, 'Torpedo', 'Torpedoes')} launched`;
        this.result.append(`${separator}${launched}, but ${targetId} was already destroyed.`);
      } else {
        const count = volley.torpedoes.length;
        await this.roll([
          this.diceGroup(
            `Pulse ${plural(count, 'torpedo', 'torpedoes')} · ${volley.torpedoes[0]!.toHit}+ to hit`,
            volley.torpedoes.map((torpedo) => dieElement(torpedo.hitRoll ?? 1, torpedo.hit ? 'hit' : 'miss')),
          ),
        ]);
        const hits = volley.torpedoes.filter((torpedo) => torpedo.hit);
        if (hits.length > 0) {
          await sleep(200);
          await this.roll([
            this.diceGroup(
              'Torpedo damage',
              hits.map((torpedo) => dieElement(torpedo.damageRoll ?? 1, 'double')),
            ),
          ]);
        }
        const torpedoText =
          hits.length === 0
            ? `${plural(count, 'Torpedo', 'Torpedoes')} missed`
            : `${plural(hits.length, 'Torpedo', 'Torpedoes')}: ${volley.torpedoDamage} damage`;
        if (volley.weapons.length > 0) {
          this.result.append(` ${torpedoText}. `, h('strong', {}, `${volley.damage} damage`), ` to ${targetId} in all`);
        } else {
          this.result.replaceChildren(
            volley.damage === 0
              ? `${torpedoText}: no damage.`
              : h('span', {}, h('strong', {}, `${volley.damage} damage`), ` to ${targetId}`),
          );
        }
        await animateDamage(this.targetDrawing, volley.hullAfterBeams, volley.hullAfter, (damage) =>
          this.options.onHullDamageShown(targetId, damage),
        );
      }
    }

    if (volley.threshold !== null) {
      await animateThreshold(this.targetDrawing, volley.threshold, this.thresholdArea);
    }
    if (volley.destroyed) {
      playExplosion();
      this.targetCard.classList.add('ssd-destroyed');
      this.targetCard.append(h('div', { class: 'destroyed-stamp' }, 'Destroyed'));
      this.result.append(h('span', { class: 'fire-destroyed' }, ` — ${target.ship.id} is destroyed!`));
    }
    this.options.onVolleyShown(volley);
    if (this.closed) {
      return;
    }

    // Once the dice are done, the weapons that fired show as fired, without their dice tags.
    for (const index of chosen) {
      const icon = this.shooterDrawing.querySelector<SVGGElement>(`[data-weapon="${index}"]`);
      icon?.classList.remove('ssd-weapon-selected', 'ssd-weapon-available');
      icon?.classList.add('ssd-weapon-fired');
      icon?.querySelector('.ssd-weapon-badge')?.remove();
    }

    this.busyFiring = false;
    this.targets = outcome.targets;
    this.fireControls = outcome.fireControlsLeft;
    this.firedStatus = outcome.firedStatus;
    this.current = -1;
    this.setActions('result');
    if (this.targets.length > 0) {
      // Fire controls and weapons left: pick the next target here.
      const fcs = this.fireControls;
      this.targetNav.hidden = false;
      this.targetCount.textContent = `${this.targets.length} more ${plural(this.targets.length, 'target')}`;
      this.hint.textContent =
        `${this.options.shooter.id} has ${fcs} ${plural(fcs, 'fire control')} left. ` +
        'Press Next target (or click a highlighted ship) to fire again, or Close.';
      this.nextTargetButton.focus();
    } else {
      this.continueButton.focus();
    }
    this.options.onTargetShown(volley.destroyed ? null : this.shown);
  }
}
