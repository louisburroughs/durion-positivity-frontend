import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../../core/security/route-access';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../material-symbol.pipe';
import { LandingRecordFinderComponent } from '../landing-record-finder/landing-record-finder.component';
import { LandingAccess, LandingCard, LandingGuidedCard, LandingSection, RecordSearchFn, RecordSearchMap } from '../landing.models';
import { RECORD_KINDS } from '../record-kinds';

/**
 * Sections with their inaccessible cards removed, and empty sections dropped.
 * `allows` is the shared `canAccess` decision, so a card is offered only when
 * the route behind it would admit the session (#236).
 */
export function visibleLandingSections(
  sections: readonly LandingSection[],
  allows: (requirement: LandingAccess) => boolean,
): readonly LandingSection[] {
  return sections
    .map(section => ({ ...section, cards: section.cards.filter(card => allows(card)) }))
    .filter(section => section.cards.length > 0);
}

/**
 * The sections block of the shared landing page: per section a heading, the
 * gated "Find a record" selector and the card grid. Extracted from
 * `LandingPageComponent` so the accounting home's "More accounting tools"
 * disclosure (CAP:550 S4) renders the same cards through the same filter
 * rather than a copy of it.
 *
 * Cards that declare an access requirement are filtered through `canAccess`; a
 * section whose cards are all filtered out is dropped with them.
 * `headingLevel` sets the section heading level (cards sit one below it), so
 * the block nests under whatever heading the host page gives it.
 */
@Component({
  selector: 'app-landing-sections',
  standalone: true,
  imports: [RouterLink, TranslatePipe, MaterialSymbolPipe, LandingRecordFinderComponent],
  templateUrl: './landing-sections.component.html',
  styleUrl: './landing-sections.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingSectionsComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly sections = input.required<readonly LandingSection[]>();
  readonly searchFns = input<RecordSearchMap>({});
  readonly headingLevel = input<2 | 3>(2);

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

  /** Reads the auth signals, so a token refresh re-filters the sections. */
  readonly visibleSections = computed(() =>
    visibleLandingSections(this.sections(), requirement =>
      canAccess(this.auth, {
        roles: requirement.roles,
        permissions: requirement.permissions,
        allPermissions: requirement.allPermissions,
      }),
    ),
  );

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
    return section.recordKind ? this.searchFns()[section.recordKind] : undefined;
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
