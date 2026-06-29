import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MaterialSymbolPipe } from '../../material-symbol.pipe';
import { LandingRecordFinderComponent } from '../landing-record-finder/landing-record-finder.component';
import {
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

  @Input({ required: true }) config!: LandingPageConfig;
  @Input() searchFns: RecordSearchMap = {};

  /** Selected record id per section, keyed by section index. */
  private readonly selected = signal<Record<number, string>>({});
  /** Secondary free-text identifiers, keyed by card key. */
  private readonly secondary = signal<Record<string, string>>({});
  /** Card key currently showing its tooltip. */
  readonly hoveredKey = signal<string | null>(null);

  readonly allCards = computed(() => this.config.sections.flatMap(s => s.cards));
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

  selectedId(sectionIndex: number): string {
    return this.selected()[sectionIndex] ?? '';
  }

  onRecordSelected(sectionIndex: number, id: string): void {
    this.selected.update(prev => ({ ...prev, [sectionIndex]: id }));
  }

  onRecordCleared(sectionIndex: number): void {
    this.selected.update(prev => {
      const { [sectionIndex]: _removed, ...rest } = prev;
      return rest;
    });
  }

  /**
   * A guided card is pending until its section's selector holds a record and,
   * when the card declares a secondary input, that value is filled too.
   */
  isPending(section: LandingSection, sectionIndex: number, cardIndex: number, card: LandingCard): boolean {
    if (card.kind !== 'guided') return false;
    if (!section.recordKind) return false;
    if (this.selectedId(sectionIndex).trim().length === 0) return true;
    if (card.secondary) {
      return this.secondaryValue(this.cardKey(sectionIndex, cardIndex)).trim().length === 0;
    }
    return false;
  }

  cardKey(sectionIndex: number, cardIndex: number): string {
    return `${sectionIndex}-${cardIndex}`;
  }

  secondaryValue(cardKey: string): string {
    return this.secondary()[cardKey] ?? '';
  }

  onSecondaryInput(cardKey: string, value: string): void {
    this.secondary.update(prev => ({ ...prev, [cardKey]: value }));
  }

  showTip(sectionIndex: number, cardIndex: number): boolean {
    return this.hoveredKey() === this.cardKey(sectionIndex, cardIndex);
  }

  onEnter(sectionIndex: number, cardIndex: number): void {
    this.hoveredKey.set(this.cardKey(sectionIndex, cardIndex));
  }

  onLeave(sectionIndex: number, cardIndex: number): void {
    const key = this.cardKey(sectionIndex, cardIndex);
    if (this.hoveredKey() === key) this.hoveredKey.set(null);
  }

  ctaRoute(cta: LandingCta): string | readonly string[] {
    return cta.route;
  }

  launchGuided(
    section: LandingSection,
    sectionIndex: number,
    cardIndex: number,
    card: LandingGuidedCard,
  ): void {
    const id = this.selectedId(sectionIndex).trim();
    if (!id) return;
    const secondaryId = card.secondary
      ? this.secondaryValue(this.cardKey(sectionIndex, cardIndex)).trim()
      : undefined;
    if (card.secondary && !secondaryId) return;
    void this.router.navigate([...card.buildCommands(id, secondaryId)]);
  }
}
