import { Observable } from 'rxjs';

/**
 * Record kinds a section selector can resolve. Name-search kinds hit a backend
 * typeahead; id-only kinds accept a raw identifier with no lookup. Mirrors the
 * KINDS map in the `Positivity Landing Pages` design comp.
 */
export type RecordKind =
  | 'estimate'
  | 'workorder'
  | 'approval'
  | 'customer'
  | 'invoice'
  | 'employee'
  | 'person'
  | 'appointment'
  | 'ledger'
  | 'po'
  | 'event'
  | 'ruleset'
  | 'location'
  | 'role'
  | 'payment'
  | 'receipt'
  | 'session'
  | 'putaway';

/** A single typeahead match rendered in the finder listbox. */
export interface RecordHit {
  readonly id: string;
  /** Bold primary line — e.g. customer name. */
  readonly primary: string;
  /** Right-aligned identifier — e.g. estimate/workorder number. */
  readonly secondary?: string;
  /** Optional sub-line under the primary. */
  readonly tertiary?: string;
}

/** Injected search function for a name-search record kind. */
export type RecordSearchFn = (q: string) => Observable<RecordHit[]>;

/** Static metadata per record kind: i18n keys + whether it uses backend search. */
export interface RecordKindMeta {
  readonly labelKey: string;
  readonly placeholderKey: string;
  /** true => uses an injected RecordSearchFn; false => plain id input, no lookup. */
  readonly nameSearch: boolean;
}

export interface LandingCta {
  readonly labelKey: string;
  readonly icon?: string;
  readonly route: string | readonly string[];
}

interface LandingCardBase {
  /** Material Symbols Rounded glyph name. */
  readonly icon: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly ctaKey: string;
  readonly ctaIcon?: string;
}

/** Opens immediately — a fixed route. */
export interface LandingDirectCard extends LandingCardBase {
  readonly kind: 'direct';
  readonly route: string | readonly string[];
}

/** Needs the section's selected record; gated (locked) until one is chosen. */
export interface LandingGuidedCard extends LandingCardBase {
  readonly kind: 'guided';
  readonly buildCommands: (recordId: string) => readonly string[];
}

export type LandingCard = LandingDirectCard | LandingGuidedCard;

export interface LandingSection {
  readonly titleKey: string;
  readonly descriptionKey: string;
  /** Present => the section renders a single gated "Find a record" selector. */
  readonly recordKind?: RecordKind;
  /** Overrides the kind's default placeholder for this section. */
  readonly searchHintKey?: string;
  readonly cards: readonly LandingCard[];
}

export interface LandingPageConfig {
  readonly eyebrowKey: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly primaryCta?: LandingCta;
  readonly secondaryCta?: LandingCta;
  readonly sections: readonly LandingSection[];
}

/** Map of search functions keyed by record kind, supplied by the host domain. */
export type RecordSearchMap = Partial<Record<RecordKind, RecordSearchFn>>;
