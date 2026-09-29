import { Component, signal } from '@angular/core';
import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleService } from '../core/services/locale.service';
import { MoneyPipe } from './money.pipe';

/** What Angular's own formatter yields for `locale`, i.e. what `| money` must match. */
const expected = (value: number, locale: string, currency: string, digits?: string): string =>
  formatCurrency(value, locale, getCurrencySymbol(currency, 'wide', locale), currency, digits);

@Component({
  imports: [MoneyPipe],
  template: `<span data-testid="amount">{{ amount() | money: currency() : 'symbol' : '1.2-2' }}</span>`,
})
class HostComponent {
  readonly amount = signal<number | null>(1234.5);
  readonly currency = signal<string | undefined>('USD');
}

describe('MoneyPipe', () => {
  // The real service registers the CLDR data on import; only its signal is needed here.
  let locale: Pick<LocaleService, 'currentLocale'>;

  beforeEach(() => {
    locale = { currentLocale: signal<ReturnType<LocaleService['currentLocale']>>('en-US') };
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: LocaleService, useValue: locale }],
    });
  });

  const render = () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const text = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="amount"]')!.textContent;
    return { fixture, text };
  };

  it.each(['en-US', 'es-US', 'es-MX', 'fr-CA', 'fr-FR'] as const)('formats in the selected locale %s', (code) => {
    locale.currentLocale.set(code);
    const { text } = render();
    expect(text()).toBe(expected(1234.5, code, 'USD', '1.2-2'));
  });

  it('fr-FR differs from en-US (the bug in #408)', () => {
    locale.currentLocale.set('fr-FR');
    const { text } = render();
    expect(text()).not.toBe(expected(1234.5, 'en-US', 'USD', '1.2-2'));
  });

  it('re-renders when the user switches locale, without re-creating the view', () => {
    const { fixture, text } = render();
    expect(text()).toBe(expected(1234.5, 'en-US', 'USD', '1.2-2'));

    locale.currentLocale.set('fr-FR');
    fixture.detectChanges();
    expect(text()).toBe(expected(1234.5, 'fr-FR', 'USD', '1.2-2'));

    locale.currentLocale.set('en-US');
    fixture.detectChanges();
    expect(text()).toBe(expected(1234.5, 'en-US', 'USD', '1.2-2'));
  });

  it('passes the currency argument through unchanged', () => {
    locale.currentLocale.set('fr-CA');
    const { fixture, text } = render();
    fixture.componentInstance.currency.set('EUR');
    fixture.detectChanges();
    expect(text()).toBe(expected(1234.5, 'fr-CA', 'EUR', '1.2-2'));
  });

  it('falls back to the default currency code when none is given, as `currency` does', () => {
    const { fixture, text } = render();
    fixture.componentInstance.currency.set(undefined);
    fixture.detectChanges();
    expect(text()).toBe(expected(1234.5, 'en-US', 'USD', '1.2-2'));
  });

  it('renders nothing for a null amount', () => {
    const { fixture, text } = render();
    fixture.componentInstance.amount.set(null);
    fixture.detectChanges();
    expect(text()).toBe('');
  });
});
