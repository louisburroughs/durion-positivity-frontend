import { Component } from '@angular/core';
import { CurrencyPipe, formatCurrency } from '@angular/common';

/**
 * I18N-10 self-test fixture. Plants every locale-blind money path: `CurrencyPipe` and
 * `formatCurrency` imported from `@angular/common`, and a bare `| currency` in the inline template.
 * `total || currency` is a logical OR, not a pipe, and must not be flagged on its own.
 */
@Component({
  selector: 'fxi18n-money',
  imports: [CurrencyPipe],
  template: '<p>{{ total | currency }}</p><p>{{ total || currency }}</p>',
})
export class FxI18nMoneyComponent {
  readonly total = 12.5;
  readonly currency = 'USD';

  label(): string {
    return formatCurrency(this.total, 'en-US', '$');
  }
}
