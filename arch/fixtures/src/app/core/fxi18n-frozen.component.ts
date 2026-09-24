import { Component, computed, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * I18N-06 self-test fixture: `translate.instant(...)` freezes at first evaluation when it runs in
 * `computed()`, a class field initializer, or `effect()` — none of them re-run on a locale change.
 * A call inside a normal method (e.g. a click handler) is compliant: it re-reads on every call.
 */
@Component({ selector: 'fxi18n-frozen', template: '' })
export class FxI18nFrozenComponent {
  private readonly translate = inject(TranslateService);

  // Violation: computed() callback.
  readonly frozenLabel = computed(() => this.translate.instant('FXI18N.EXISTING'));

  // Violation: direct class field initializer.
  readonly frozenTitle = this.translate.instant('FXI18N.EXISTING');

  constructor() {
    // Violation: effect() callback.
    effect(() => {
      console.log(this.translate.instant('FXI18N.EXISTING'));
    });
  }

  // Compliant: plain method body, re-evaluated on every call.
  currentLabel(): string {
    return this.translate.instant('FXI18N.EXISTING');
  }
}
