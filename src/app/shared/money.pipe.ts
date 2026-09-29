import { CurrencyPipe } from '@angular/common';
import { DEFAULT_CURRENCY_CODE, inject, Pipe, PipeTransform } from '@angular/core';
import { LocaleService } from '../core/services/locale.service';

/**
 * Money display in the user's selected locale (ADR-0030 §4, ADR-0067 DF-9).
 *
 * Same arguments as Angular's `currency` pipe, minus the locale: the locale is
 * always `LocaleService.currentLocale()`. The built-in pipe falls back to the
 * `LOCALE_ID` fixed at bootstrap (en-US), but the user switches locale at
 * runtime, so a static provider cannot carry it. Arch rule I18N-10 bans the
 * bare `currency` pipe and `formatCurrency` everywhere else, so this is the
 * one place money is formatted.
 *
 * Impure so a locale switch re-renders every amount without a reload: a pure
 * pipe caches on its arguments and would never re-read the locale signal. The
 * last result is memoised, so change detection only re-formats when an
 * argument or the locale actually changed.
 *
 * The currency argument is passed through unchanged; which currency each
 * amount uses is ADR-0067 PC-14, not this pipe's concern.
 */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  private readonly currencyPipe = new CurrencyPipe('en-US', inject(DEFAULT_CURRENCY_CODE));

  private lastArgs: readonly unknown[] | null = null;
  private lastResult: string | null = null;

  transform(
    value: number | string | null | undefined,
    currencyCode?: string | null,
    display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
    digitsInfo?: string,
  ): string | null {
    const args = [value, currencyCode, display, digitsInfo, this.locale.currentLocale()] as const;
    if (this.lastArgs && args.every((a, i) => a === this.lastArgs![i])) {
      return this.lastResult;
    }
    this.lastResult = this.currencyPipe.transform(value, currencyCode ?? undefined, display, digitsInfo, args[4]);
    this.lastArgs = args;
    return this.lastResult;
  }
}
