import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { DrawerPolicy } from '../../models/drawer-policy.models';
import { DrawerDraft, draftFrom, drawerDirty, drawerValid, limitProblem, toDrawerUpdate, toleranceProblem } from '../../utils/drawer-draft';
import { DrawerCashSettingsComponent } from './drawer-cash-settings.component';

const policy = (overrides: Partial<DrawerPolicy> = {}): DrawerPolicy => ({
  version: 3,
  currencyCode: 'USD',
  overShortTolerance: 5,
  types: [
    { type: 'PETTY_EXPENSE', allowed: true, cashierLimit: 50, alwaysNeedsManager: false, editable: true },
    { type: 'VENDOR_COD', allowed: false, cashierLimit: null, alwaysNeedsManager: false, editable: true },
    { type: 'BANK_DROP', allowed: true, cashierLimit: null, alwaysNeedsManager: false, editable: false },
    { type: 'FLOAT_CHANGE', allowed: true, cashierLimit: null, alwaysNeedsManager: true, editable: false },
  ],
  ...overrides,
});

describe('DrawerCashSettingsComponent (§4.6, §5.5, §5.6)', () => {
  let fixture: ComponentFixture<DrawerCashSettingsComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);

  function render(served: DrawerPolicy = policy(), draft: DrawerDraft = draftFrom(served)): DrawerCashSettingsComponent {
    TestBed.configureTestingModule({ imports: [DrawerCashSettingsComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(DrawerCashSettingsComponent);
    fixture.componentRef.setInput('policy', served);
    fixture.componentRef.setInput('draft', draft);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('renders the served types in served order', () => {
    render(policy({ types: [...policy().types].reverse() }));

    const rows = Array.from(host().querySelectorAll('.drawer__row')).map(row => row.getAttribute('data-testid'));
    expect(rows).toEqual(['drawer-row-FLOAT_CHANGE', 'drawer-row-BANK_DROP', 'drawer-row-VENDOR_COD', 'drawer-row-PETTY_EXPENSE']);
  });

  it('names each switch by its row title and the visible Allowed label (identity in the name, Label in Name)', () => {
    render();

    const toggle = q<HTMLInputElement>('[data-testid="drawer-allowed-PETTY_EXPENSE"]')!;
    expect(toggle.type).toBe('checkbox');
    expect(toggle.getAttribute('role')).toBe('switch');
    const [titleId, labelId] = toggle.getAttribute('aria-labelledby')!.split(' ');
    expect(host().querySelector(`#${titleId}`)?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.PETTY_EXPENSE.TITLE');
    expect(host().querySelector(`#${labelId}`)?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.ALLOWED');
    const amount = q('[data-testid="drawer-limit-PETTY_EXPENSE"]')!;
    expect(amount.getAttribute('inputmode')).toBe('decimal');
    expect(amount.getAttribute('aria-labelledby')).toContain(titleId);
    const hint = host().querySelector(`#${amount.getAttribute('aria-describedby')!.split(' ')[0]}`);
    expect(hint?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.LIMIT_HINT');
  });

  it('renders bank drops and float changes read-only with their badges and no input (AC 3)', () => {
    render();

    for (const [type, badge] of [
      ['BANK_DROP', 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.BADGE.BANK_DROP'],
      ['FLOAT_CHANGE', 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.BADGE.FLOAT_CHANGE'],
    ]) {
      const row = q(`[data-testid="drawer-row-${type}"]`)!;
      expect(row.querySelector(`[data-testid="drawer-badge-${type}"]`)?.textContent).toContain(badge);
      expect(row.querySelector('input')).toBeNull();
    }
  });

  it('renders an unknown served type as a read-only "Unknown" row (§8.2)', () => {
    render(policy({ types: [...policy().types, { type: 'UNKNOWN', allowed: true, cashierLimit: 20, alwaysNeedsManager: false, editable: false }] }));

    const row = q('[data-testid="drawer-row-UNKNOWN"]')!;
    expect(row.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.UNKNOWN.TITLE');
    expect(row.querySelector('input')).toBeNull();
  });

  it('switching petty expenses off disables the amount and keeps its value (AC 2)', () => {
    const component = render();
    q<HTMLInputElement>('[data-testid="drawer-allowed-PETTY_EXPENSE"]')!.click();
    fixture.detectChanges();

    expect(component.draft().pettyExpense).toEqual({ allowed: false, limitText: '50' });
    const amount = q<HTMLInputElement>('[data-testid="drawer-limit-PETTY_EXPENSE"]')!;
    expect(amount.disabled).toBe(true);
    expect(amount.value).toBe('50');
    // A disabled amount cannot be changed through the handler either.
    component.setLimit('pettyExpense', '999');
    expect(component.draft().pettyExpense.limitText).toBe('50');
  });

  it('what this means quotes the typed values with no arithmetic, and states the manager rule', () => {
    const component = render();
    const amount = q<HTMLInputElement>('[data-testid="drawer-limit-PETTY_EXPENSE"]')!;
    amount.value = '75.5';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(q('[data-testid="drawer-means-PETTY_EXPENSE"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.MEANS.PETTY_EXPENSE.ON');
    expect(component.limit('pettyExpense')).toBe(75.5);
    expect(q('[data-testid="drawer-means-VENDOR_COD"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.MEANS.VENDOR_COD.OFF');
    expect(q('[data-testid="drawer-means-tolerance"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.MEANS.TOLERANCE');
    expect(host().textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.MEANS.DIFFERENT_PERSON');
    expect(q('[data-testid="drawer-how-counted"]')?.tagName).toBe('DETAILS');
  });

  it('marks the tolerance invalid with aria-invalid and an aria-describedby message', () => {
    render();
    const tolerance = q<HTMLInputElement>('[data-testid="drawer-tolerance"]')!;
    tolerance.value = '5.123';
    tolerance.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(tolerance.getAttribute('aria-invalid')).toBe('true');
    expect(tolerance.getAttribute('aria-describedby')).toContain('drawer-tolerance-error');
    expect(q('[data-testid="drawer-tolerance-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.ERROR.AMOUNT');
  });

  it('links a server-named field to the Save card error', () => {
    render();
    fixture.componentRef.setInput('serverFields', ['vendorCod.cashierLimit', 'overShortTolerance']);
    fixture.detectChanges();

    expect(q('[data-testid="drawer-tolerance"]')!.getAttribute('aria-describedby')).toContain('limits-drawer-save-error');
    expect(q('[data-testid="drawer-limit-VENDOR_COD"]')!.getAttribute('aria-describedby')).toContain('limits-drawer-save-error');
    expect(q('[data-testid="drawer-limit-PETTY_EXPENSE"]')!.getAttribute('aria-describedby')).not.toContain('limits-drawer-save-error');
  });

  it('a locked section ignores edits', () => {
    const component = render();
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();
    component.setAllowed('vendorCod', true);
    component.setTolerance('1');

    expect(component.draft()).toEqual(draftFrom(policy()));
  });
});

describe('drawer-draft (format only; the server decides)', () => {
  it('requires an amount while a type is on, never while off', () => {
    expect(limitProblem({ allowed: true, limitText: '' })).toBe('REQUIRED');
    expect(limitProblem({ allowed: true, limitText: '-1' })).toBe('AMOUNT');
    expect(limitProblem({ allowed: true, limitText: '1.234' })).toBe('AMOUNT');
    expect(limitProblem({ allowed: true, limitText: '0' })).toBeNull();
    expect(limitProblem({ allowed: false, limitText: '' })).toBeNull();
    expect(toleranceProblem('')).toBe('REQUIRED');
    expect(toleranceProblem('2.50')).toBeNull();
  });

  it('is dirty only against the served values and builds the full replacement', () => {
    const served = policy();
    const draft = draftFrom(served);
    expect(drawerDirty(draft, served)).toBe(false);
    expect(drawerValid(draft, served)).toBe(true);

    const edited: DrawerDraft = { ...draft, vendorCod: { allowed: true, limitText: '200' } };
    expect(drawerDirty(edited, served)).toBe(true);
    expect(toDrawerUpdate(edited, served, 'Vendors deliver Saturdays')).toEqual({
      version: 3,
      currencyCode: 'USD',
      pettyExpense: { allowed: true, cashierLimit: 50 },
      vendorCod: { allowed: true, cashierLimit: 200 },
      overShortTolerance: 5,
      justification: 'Vendors deliver Saturdays',
    });
  });

  it('builds nothing when a configurable type is missing from the served policy, or the draft is invalid', () => {
    const served = policy({ types: policy().types.filter(row => row.type !== 'VENDOR_COD') });
    expect(toDrawerUpdate(draftFrom(served), served, 'A reason here')).toBeNull();
    const full = policy();
    expect(toDrawerUpdate({ ...draftFrom(full), toleranceText: 'x' }, full, 'A reason here')).toBeNull();
  });
});
