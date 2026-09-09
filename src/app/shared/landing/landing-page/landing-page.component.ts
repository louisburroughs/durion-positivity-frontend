import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../../core/security/route-access';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../material-symbol.pipe';
import { LandingRecordFinderComponent } from '../landing-record-finder/landing-record-finder.component';
import {
  LandingAccess,
  LandingCard,
  LandingCta,
  LandingGuidedCard,
  LandingPageConfig,
  LandingSection,
  RecordSearchFn,
  RecordSearchMap,
} from '../landing.models';
import { RECORD_KINDS } from '../record-kinds';

/**
 * Shared, config-driven landing page. Reproduces the `Positivity Landing Pages`
 * design comp: hero + stat cards + type legend + sections, each section fronted
 * by one gated "Find a record" selector that locks its guided cards until a
 * record is chosen. Domains supply a {@link LandingPageConfig} and a map of
 * search functions per record kind.
 *
 * Cards and CTAs that declare an access requirement are filtered through the
 * shared `canAccess` decision, so the landing page never offers a page the route
 * guard would bounce. A section whose cards are all filtered out is dropped with
 * them; the hero counts reflect what the viewer can actually open.
 */
@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe, MaterialSymbolPipe, LandingRecordFinderComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  @Input({ required: true }) config!: LandingPageConfig;
  @Input() searchFns: RecordSearchMap = {};

  /**
   * Selected record id per section and secondary free-text values per card,
   * keyed by the config's own `titleKey`s rather than by rendered position:
   * filtering can drop a section or a card mid-session (a token refresh changes
   * what `canAccess` allows), and index keys would then re-point entered values
   * at the wrong card.
   */
  private readonly selected = signal<Record<string, string>>({});
  private readonly secondary = signal<Record<string, string>>({});
  /** Card key currently showing its tooltip. */
  readonly hoveredKey = signal<string | null>(null);

  /**
   * Reads the auth signals inside whichever computed calls it, so a token
   * refresh re-filters the page.
   */
  private allows(requirement: LandingAccess): boolean {
    return canAccess(this.auth, {
      roles: requirement.roles,
      permissions: requirement.permissions,
      allPermissions: requirement.allPermissions,
    });
  }

  /** Sections with their inaccessible cards removed, and empty sections dropped. */
  readonly visibleSections = computed<readonly LandingSection[]>(() =>
    this.config.sections
      .map(section => ({ ...section, cards: section.cards.filter(card => this.allows(card)) }))
      .filter(section => section.cards.length > 0),
  );

  readonly visiblePrimaryCta = computed(() =>
    this.config.primaryCta && this.allows(this.config.primaryCta) ? this.config.primaryCta : undefined,
  );
  readonly visibleSecondaryCta = computed(() =>
    this.config.secondaryCta && this.allows(this.config.secondaryCta) ? this.config.secondaryCta : undefined,
  );
  readonly hasHeroActions = computed(() => !!this.visiblePrimaryCta() || !!this.visibleSecondaryCta());

  readonly allCards = computed(() => this.visibleSections().flatMap(s => s.cards));
  readonly directCount = computed(() => this.allCards().filter(c => c.kind === 'direct').length);
  readonly guidedCount = computed(() => this.allCards().filter(c => c.kind === 'guided').length);
  readonly totalCount = computed(() => this.allCards().length);
  readonly hasGuided = computed(() => this.guidedCount() > 0);

  isGuided(card: LandingCard): card is LandingGuidedCard {
    return card.kind === 'guided';
  }

  /** Sections render a selector only when they declare a record kind. */
  hasSelector(section: LandingSection): boolean {
    return !!section.recordKind;
  }

  selectorLabelKey(section: LandingSection): string {
    return section.recordKind ? RECORD_KINDS[section.recordKind].labelKey : '';
  }

  selectorPlaceholderKey(section: LandingSection): string {
    if (section.searchHintKey) return section.searchHintKey;
    return section.recordKind ? RECORD_KINDS[section.recordKind].placeholderKey : '';
  }

  selectorMode(section: LandingSection): 'search' | 'id' {
    if (!section.recordKind) return 'id';
    if (section.idMode) return 'id';
    return RECORD_KINDS[section.recordKind].nameSearch ? 'search' : 'id';
  }

  selectorSearch(section: LandingSection): RecordSearchFn | undefined {
    return section.recordKind ? this.searchFns[section.recordKind] : undefined;
  }

  selectedId(section: LandingSection): string {
    return this.selected()[section.titleKey] ?? '';
  }

  onRecordSelected(section: LandingSection, id: string): void {
    this.selected.update(prev => ({ ...prev, [section.titleKey]: id }));
  }

  onRecordCleared(section: LandingSection): void {
    this.selected.update(prev => {
      const { [section.titleKey]: _removed, ...rest } = prev;
      return rest;
    });
  }

  /**
   * A guided card is pending until its section's selector holds a record and,
   * when the card declares a secondary input, that value is filled too.
   */
  isPending(section: LandingSection, card: LandingCard): boolean {
    if (card.kind !== 'guided') return false;
    if (!section.recordKind) return false;
    if (this.selectedId(section).trim().length === 0) return true;
    if (card.secondary) {
      return this.secondaryValue(this.cardKey(section, card)).trim().length === 0;
    }
    return false;
  }

  cardKey(section: LandingSection, card: LandingCard): string {
    return `${section.titleKey}::${card.titleKey}`;
  }

  secondaryValue(cardKey: string): string {
    return this.secondary()[cardKey] ?? '';
  }

  onSecondaryInput(cardKey: string, value: string): void {
    this.secondary.update(prev => ({ ...prev, [cardKey]: value }));
  }

  showTip(section: LandingSection, card: LandingCard): boolean {
    return this.hoveredKey() === this.cardKey(section, card);
  }

  onEnter(section: LandingSection, card: LandingCard): void {
    this.hoveredKey.set(this.cardKey(section, card));
  }

  onLeave(section: LandingSection, card: LandingCard): void {
    const key = this.cardKey(section, card);
    if (this.hoveredKey() === key) this.hoveredKey.set(null);
  }

  ctaRoute(cta: LandingCta): string | readonly string[] {
    return cta.route;
  }

  launchGuided(section: LandingSection, card: LandingGuidedCard): void {
    const id = this.selectedId(section).trim();
    if (!id) return;
    const secondaryId = card.secondary
      ? this.secondaryValue(this.cardKey(section, card)).trim()
      : undefined;
    if (card.secondary && !secondaryId) return;
    void this.router.navigate([...card.buildCommands(id, secondaryId)]);
  }
}
