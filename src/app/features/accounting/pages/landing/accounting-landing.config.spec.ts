import { describe, expect, it } from 'vitest';
import { ACCOUNTING_LANDING_CONFIG } from './accounting-landing.config';

/**
 * The config now feeds the accounting home's "More accounting tools"
 * disclosure (CAP:550 S4, Spec discrepancy 2) instead of a landing page;
 * `core/security/page-access.spec.ts` still checks every card against its route.
 */
describe('ACCOUNTING_LANDING_CONFIG', () => {
  it('offers the period-close page from a direct card gated like its route', () => {
    const card = ACCOUNTING_LANDING_CONFIG.sections
      .flatMap(section => section.cards)
      .find(candidate => candidate.kind === 'direct' && candidate.route === '/app/accounting/periods');

    expect(card?.titleKey).toBe('ACCOUNTING.LANDING.CARD.PERIOD_CLOSE.TITLE');
    expect(card?.permissions).toEqual(['accounting:period:view']);
  });

  it('gives every section a single record kind or none', () => {
    for (const section of ACCOUNTING_LANDING_CONFIG.sections) {
      // recordKind is a single scalar value or undefined — never a multi-kind concept.
      expect(['string', 'undefined']).toContain(typeof section.recordKind);
    }
  });
});
