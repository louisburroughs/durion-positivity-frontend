import { Component, signal } from '@angular/core';

/**
 * I18N-05 self-test fixture (TS side). `errorKey` is a `signal(...)`-declared field, so a literal
 * `.set(...)` argument is a key-typed field per plan §11.4: one compliant (`FXI18N.EXISTING`), one
 * missing/typo'd (`FXI18N.MISSING_TS`).
 */
@Component({ selector: 'fxi18n-typo', template: '' })
export class FxI18nTypoComponent {
  readonly errorKey = signal<string | null>(null);

  loadFailed(): void {
    this.errorKey.set('FXI18N.MISSING_TS');
  }

  loadOk(): void {
    this.errorKey.set('FXI18N.EXISTING');
  }
}
