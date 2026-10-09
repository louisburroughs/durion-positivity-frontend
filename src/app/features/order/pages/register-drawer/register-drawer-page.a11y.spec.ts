import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';
import { DrawerOptions } from '../../models/register-drawer.models';
import {
  approval,
  click,
  drawerOptions,
  fillPettyExpense,
  flush,
  pettyMovement,
  refusal,
  renderDrawer,
  text,
  type,
  unknownMovement,
} from './register-drawer-page.spec-helper';

/**
 * Accessibility of the RENDERED drawer page and its dialog (CAP:550 S22, AC 12; ADR-0029 §8–9).
 * `scripts/a11y/smoke-routes.mjs` scans `/app/order/drawer` too, but it only sees the un-hydrated
 * index shell; this renders the page through TestBed with the real copy, in both themes, and adds
 * the evidence axe cannot see: dialog modality, focus return, live regions, Label in Name per
 * locale, and that no credential or token reaches browser storage (ADR-0065).
 */
async function seriousViolations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
}

const HAND_MAINTAINED: readonly (readonly [string, unknown])[] = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
];

function lookup(bundle: unknown, key: string): string | undefined {
  let node: unknown = bundle;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

function keysUnder(bundle: unknown, prefix: string): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.push(path);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) walk(child, `${path}.${key}`);
  };
  let root: unknown = bundle;
  for (const segment of prefix.split('.')) root = (root as Record<string, unknown>)?.[segment];
  walk(root, prefix);
  return out.sort();
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(match => match[1]).sort();
}

describe('Register drawer a11y (rendered DOM)', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`reports no serious violation on an open drawer with movements (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const h = renderDrawer({ movements: [pettyMovement, unknownMovement] });
      await flush(h);

      expect(await seriousViolations(h.root)).toEqual([]);
    });

    it(`reports no serious violation in the Pay out dialog with a petty expense (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const h = renderDrawer();
      fillPettyExpense(h);
      await flush(h);

      expect(await seriousViolations(h.root)).toEqual([]);
    });

    it(`reports no serious violation with the tax fields and a refusal at a tax field (${theme}, S33 AC 12)`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      // Placeholder regime codes only (owner direction): the register names none itself.
      const options: DrawerOptions = {
        ...drawerOptions,
        categories: drawerOptions.categories.map(category => ({ ...category, offeredRegimes: ['ZZ_FED', 'ZZ_REG'] })),
        evidenceRule: { threshold: 100, currencyCode: 'CAD' },
      };
      const h = renderDrawer({ options });
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(422, 'TAX_AMOUNT_IMPLAUSIBLE', ['statedTaxes[0].amount'])));
      fillPettyExpense(h);
      type(h, 'drawer-tax-ZZ_FED', '20.00');
      type(h, 'drawer-supplier-name', 'Corner Deli');
      await flush(h);
      expect(h.q('drawer-tax')).not.toBeNull();
      expect(await seriousViolations(h.root)).toEqual([]);

      click(h, 'drawer-record');
      await flush(h);
      expect(h.q('drawer-tax-error')).not.toBeNull();
      expect(await seriousViolations(h.root)).toEqual([]);
    });

    it(`reports no serious violation on the manager step with a refusal shown (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const h = renderDrawer();
      h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
      h.mocks.requestApproval.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_DENIED')));
      fillPettyExpense(h, '80');
      click(h, 'drawer-record');
      type(h, 'drawer-manager-username', 'manager-2');
      type(h, 'drawer-manager-password', 'wrong');
      click(h, 'drawer-approve');
      await flush(h);

      expect(await seriousViolations(h.root)).toEqual([]);
    });
  }

  it('opens a true modal with the reasons in a fieldset and legend, and focuses the username on the manager step', async () => {
    const h = renderDrawer();
    h.mocks.recordMovement.mockReturnValue(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')));
    click(h, 'drawer-pay-out');

    const dialog = h.root.querySelector('dialog')!;
    expect(dialog.matches(':modal')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('drawer-dialog-title');
    const reasons = h.q('drawer-reasons')!;
    expect(reasons.tagName).toBe('FIELDSET');
    expect(text(reasons.querySelector('legend'))).toBe('What is this payout for?');
    for (const radio of Array.from(reasons.querySelectorAll<HTMLInputElement>('input[type="radio"]'))) {
      expect(h.root.querySelector(`label[for="${radio.id}"]`)).not.toBeNull();
    }
    expect(h.q('drawer-reason-PETTY_EXPENSE')!.getAttribute('aria-describedby')).toBe(
      'drawer-reason-hint-PETTY_EXPENSE',
    );

    fillPettyExpense(h, '80');
    click(h, 'drawer-record');
    await flush(h);
    expect(document.activeElement).toBe(h.q('drawer-manager-username'));
  });

  it('returns focus to Pay out and announces the movement politely after a recording', async () => {
    const h = renderDrawer();
    h.mocks.recordMovement.mockReturnValue(of(pettyMovement));
    const trigger = h.q<HTMLButtonElement>('drawer-pay-out')!;
    trigger.focus();
    click(h, 'drawer-pay-out');
    fillPettyExpense(h);
    click(h, 'drawer-record');
    await flush(h);

    expect(h.q('drawer-dialog')).toBeNull();
    expect(document.activeElement).toBe(h.q('drawer-pay-out'));
    const live = h.q('drawer-announcement')!;
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(text(live)).toBe('Recorded: Petty expense, CA$12.50');
  });

  it('returns focus to Pay out even while the options re-read is still pending (aria-disabled, not disabled)', async () => {
    const h = renderDrawer();
    h.mocks.recordMovement.mockReturnValue(of(pettyMovement));
    h.q<HTMLButtonElement>('drawer-pay-out')!.focus();
    click(h, 'drawer-pay-out');
    fillPettyExpense(h);
    h.mocks.options.mockReturnValue(new Subject<DrawerOptions>());
    click(h, 'drawer-record');
    await flush(h);

    const trigger = h.q('drawer-pay-out')!;
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(trigger);
  });

  it('lets a tall dialog scroll inside itself, since the page behind it is inert (ADR-0029)', () => {
    const h = renderDrawer();
    fillPettyExpense(h);
    const dialogElement = h.root.querySelector('dialog')!;
    expect(getComputedStyle(dialogElement).overflowY).toBe('auto');
  });

  it('keeps both live regions in the DOM in every state', () => {
    const h = renderDrawer({ session: null });
    expect(h.q('drawer-announcement')).not.toBeNull();
    expect(h.q('drawer-notice')!.getAttribute('role')).toBe('alert');
  });

  it('leaves no credential or token in localStorage or sessionStorage after an approval (AC 12)', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const h = renderDrawer();
    h.mocks.recordMovement
      .mockReturnValueOnce(throwError(() => refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED')))
      .mockReturnValueOnce(of(pettyMovement));
    h.mocks.requestApproval.mockReturnValue(of(approval));
    fillPettyExpense(h, '80');
    click(h, 'drawer-record');
    type(h, 'drawer-manager-username', 'manager-2');
    type(h, 'drawer-manager-password', 'correct horse');
    click(h, 'drawer-approve');
    await flush(h);

    const stored = [
      ...Object.keys(localStorage).map(key => `${key}=${localStorage.getItem(key)}`),
      ...Object.keys(sessionStorage).map(key => `${key}=${sessionStorage.getItem(key)}`),
    ].join('\n');
    for (const secret of ['correct horse', 'manager-2', approval.approvalToken]) {
      expect(stored).not.toContain(secret);
    }
  });

  describe('copy and Label in Name per locale', () => {
    it.each(HAND_MAINTAINED)(
      '%s names Continue to manager approval, Approve, Back, Retry and both options-Retry buttons by their visible text',
      (name, bundle) => {
        const expectNamed = (h: ReturnType<typeof renderDrawer>, testId: string, key: string): void => {
          const control = h.q(testId);
          expect(control, testId).not.toBeNull();
          expect(control!.getAttribute('aria-label')).toBeNull();
          expect(text(control)).toBe(lookup(bundle, key));
        };

        // Change the float: the manager step comes first, then Approve and Back.
        const float = renderDrawer({ locale: { name, bundle } });
        float.mocks.requestApproval.mockReturnValue(new Subject<typeof approval>());
        click(float, 'drawer-change-float');
        click(float, 'drawer-reason-FLOAT_INCREASE');
        type(float, 'drawer-amount', '50');
        expectNamed(float, 'drawer-record', 'ORDER.DRAWER.DIALOG.CONTINUE_TO_MANAGER');
        click(float, 'drawer-record');
        expectNamed(float, 'drawer-approve', 'ORDER.DRAWER.APPROVAL.APPROVE');
        expectNamed(float, 'drawer-approval-back', 'ORDER.DRAWER.APPROVAL.BACK');
        // The credential inputs carry random ids (ADR-0065); each is still named by its visible label.
        for (const [testId, key] of [
          ['drawer-manager-username', 'ORDER.DRAWER.APPROVAL.USERNAME'],
          ['drawer-manager-password', 'ORDER.DRAWER.APPROVAL.PASSWORD'],
        ] as const) {
          const input = float.q<HTMLInputElement>(testId)!;
          expect(input.getAttribute('aria-label')).toBeNull();
          expect(text(float.root.querySelector(`label[for="${input.id}"]`))).toBe(lookup(bundle, key));
          expect(input.labels?.length).toBe(1);
        }
        float.fixture.destroy();
        TestBed.resetTestingModule();

        // An unknown outcome: the primary action is Retry; a failed options re-read in the dialog.
        const unknown = renderDrawer({ locale: { name, bundle } });
        unknown.mocks.recordMovement.mockReturnValue(throwError(() => refusal(504)));
        fillPettyExpense(unknown);
        click(unknown, 'drawer-record');
        expectNamed(unknown, 'drawer-record', 'ORDER.DRAWER.DIALOG.RETRY');
        unknown.mocks.options.mockReturnValue(throwError(() => refusal(500)));
        unknown.component.onOptionsStale();
        unknown.render();
        expectNamed(unknown, 'drawer-dialog-options-retry', 'ORDER.DRAWER.RETRY_OPTIONS');
        unknown.fixture.destroy();
        TestBed.resetTestingModule();

        // A failed options read on the page.
        const failed = renderDrawer({
          locale: { name, bundle },
          before: mocks => mocks.options.mockReturnValue(throwError(() => refusal(500))),
        });
        expectNamed(failed, 'drawer-options-retry', 'ORDER.DRAWER.RETRY_OPTIONS');
      },
    );

    it.each(HAND_MAINTAINED)('%s names every control by its visible text, with no aria-label', (name, bundle) => {
      const h = renderDrawer({ locale: { name, bundle } });
      click(h, 'drawer-pay-out');
      click(h, 'drawer-reason-PETTY_EXPENSE');

      const controls: readonly (readonly [string, string])[] = [
        ['drawer-pay-out', 'ORDER.DRAWER.ACTIONS.PAY_OUT'],
        ['drawer-change-float', 'ORDER.DRAWER.ACTIONS.CHANGE_FLOAT'],
        ['drawer-record', 'ORDER.DRAWER.DIALOG.RECORD'],
        ['drawer-cancel', 'ORDER.DRAWER.DIALOG.CANCEL'],
      ];
      for (const [testId, key] of controls) {
        const control = h.q(testId)!;
        expect(control.getAttribute('aria-label')).toBeNull();
        expect(text(control)).toBe(lookup(bundle, key));
      }
      const radio = h.q('drawer-reason-PETTY_EXPENSE')!;
      expect(radio.getAttribute('aria-label')).toBeNull();
      expect(text(h.root.querySelector('label[for="drawer-reason-PETTY_EXPENSE"]'))).toBe(
        lookup(bundle, 'ORDER.DRAWER.REASON.PETTY_EXPENSE'),
      );
    });

    it.each([...HAND_MAINTAINED, ['qps-ploc', qpsPloc] as const])(
      '%s carries every ORDER.DRAWER key with the en-US placeholders',
      (_name, bundle) => {
        const keys = keysUnder(enUS, 'ORDER.DRAWER');
        expect(keysUnder(bundle, 'ORDER.DRAWER')).toEqual(keys);
        for (const key of keys) {
          expect(placeholders(lookup(bundle, key)!)).toEqual(placeholders(lookup(enUS, key)!));
        }
      },
    );

    it('says what the story says', () => {
      expect(lookup(enUS, 'ORDER.DRAWER.NO_SESSION')).toBe('No drawer is open on this register.');
      expect(lookup(enUS, 'ORDER.DRAWER.CLOSING')).toBe('The drawer is being counted; payouts are closed.');
      expect(lookup(enUS, 'ORDER.DRAWER.OPTIONS_FAILED')).toBe("Payout options couldn't be loaded");
      expect(lookup(enUS, 'ORDER.DRAWER.RECORDED')).toBe('Recorded: {{reason}}, {{amount}}');
      expect(lookup(enUS, 'ORDER.DRAWER.REASON.UNKNOWN')).toBe('Unknown');
      expect(lookup(enUS, 'ORDER.DRAWER.DIALOG.LEGEND_PAY_OUT')).toBe('What is this payout for?');
      expect(lookup(enUS, 'ORDER.DRAWER.DIALOG.CONSEQUENCE_OUT')).toBe(
        "This takes {{amount}} out of the drawer as {{reason}}. Recorded payouts can't be changed or deleted.",
      );
      expect(lookup(enUS, 'ORDER.DRAWER.APPROVAL.INTRO')).toBe(
        'A manager needs to approve this. They enter their own username and password here and must be someone other than you.',
      );
      expect(lookup(enUS, 'ORDER.DRAWER.ERROR.APPROVAL_DENIED')).toBe(
        "That didn't work. Check the username and password, and that this person can approve drawer payouts.",
      );
      expect(lookup(enUS, 'ORDER.DRAWER.ERROR.SELF_APPROVAL')).toBe('The manager must be someone other than the cashier.');
      expect(lookup(enUS, 'ORDER.DRAWER.ERROR.TYPE_NOT_ALLOWED')).toBe(
        '{{reason}} was just turned off for this drawer. Nothing was recorded.',
      );
      expect(lookup(enUS, 'ORDER.DRAWER.ERROR.FLOAT_NOT_RECORDED')).toBe(
        "This doesn't match the float change accounting recorded.",
      );
      expect(lookup(enUS, 'ORDER.DRAWER.DIALOG.FLOAT_NOTE')).toBe(
        'Changing the float always needs a manager. It must match the float change accounting recorded.',
      );
      expect(lookup(enUS, 'ORDER.DRAWER.DIALOG.LIMIT_HINT')).toBe(
        'Up to {{limit}} per drawer session without a manager; everything of this kind in the drawer counts',
      );
    });
  });
});
