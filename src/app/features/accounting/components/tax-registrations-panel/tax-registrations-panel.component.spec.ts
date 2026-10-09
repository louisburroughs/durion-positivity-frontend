import { formatDate } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { afterEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { LocaleService } from '../../../../core/services/locale.service';
import { RecoveryRegime } from '../../models/input-tax-recovery.models';
import { TaxRegistrationsPanelComponent } from './tax-registrations-panel.component';

/** Placeholder codes only: the panel names no country or regime itself (owner direction). */
const regime = (overrides: Partial<RecoveryRegime> = {}): RecoveryRegime => ({
  countryCode: 'ZZ',
  regime: 'ZZ_FED',
  enabled: true,
  registrationNumber: '123456789RT0001',
  since: '2026-01-01',
  accountName: 'Tax Recoverable',
  accountCode: '1250',
  ...overrides,
});

describe('TaxRegistrationsPanelComponent (CAP:550 S33 item 3)', () => {
  let fixture: ComponentFixture<TaxRegistrationsPanelComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const rows = (): string[] =>
    Array.from(host().querySelectorAll('[data-testid="tax-registration"]')).map(row => row.textContent!.replace(/\s+/g, ' ').trim());

  function render(regimes: readonly RecoveryRegime[], showTerms = false): void {
    TestBed.configureTestingModule({ imports: [TaxRegistrationsPanelComponent, TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    fixture = TestBed.createComponent(TaxRegistrationsPanelComponent);
    fixture.componentRef.setInput('regimes', regimes);
    fixture.componentRef.setInput('showTerms', showTerms);
    document.body.appendChild(host());
    fixture.detectChanges();
  }

  afterEach(() => (fixture?.nativeElement as HTMLElement | undefined)?.remove());

  it('is a labelled region listing each regime whose recovery is on, as served', () => {
    render([regime(), regime({ regime: 'ZZ_REG', enabled: false }), regime({ regime: 'ZZ_LOC', enabled: null })]);

    const region = host().querySelector('section')!;
    expect(region.getAttribute('aria-labelledby')).toBe('tax-registrations-heading');
    expect(host().querySelector('#tax-registrations-heading')?.textContent?.trim()).toBe('Your tax registrations');
    expect(rows()).toEqual([`ZZ_FED Number 123456789RT0001 Applies from ${formatDate('2026-01-01T00:00:00', 'mediumDate', 'en-US')}`]);
    expect(host().querySelector('summary')?.textContent).toContain('Where does this come from?');
  });

  it('names the account claimed-back tax is recorded in only with accounting terms on, and an em dash for a missing number', () => {
    render([regime({ registrationNumber: null, since: null })], true);

    expect(rows()).toEqual(['ZZ_FED Number — Applies from — Tax claimed back is recorded in Tax Recoverable · 1250']);
  });
  it('formats the date in the user’s locale and says registrations are recorded by whoever manages tax settings (review B6, ruling)', () => {
    render([regime()]);
    const locale = TestBed.inject(LocaleService);
    locale.currentLocale.set('fr-CA');
    fixture.detectChanges();
    const since = host().querySelector('[data-testid="tax-registration-since"]')!.textContent!.replace(/\s+/g, ' ').trim();
    locale.currentLocale.set('en-US');

    expect(since).toBe(`Applies from ${formatDate('2026-01-01T00:00:00', 'mediumDate', 'fr-CA')}`);
    expect(host().querySelector('details')!.textContent!.replace(/\s+/g, ' ')).toContain(
      'Your registrations decide what can be claimed back. Someone who manages your tax settings records them.',
    );
  });
});
