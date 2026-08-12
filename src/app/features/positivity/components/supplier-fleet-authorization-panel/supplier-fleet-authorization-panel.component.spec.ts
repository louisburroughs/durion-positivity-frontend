/**
 * Fleet authorization panel (issue #194).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 * ADR-0033: the load effect cancels in-flight work via `onCleanup`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierFleetAuthorizationPanelComponent } from './supplier-fleet-authorization-panel.component';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import { SupplierFleetAuthorization } from '../../models/supplier-fleet.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const WORKORDER_ID = 'wo-uuid-1';

const granted: SupplierFleetAuthorization = {
  workorderId: WORKORDER_ID,
  state: 'GRANTED',
  authorizationReference: 'AUTH-88421',
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  contract: {
    contractId: 'ct-1',
    contractNumber: 'MFS-2026-0044',
    fleetManagerName: 'Michelin Fleet Services',
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    policies: [],
  },
  vendorReason: null,
  authorizedAmount: '840.00',
  currency: 'EUR',
  requestedAt: '2026-08-12T09:00:00Z',
  decidedAt: '2026-08-12T09:04:00Z',
  completionApproval: null,
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 60,
};

const pending: SupplierFleetAuthorization = {
  ...granted,
  state: 'PENDING',
  authorizationReference: null,
  decidedAt: null,
  authorizedAmount: null,
  currency: null,
};

const denied: SupplierFleetAuthorization = {
  ...granted,
  state: 'DENIED',
  authorizationReference: null,
  authorizedAmount: null,
  currency: null,
  vendorReason:
    "Hors contrat : le véhicule 4471 n'est plus couvert depuis le 30/06 — contactez votre gestionnaire de flotte.",
};

const manualReview: SupplierFleetAuthorization = {
  ...granted,
  state: 'MANUAL_REVIEW',
  vendorReason: 'Fleet manager returned an unrecognised decision code (DX-77).',
};

const completedManualReview: SupplierFleetAuthorization = {
  ...granted,
  completionApproval: {
    state: 'MANUAL_REVIEW',
    vendorReason: 'Approval endpoint rejected the completion payload three times.',
    attemptCount: 3,
    lastAttemptAt: '2026-08-12T11:30:00Z',
    nextAttemptAt: null,
  },
};

const completedRetrying: SupplierFleetAuthorization = {
  ...granted,
  completionApproval: {
    state: 'RETRYING',
    vendorReason: null,
    attemptCount: 2,
    lastAttemptAt: '2026-08-12T11:30:00Z',
    nextAttemptAt: '2026-08-12T12:30:00Z',
  },
};

describe('SupplierFleetAuthorizationPanelComponent', () => {
  let fixture: ComponentFixture<SupplierFleetAuthorizationPanelComponent>;

  const service = {
    lookupVehicle: vi.fn(),
    getWorkorderAuthorization: vi.fn(),
  };

  beforeEach(async () => {
    service.getWorkorderAuthorization.mockReturnValue(of(granted));

    await TestBed.configureTestingModule({
      imports: [SupplierFleetAuthorizationPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierFleetService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierFleetAuthorizationPanelComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('workorderId', WORKORDER_ID);
    fixture.componentRef.setInput('nowMs', NOW);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('loads the authorization for the workorder and renders the state chip', () => {
    const el = render();

    expect(service.getWorkorderAuthorization).toHaveBeenCalledWith(WORKORDER_ID);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelector('.fleet-auth__state-chip .supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.AUTHORIZATION.STATE.GRANTED',
    );
  });

  it('requests nothing until the host supplies a workorder id', () => {
    fixture.componentRef.setInput('workorderId', null);
    fixture.detectChanges();

    expect(service.getWorkorderAuthorization).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('conveys the state by text plus a distinct glyph, never by colour alone', () => {
    const el = render();

    const chip = el.querySelector('.fleet-auth__state-chip');
    expect(chip?.querySelector('.supplier-chip__label')?.textContent?.trim()).toBeTruthy();
    expect(chip?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(fixture.componentInstance.stateIcons.GRANTED).toBe('verified');
    expect(fixture.componentInstance.stateIcons.DENIED).toBe('block');
    expect(fixture.componentInstance.stateIcons.PENDING).toBe('hourglass_empty');
    expect(fixture.componentInstance.stateIcons.MANUAL_REVIEW).toBe('fact_check');
  });

  it('renders the authorized amount as delivered decimal text with its currency code', () => {
    const el = render();

    expect(el.querySelector('.fleet-auth__amount-value')?.textContent?.trim()).toBe('840.00');
    expect(el.querySelector('.fleet-auth__currency')?.textContent?.trim()).toBe('EUR');
    expect(el.textContent).not.toContain('€');
  });

  // #194 §4 — DENIED shows the vendor reason verbatim.
  it('shows the fleet manager denial text verbatim beside a translated label', () => {
    service.getWorkorderAuthorization.mockReturnValue(of(denied));
    const el = render();

    expect(fixture.componentInstance.isDenied()).toBe(true);
    expect(el.querySelector('.fleet-auth__denied .fleet-auth__vendor-text')?.textContent?.trim()).toBe(
      "Hors contrat : le véhicule 4471 n'est plus couvert depuis le 30/06 — contactez votre gestionnaire de flotte.",
    );
    expect(el.querySelector('.fleet-auth__denied .fleet-auth__term')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.VENDOR_REASON',
    );
    expect(el.querySelector('.fleet-auth__denied-title')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.AUTHORIZATION.DENIED_TITLE',
    );
  });

  it('says so plainly when a denial arrives with no vendor reason at all', () => {
    service.getWorkorderAuthorization.mockReturnValue(of({ ...denied, vendorReason: null }));
    const el = render();

    expect(el.querySelector('.fleet-auth__vendor-text-missing')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.NO_VENDOR_REASON',
    );
  });

  it('shows PENDING with progress and a refresh that only re-reads (#194 §5)', () => {
    service.getWorkorderAuthorization.mockReturnValue(of(pending));
    const el = render();

    expect(fixture.componentInstance.isPending()).toBe(true);
    expect(el.querySelector('.fleet-auth__pending-body')).not.toBeNull();

    const refresh = el.querySelector('.fleet-auth__pending button') as HTMLButtonElement;
    expect(refresh.getAttribute('type')).toBe('button');

    service.getWorkorderAuthorization.mockReturnValue(of(granted));
    refresh.click();
    fixture.detectChanges();

    expect(service.getWorkorderAuthorization).toHaveBeenCalledTimes(2);
    expect(service.getWorkorderAuthorization).toHaveBeenLastCalledWith(WORKORDER_ID);
    expect(fixture.componentInstance.authorizationState()).toBe('GRANTED');
  });

  it('surfaces MANUAL_REVIEW with the vendor text and routes the user, without acting', () => {
    service.getWorkorderAuthorization.mockReturnValue(of(manualReview));
    const el = render();

    expect(fixture.componentInstance.needsManualReview()).toBe(true);
    expect(el.querySelector('.fleet-auth__review-title')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.AUTHORIZATION.MANUAL_REVIEW_TITLE',
    );
    expect(el.querySelector('.fleet-auth__review .fleet-auth__vendor-text')?.textContent?.trim()).toBe(
      'Fleet manager returned an unrecognised decision code (DX-77).',
    );
    expect(el.querySelector('.fleet-auth__review button')).toBeNull();
  });

  // #194 §6 — completion approval state, including MANUAL_REVIEW, is visible.
  it('shows the completion approval state on a completed fleet workorder', () => {
    service.getWorkorderAuthorization.mockReturnValue(of(completedManualReview));
    const el = render();

    expect(fixture.componentInstance.hasCompletionApproval()).toBe(true);
    expect(
      el.querySelector('.fleet-auth__completion-chip .supplier-chip__label')?.textContent?.trim(),
    ).toBe('POSITIVITY.FLEET.COMPLETION.STATE.MANUAL_REVIEW');
    expect(fixture.componentInstance.approvalNeedsManualReview()).toBe(true);
    expect(el.querySelector('.fleet-auth__completion-review')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.COMPLETION.MANUAL_REVIEW_NEXT',
    );
    expect(el.querySelector('.fleet-auth__completion-reason')?.textContent?.trim()).toBe(
      'Approval endpoint rejected the completion payload three times.',
    );
  });

  it('shows a retrying approval with its attempt count and the next attempt time', () => {
    service.getWorkorderAuthorization.mockReturnValue(of(completedRetrying));
    const el = render();

    expect(
      el.querySelector('.fleet-auth__completion-chip .supplier-chip__label')?.textContent?.trim(),
    ).toBe('POSITIVITY.FLEET.COMPLETION.STATE.RETRYING');
    expect(el.querySelector('.fleet-auth__completion')?.textContent).toContain('2');
    expect(el.querySelectorAll('.fleet-auth__completion time')).toHaveLength(2);
    // The backend owns the retry schedule; there is no "retry now" here.
    expect(el.querySelector('.fleet-auth__completion button')).toBeNull();
  });

  it('omits the completion section entirely before completion is attempted', () => {
    const el = render();

    expect(fixture.componentInstance.hasCompletionApproval()).toBe(false);
    expect(el.querySelector('.fleet-auth__completion')).toBeNull();
  });

  // #194 §6 — "No frontend path mutates authorization state."
  it('offers no control that requests, grants, denies, overrides or escalates', () => {
    for (const fixtureState of [pending, denied, manualReview, completedManualReview]) {
      service.getWorkorderAuthorization.mockReturnValue(of(fixtureState));
      const local = TestBed.createComponent(SupplierFleetAuthorizationPanelComponent);
      local.componentRef.setInput('workorderId', WORKORDER_ID);
      local.componentRef.setInput('nowMs', NOW);
      local.detectChanges();
      const el = local.nativeElement as HTMLElement;

      const controlText = Array.from(el.querySelectorAll('button, a, input, select, textarea'))
        .map(n => `${n.textContent ?? ''} ${n.className}`)
        .join(' ')
        .toLowerCase();

      expect(controlText).not.toMatch(
        /authorize|authorise|grant|deny|decline|approve|reject|override|escalate|request.?auth|re-?send/,
      );
      expect(el.querySelectorAll('form')).toHaveLength(0);
      local.destroy();
    }
  });

  it('never reaches anything but the read endpoint, however hard the page is clicked', () => {
    service.getWorkorderAuthorization.mockReturnValue(of(denied));
    const el = render();

    el.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.click());
    fixture.detectChanges();

    // Every call is the same read; the service exposes nothing else.
    for (const call of service.getWorkorderAuthorization.mock.calls) {
      expect(call).toEqual([WORKORDER_ID]);
    }
    expect(Object.keys(service)).toEqual(['lookupVehicle', 'getWorkorderAuthorization']);
  });

  it('renders a 404 as "not a fleet workorder", not as a failure', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(el.querySelector('.fleet-auth__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.AUTHORIZATION.NOT_FLEET',
    );
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a vendor outage as a degraded panel state with a refresh (ADR-0031)', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('unreachable');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('.pos-banner--warning button')).not.toBeNull();
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps the vendor as-of time and the platform fetch time as separate facts', () => {
    const el = render();

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n =>
      n.textContent?.trim(),
    );
    expect(terms).toEqual(['POSITIVITY.FLEET.AS_OF', 'POSITIVITY.FLEET.FETCHED_AT']);
  });

  it('formats date-only contract dates without shifting them a day (ADR-0038)', () => {
    render();

    expect(fixture.componentInstance.effectiveDateFor('2026-01-01')).toBe('2026-01-01T00:00:00');
    expect(fixture.componentInstance.effectiveDateFor(null)).toBeNull();
  });
});
