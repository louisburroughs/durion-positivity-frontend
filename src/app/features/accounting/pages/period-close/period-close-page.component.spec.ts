import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { AuthService } from '../../../../core/services/auth.service';
import { AccountingPeriod, periodCodeOf } from '../../models/period-close.models';
import { PeriodCloseService } from '../../services/period-close.service';
import { PeriodClosePageComponent } from './period-close-page.component';

const period = (overrides: Partial<AccountingPeriod> = {}): AccountingPeriod => ({
  periodCode: '2026-07',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  status: 'OPEN',
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  reopenedBy: null,
  reopenJustification: null,
  ...overrides,
});

const OPEN_JULY = period();
const CLOSED_JUNE = period({
  periodCode: '2026-06',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  status: 'CLOSED',
  closedAt: '2026-07-02T09:00:00Z',
  closedBy: 'controller.jane',
});

const CLOSE = 'accounting:period:close';
const REOPEN = 'accounting:period:reopen';

/** Permissions known, both write codes held, unless a test narrows them before `setup()`. */
const authStub = {
  known: true,
  granted: [CLOSE, REOPEN] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const serviceStub = {
  listPeriods: vi.fn(),
  closePeriod: vi.fn(),
  reopenPeriod: vi.fn(),
};

const httpError = (status: number, body: unknown = null): HttpErrorResponse => new HttpErrorResponse({ status, error: body });

type Bundle = Record<string, unknown>;
const lookup = (bundle: Bundle, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);

describe('PeriodClosePageComponent', () => {
  let fixture: ComponentFixture<PeriodClosePageComponent>;
  let component: PeriodClosePageComponent;
  let el: HTMLElement;

  const setup = (periods: readonly AccountingPeriod[] = [OPEN_JULY, CLOSED_JUNE]): void => {
    serviceStub.listPeriods.mockReturnValue(of(periods));
    TestBed.configureTestingModule({
      imports: [PeriodClosePageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: PeriodCloseService, useValue: serviceStub },
        { provide: AuthService, useValue: authStub },
      ],
    });
    fixture = TestBed.createComponent(PeriodClosePageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const row = (code: string): HTMLElement => el.querySelector(`[data-period="${code}"]`) as HTMLElement;
  const buttonIn = (code: string, testId: string): HTMLButtonElement =>
    row(code).querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
  const click = (target: HTMLElement | null): void => {
    target?.click();
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    authStub.known = true;
    authStub.granted = [CLOSE, REOPEN];
    TestBed.resetTestingModule();
  });

  describe('loading', () => {
    it('lists each period with the action its status allows', () => {
      setup();

      expect(serviceStub.listPeriods).toHaveBeenCalledTimes(1);
      expect(component.state()).toBe('ready');
      expect(el.querySelectorAll('[data-testid="period-row"]')).toHaveLength(2);
      expect(buttonIn('2026-07', 'close-button')).not.toBeNull();
      expect(buttonIn('2026-07', 'reopen-button')).toBeNull();
      expect(buttonIn('2026-06', 'reopen-button')).not.toBeNull();
      expect(buttonIn('2026-06', 'close-button')).toBeNull();
    });

    it('offers no action on a row whose status is unknown', () => {
      setup([period({ status: 'UNKNOWN' })]);

      expect(buttonIn('2026-07', 'close-button')).toBeNull();
      expect(buttonIn('2026-07', 'reopen-button')).toBeNull();
    });

    it('shows the empty state, and still offers closing a month, when no period exists', () => {
      setup([]);

      expect(query('empty-state')).not.toBeNull();
      expect(query('close-month-input')).not.toBeNull();
    });

    it('names a 403 as missing permission, with state set before the key', () => {
      serviceStub.listPeriods.mockReturnValue(throwError(() => httpError(403)));
      TestBed.configureTestingModule({
        imports: [PeriodClosePageComponent, TranslateModule.forRoot()],
        providers: [
          { provide: PeriodCloseService, useValue: serviceStub },
          { provide: AuthService, useValue: authStub },
        ],
      });
      fixture = TestBed.createComponent(PeriodClosePageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.ERROR.FORBIDDEN');
    });

    it('names any other failure as a load failure, and Retry reads again', () => {
      setup();
      serviceStub.listPeriods.mockReturnValueOnce(throwError(() => httpError(503)));
      component.load();
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.ERROR.LOAD');
      expect(query('error-state')?.getAttribute('role')).toBe('alert');

      click(query('error-state')?.querySelector('button') ?? null);

      // The initial load, the failed one, then the retry.
      expect(serviceStub.listPeriods).toHaveBeenCalledTimes(3);
      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
    });

    it('drops a superseded read so a late answer never repaints the list', () => {
      setup();
      const first = new Subject<AccountingPeriod[]>();
      const second = new Subject<AccountingPeriod[]>();
      serviceStub.listPeriods.mockReturnValueOnce(first).mockReturnValueOnce(second);

      component.load();
      component.load();
      second.next([CLOSED_JUNE]);
      first.next([OPEN_JULY]);

      expect(component.periods().map(p => p.periodCode)).toEqual(['2026-06']);
    });
  });

  describe('closing a listed period', () => {
    it('confirms in a native modal, closes, and announces the result with focus on it', async () => {
      setup();
      const response = new Subject<AccountingPeriod>();
      serviceStub.closePeriod.mockReturnValue(response);

      click(buttonIn('2026-07', 'close-button'));
      const dialog = query('confirm-close-dialog') as HTMLDialogElement;
      expect(dialog.tagName).toBe('DIALOG');
      expect(dialog.matches(':modal')).toBe(true);
      expect(serviceStub.closePeriod).not.toHaveBeenCalled();

      click(query('confirm-close'));
      await fixture.whenStable();
      expect(serviceStub.closePeriod).toHaveBeenCalledWith('2026-07');
      expect(query('confirm-close-dialog')).toBeNull();
      expect(query('pending-note')).not.toBeNull();
      expect(document.activeElement).toBe(query('pending-note'));
      expect(buttonIn('2026-06', 'reopen-button').disabled).toBe(true);
      expect((query('close-month-submit') as HTMLButtonElement).disabled).toBe(true);

      response.next({ ...OPEN_JULY, status: 'CLOSED', closedAt: '2026-08-01T09:00:00Z', closedBy: 'controller.jane' });
      response.complete();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.state()).toBe('ready');
      expect(component.periods().find(p => p.periodCode === '2026-07')?.status).toBe('CLOSED');
      expect(buttonIn('2026-07', 'reopen-button')).not.toBeNull();
      const success = query('outcome-success');
      expect(success?.textContent?.trim()).toBe('ACCOUNTING.PERIOD_CLOSE.OUTCOME.CLOSED');
      expect(success?.closest('[role="status"]')).not.toBeNull();
      expect(document.activeElement).toBe(success);
      expect(query('pending-note')).toBeNull();
    });

    it('leaves the period untouched when the confirmation is cancelled', () => {
      setup();

      click(buttonIn('2026-07', 'close-button'));
      click(query('cancel-dialog'));

      expect(query('confirm-close-dialog')).toBeNull();
      expect(serviceStub.closePeriod).not.toHaveBeenCalled();
    });

    it('returns focus to the row button that opened the confirmation when it is cancelled', async () => {
      setup();
      const opener = buttonIn('2026-07', 'close-button');
      opener.focus();

      click(opener);
      expect(el.querySelector('dialog')?.contains(document.activeElement)).toBe(true);
      click(query('cancel-dialog'));
      await fixture.whenStable();

      expect(document.activeElement).toBe(opener);
    });

    it('lands the result on the requested row when the response leaves the code unset', () => {
      setup();
      serviceStub.closePeriod.mockReturnValue(of({ ...OPEN_JULY, periodCode: '', status: 'CLOSED' }));

      click(buttonIn('2026-07', 'close-button'));
      click(query('confirm-close'));

      expect(component.periods().map(p => [p.periodCode, p.status])).toEqual([
        ['2026-07', 'CLOSED'],
        ['2026-06', 'CLOSED'],
      ]);
    });

    it('reports blocking draft entries with their count, keeps the list, and does not re-read', async () => {
      setup();
      serviceStub.closePeriod.mockReturnValue(
        throwError(() =>
          httpError(422, {
            code: 'PERIOD_HAS_DRAFT_ENTRIES',
            fieldErrors: [
              { field: 'draftJournalEntryIds', message: 'a' },
              { field: 'draftJournalEntryIds', message: 'b' },
            ],
          }),
        ),
      );

      click(buttonIn('2026-07', 'close-button'));
      click(query('confirm-close'));
      await fixture.whenStable();

      expect(component.state()).toBe('ready');
      expect(component.outcome()).toEqual({
        tone: 'error',
        key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.DRAFT_ENTRIES',
        periodCode: '2026-07',
        count: 2,
      });
      const alert = query('outcome-error');
      expect(alert?.closest('[role="alert"]')).not.toBeNull();
      expect(document.activeElement).toBe(alert);
      expect(serviceStub.listPeriods).toHaveBeenCalledTimes(1);
      expect(buttonIn('2026-07', 'close-button').disabled).toBe(false);
    });

    it('re-reads the list when someone else closed the period first', () => {
      setup();
      serviceStub.closePeriod.mockReturnValue(throwError(() => httpError(409, { code: 'PERIOD_ALREADY_CLOSED' })));

      click(buttonIn('2026-07', 'close-button'));
      click(query('confirm-close'));

      expect(component.outcome()?.key).toBe('ACCOUNTING.PERIOD_CLOSE.ERROR.ALREADY_CLOSED');
      expect(serviceStub.listPeriods).toHaveBeenCalledTimes(2);
    });

    it('names a 403 on close as the close permission, not the view permission', () => {
      setup();
      serviceStub.closePeriod.mockReturnValue(throwError(() => httpError(403)));

      click(buttonIn('2026-07', 'close-button'));
      click(query('confirm-close'));

      expect(component.outcome()?.key).toBe('ACCOUNTING.PERIOD_CLOSE.ERROR.FORBIDDEN_CLOSE');
    });
  });

  describe('closing a month by code', () => {
    const monthAfter = (today: Date): string => periodCodeOf(new Date(today.getFullYear(), today.getMonth() + 1, 1));

    it('defaults to the month before the component-held today', () => {
      setup();
      const today = component.today();
      expect(component.monthControl.value).toBe(periodCodeOf(new Date(today.getFullYear(), today.getMonth() - 1, 1)));
    });

    it('opens the confirmation for a started month that is not listed', () => {
      setup([]);
      const current = periodCodeOf(component.today());
      component.monthControl.setValue(current);

      component.submitMonth();

      expect(component.dialog()).toEqual({ action: 'close', periodCode: current });
    });

    it('refuses a month that has not started, before asking the server', () => {
      setup();
      component.monthControl.setValue(monthAfter(component.today()));

      component.submitMonth();
      fixture.detectChanges();

      expect(component.dialog()).toBeNull();
      expect(component.monthErrorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.FUTURE');
      const input = query('close-month-input') as HTMLInputElement;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toContain('close-month-error');
    });

    it('refuses a blank month and a month already listed as closed', () => {
      setup();

      component.monthControl.setValue('');
      component.submitMonth();
      expect(component.monthErrorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.INVALID');

      component.monthControl.setValue('2026-06');
      component.submitMonth();
      expect(component.monthErrorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.ALREADY_CLOSED');
      expect(component.dialog()).toBeNull();
    });

    it('clears the field error once the month is edited', () => {
      setup();
      component.monthControl.setValue('');
      component.submitMonth();

      component.monthControl.setValue('2026-05');

      expect(component.monthErrorKey()).toBeNull();
    });
  });

  describe('reopening a closed period', () => {
    it('requires a justification before calling the server', () => {
      setup();

      click(buttonIn('2026-06', 'reopen-button'));
      component.justificationControl.setValue('   ');
      click(query('confirm-reopen'));

      expect(serviceStub.reopenPeriod).not.toHaveBeenCalled();
      expect(component.justificationErrorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.CONFIRM_REOPEN.ERROR.REQUIRED');
      expect(query('confirm-reopen-dialog')).not.toBeNull();
      const textarea = query('reopen-justification') as HTMLTextAreaElement;
      expect(textarea.getAttribute('aria-describedby')).toBe('reopen-hint reopen-error');
    });

    it('refuses a justification longer than the backend accepts', () => {
      setup();

      click(buttonIn('2026-06', 'reopen-button'));
      component.justificationControl.setValue('x'.repeat(component.justificationMax + 1));
      component.confirmReopen();

      expect(serviceStub.reopenPeriod).not.toHaveBeenCalled();
      expect(component.justificationErrorKey()).toBe('ACCOUNTING.PERIOD_CLOSE.CONFIRM_REOPEN.ERROR.TOO_LONG');
    });

    it('sends the trimmed justification and marks the period open', async () => {
      setup();
      serviceStub.reopenPeriod.mockReturnValue(
        of({ ...CLOSED_JUNE, status: 'OPEN', reopenedAt: '2026-08-03T10:00:00Z', reopenJustification: 'Late vendor bill' }),
      );

      click(buttonIn('2026-06', 'reopen-button'));
      expect((query('confirm-reopen-dialog') as HTMLDialogElement).matches(':modal')).toBe(true);
      component.justificationControl.setValue('  Late vendor bill  ');
      click(query('confirm-reopen'));
      await fixture.whenStable();

      expect(serviceStub.reopenPeriod).toHaveBeenCalledWith('2026-06', 'Late vendor bill');
      expect(component.periods().find(p => p.periodCode === '2026-06')?.status).toBe('OPEN');
      expect(component.outcome()?.key).toBe('ACCOUNTING.PERIOD_CLOSE.OUTCOME.REOPENED');
      expect(buttonIn('2026-06', 'close-button')).not.toBeNull();
    });

    it('starts each reopen with an empty justification', () => {
      setup();

      click(buttonIn('2026-06', 'reopen-button'));
      component.justificationControl.setValue('draft reason');
      click(query('cancel-dialog'));
      click(buttonIn('2026-06', 'reopen-button'));

      expect(component.justificationControl.value).toBe('');
    });

    it('re-reads the list when the period was already reopened', () => {
      setup();
      serviceStub.reopenPeriod.mockReturnValue(throwError(() => httpError(409, { code: 'PERIOD_ALREADY_OPEN' })));

      click(buttonIn('2026-06', 'reopen-button'));
      component.justificationControl.setValue('Late vendor bill');
      component.confirmReopen();

      expect(component.outcome()?.key).toBe('ACCOUNTING.PERIOD_CLOSE.ERROR.ALREADY_OPEN');
      expect(serviceStub.listPeriods).toHaveBeenCalledTimes(2);
    });
  });

  /** ADR-0040 §6a: each write gates its control and its handler on its own code. */
  describe('write permissions', () => {
    it('lets a close-only session close but not reopen', () => {
      authStub.granted = [CLOSE];
      setup();

      expect(buttonIn('2026-07', 'close-button').disabled).toBe(false);
      expect(buttonIn('2026-06', 'reopen-button').disabled).toBe(true);

      component.requestReopen('2026-06');
      expect(component.dialog()).toBeNull();
    });

    it('lets a reopen-only session reopen but not close, by button, by month or by method', () => {
      authStub.granted = [REOPEN];
      setup();

      expect(buttonIn('2026-06', 'reopen-button').disabled).toBe(false);
      expect(buttonIn('2026-07', 'close-button').disabled).toBe(true);
      expect(query('close-month-input')).toBeNull();

      component.requestClose('2026-07');
      component.monthControl.setValue('2026-05');
      component.submitMonth();
      expect(component.dialog()).toBeNull();
    });

    it('refuses in the confirm handlers themselves, not only at the buttons', () => {
      authStub.granted = [];
      setup();

      component.dialog.set({ action: 'close', periodCode: '2026-07' });
      component.confirmClose();
      component.dialog.set({ action: 'reopen', periodCode: '2026-06' });
      component.justificationControl.setValue('Late vendor bill');
      component.confirmReopen();

      expect(serviceStub.closePeriod).not.toHaveBeenCalled();
      expect(serviceStub.reopenPeriod).not.toHaveBeenCalled();
    });

    it('shows a view-only note and no enabled write control to a view-only session', () => {
      authStub.granted = [];
      setup();

      expect(query('view-only-note')).not.toBeNull();
      expect(buttonIn('2026-07', 'close-button').disabled).toBe(true);
      expect(buttonIn('2026-06', 'reopen-button').disabled).toBe(true);
    });

    it('follows the canAccess() fallback when the token carries no permissions', () => {
      authStub.known = false;
      authStub.granted = [];
      setup();

      expect(component.canClose()).toBe(true);
      expect(component.canReopen()).toBe(true);
      expect(query('view-only-note')).toBeNull();
    });
  });

  describe('copy, against the shipped bundles', () => {
    const SHIPPED: readonly (readonly [string, Bundle])[] = [
      ['en-US', enUS],
      ['es-US', esUS],
      ['es-MX', esMX],
      ['fr-CA', frCA],
      ['fr-FR', frFR],
    ];

    for (const [locale, bundle] of SHIPPED) {
      it(`${locale}: each row action's accessible name starts with its visible label (Label in Name)`, () => {
        setup();
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation(locale, bundle as TranslationObject);
        translate.use(locale);
        fixture.detectChanges();

        const pairs: readonly (readonly [HTMLButtonElement, string])[] = [
          [buttonIn('2026-07', 'close-button'), 'ACCOUNTING.PERIOD_CLOSE.ACTION.CLOSE'],
          [buttonIn('2026-06', 'reopen-button'), 'ACCOUNTING.PERIOD_CLOSE.ACTION.REOPEN'],
        ];
        for (const [button, key] of pairs) {
          const visible = lookup(bundle, key);
          expect(visible, `${locale} ${key}`).toBeTypeOf('string');
          const name = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
          expect(name.startsWith(visible as string)).toBe(true);
          // The row's month follows the label, so each button names its own period.
          expect(name.length).toBeGreaterThan((visible as string).length);
        }
      });
    }

    it('en-US: the draft-entries refusal says what blocks the close and how to clear it', () => {
      const text = lookup(enUS, 'ACCOUNTING.PERIOD_CLOSE.ERROR.DRAFT_ENTRIES') as string;
      expect(text).toContain('{{count}}');
      expect(text.toLowerCase()).toContain('draft');
      expect(text.toLowerCase()).toMatch(/post or delete/);
    });

    it('every locale keeps the placeholders en-US uses in each period-close string', () => {
      const placeholders = (value: string): string[] => (value.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();
      const walk = (node: unknown, path: string, out: Map<string, string>): Map<string, string> => {
        if (typeof node === 'string') out.set(path, node);
        else if (node && typeof node === 'object')
          for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out);
        return out;
      };
      const base = walk(lookup(enUS, 'ACCOUNTING.PERIOD_CLOSE'), '', new Map());
      for (const [locale, bundle] of SHIPPED) {
        const target = walk(lookup(bundle, 'ACCOUNTING.PERIOD_CLOSE'), '', new Map());
        for (const [key, value] of base) {
          expect(placeholders(target.get(key) ?? ''), `${locale} ${key}`).toEqual(placeholders(value));
        }
      }
    });
  });
});
