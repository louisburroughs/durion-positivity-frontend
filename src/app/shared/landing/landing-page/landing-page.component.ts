import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../../core/security/route-access';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../material-symbol.pipe';
import { LandingSectionsComponent, visibleLandingSections } from '../landing-sections/landing-sections.component';
import { LandingAccess, LandingCta, LandingPageConfig, LandingSection, RecordSearchMap } from '../landing.models';

/**
 * Shared, config-driven landing page. Reproduces the `Positivity Landing Pages`
 * design comp: hero + stat cards + type legend + sections, each section fronted
 * by one gated "Find a record" selector that locks its guided cards until a
 * record is chosen. Domains supply a {@link LandingPageConfig} and a map of
 * search functions per record kind.
 *
 * The sections block is {@link LandingSectionsComponent}, shared with pages
 * that embed the same cards (the accounting home's "More accounting tools").
 *
 * Cards and CTAs that declare an access requirement are filtered through the
 * shared `canAccess` decision, so the landing page never offers a page the route
 * guard would bounce. A section whose cards are all filtered out is dropped with
 * them; the hero counts reflect what the viewer can actually open.
 */
@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe, MaterialSymbolPipe, LandingSectionsComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  private readonly auth = inject(AuthService);

  @Input({ required: true }) config!: LandingPageConfig;
  @Input() searchFns: RecordSearchMap = {};

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
    visibleLandingSections(this.config.sections, requirement => this.allows(requirement)),
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

  ctaRoute(cta: LandingCta): string | readonly string[] {
    return cta.route;
  }
}
