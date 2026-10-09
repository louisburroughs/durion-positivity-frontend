import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { DrawerPolicy } from '../../models/drawer-policy.models';
import { draftFrom } from '../../utils/drawer-draft';
import { DrawerCashSettingsComponent } from './drawer-cash-settings.component';

/**
 * Rendered-DOM accessibility of the Drawer cash section (CAP:550 S21, §9.6,
 * AC 12): axe in both themes, and every switch's accessible name carrying its
 * row title and the visible "Allowed" in each hand-maintained locale.
 */
async function seriousViolations(root: HTMLElement): Promise<{ id: string; targets: string[] }[]> {
  const results = await axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(' ')) }));
}

const LOCALES: Readonly<Record<string, TranslationObject>> = {
  'en-US': enUS as TranslationObject,
  'fr-CA': frCA as TranslationObject,
  'fr-FR': frFR as TranslationObject,
  'es-US': esUS as TranslationObject,
  'es-MX': esMX as TranslationObject,
};

const served: DrawerPolicy = {
  version: 3,
  currencyCode: 'USD',
  overShortTolerance: 5,
  types: [
    { type: 'PETTY_EXPENSE', allowed: true, cashierLimit: 50, alwaysNeedsManager: false, editable: true },
    { type: 'VENDOR_COD', allowed: false, cashierLimit: null, alwaysNeedsManager: false, editable: true },
    { type: 'BANK_DROP', allowed: true, cashierLimit: null, alwaysNeedsManager: false, editable: false },
    { type: 'FLOAT_CHANGE', allowed: true, cashierLimit: null, alwaysNeedsManager: true, editable: false },
  ],
};

/** The accessible name `aria-labelledby` computes: the referenced texts, in order. */
function labelledByName(element: Element): string {
  return (element.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map(id => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ');
}

describe('Drawer cash a11y (rendered DOM)', () => {
  let fixture: ComponentFixture<DrawerCashSettingsComponent>;

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
  });

  function render(locale: string): HTMLElement {
    TestBed.configureTestingModule({ imports: [DrawerCashSettingsComponent, TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(locale, LOCALES[locale]);
    translate.use(locale);
    fixture = TestBed.createComponent(DrawerCashSettingsComponent);
    fixture.componentRef.setInput('policy', served);
    fixture.componentRef.setInput('draft', { ...draftFrom(served), vendorCod: { allowed: true, limitText: '' } });
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`reports no serious violation with a required-amount error and the help open (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const host = render('en-US');
      (host.querySelector('[data-testid="drawer-how-counted"]') as HTMLDetailsElement).open = true;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(host.querySelector('[data-testid="drawer-limit-error-VENDOR_COD"]')).not.toBeNull();
      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  for (const locale of Object.keys(LOCALES)) {
    it(`names every switch by its row title and the visible "Allowed" (${locale}, Label in Name)`, () => {
      const host = render(locale);
      const switches = Array.from(host.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
      expect(switches.length).toBe(2);

      for (const control of switches) {
        const visible = host.querySelector(`label[for="${control.id}"]`)?.textContent?.trim() ?? '';
        const title = control.closest('.drawer__row')?.querySelector('.drawer__title')?.textContent?.trim() ?? '';
        const name = labelledByName(control);
        expect(visible.length).toBeGreaterThan(0);
        expect(name).toContain(visible);
        expect(name).toContain(title);
        expect(name.startsWith(title)).toBe(true);
      }
      // Each switch target is at least 24 × 24 CSS px (ADR-0029 §8.5).
      const box = switches[0].getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    });
  }
});
