import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { PettyExpenseCategory } from '../../models/petty-expense-categories.models';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { authMock } from '../../pages/bills/bills-page.spec-helper';
import { PettyExpenseCategoriesComponent } from './petty-expense-categories.component';

/**
 * Rendered-DOM accessibility of the Petty-expense categories section (CAP:550
 * S21, §9.6, AC 12): axe in both themes over the table and an open dialog;
 * every dialog is `:modal` and returns focus to its trigger.
 */
async function seriousViolations(root: HTMLElement): Promise<{ id: string; targets: string[] }[]> {
  const results = await axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(' ')) }));
}

const ALL = [
  'accounting:mapping-key:view',
  'accounting:mapping-key:create',
  'accounting:gl-mapping:create',
  'accounting:mapping-key:edit',
  'accounting:mapping-key:deactivate',
];

const rows: PettyExpenseCategory[] = [
  {
    code: 'SHOP_SUPPLIES',
    label: 'Shop supplies',
    examples: 'Rags, gloves, valve caps',
    status: 'ACTIVE',
    currentAccount: { glAccountId: 'gl-6340', accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
    laterAccount: { glAccountId: 'gl-6375', accountCode: '6375', accountName: 'Cleaning & Janitorial Supplies', effectiveFrom: '2026-11-01' },
    version: 2,
    history: [],
  },
  {
    code: 'OFFICE_SUPPLIES',
    label: 'Office supplies',
    examples: null,
    status: 'INACTIVE',
    currentAccount: { glAccountId: 'gl-6370', accountCode: '6370', accountName: 'Office supplies', effectiveFrom: '2026-01-01' },
    laterAccount: null,
    version: 1,
    history: [],
  },
];

describe('Petty-expense categories a11y (rendered DOM)', () => {
  let fixture: ComponentFixture<PettyExpenseCategoriesComponent>;

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
  });

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [PettyExpenseCategoriesComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: PettyExpenseCategoriesService,
          useValue: {
            listExpenseAccounts: vi.fn(() => of([{ glAccountId: 'gl-6375', accountCode: '6375', accountName: 'Cleaning & Janitorial Supplies' }])),
            create: vi.fn(),
            relabel: vi.fn(),
            deactivate: vi.fn(),
            remap: vi.fn(),
          },
        },
        { provide: AuthService, useValue: authMock(ALL, { tenantId: signal<string | null>('tenant-a') }).service },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    fixture = TestBed.createComponent(PettyExpenseCategoriesComponent);
    fixture.componentRef.setInput('categories', rows);
    fixture.componentRef.setInput('status', 'OK');
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`reports no serious violation over the table and an open dialog (${theme} theme)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const host = render();
      await fixture.whenStable();
      expect(await seriousViolations(host)).toEqual([]);

      host.querySelector<HTMLButtonElement>('[data-testid="category-remap"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  for (const [trigger, dialog] of [
    ['category-add', 'category-dialog-CREATE'],
    ['category-rename', 'category-dialog-RELABEL'],
    ['category-deactivate', 'category-dialog-DEACTIVATE'],
    ['category-remap', 'category-dialog-REMAP'],
  ] as const) {
    it(`${dialog} is :modal and returns focus to its trigger on close`, async () => {
      const host = render();
      const button = host.querySelector<HTMLButtonElement>(`[data-testid="${trigger}"]`)!;
      button.focus();
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const element = host.querySelector<HTMLDialogElement>(`[data-testid="${dialog}"]`)!;
      expect(element.tagName).toBe('DIALOG');
      expect(element.matches(':modal')).toBe(true);
      expect(element.getAttribute('aria-labelledby')).toBe('category-dialog-title');

      host.querySelector<HTMLButtonElement>('[data-testid="category-cancel"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host.querySelector(`[data-testid="${dialog}"]`)).toBeNull();
      expect(document.activeElement).toBe(button);
    });
  }

  it('row actions carry the category in their name, after the visible text (Label in Name)', () => {
    const host = render();
    const rename = host.querySelector<HTMLButtonElement>('[data-testid="category-rename"]')!;

    expect(rename.textContent?.replace(/\s+/g, ' ').trim()).toBe('Rename Shop supplies');
    expect(rename.textContent?.trim().startsWith(enUS.ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.RELABEL.OPEN)).toBe(true);
    const box = rename.getBoundingClientRect();
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
});
