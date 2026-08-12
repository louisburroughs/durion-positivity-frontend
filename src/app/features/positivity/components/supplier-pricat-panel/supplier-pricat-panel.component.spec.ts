import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierPricatPanelComponent } from './supplier-pricat-panel.component';
import { SupplierPricatService } from '../../services/supplier-pricat.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { SupplierBinding } from '../../models/supplier-profile.models';
import { PricatFreshness, PricatRun } from '../../models/supplier-pricat.models';

const PROFILE_ID = 'profile-1';

const pricatBinding: SupplierBinding = {
  bindingId: 'bind-pricat',
  capability: 'PRICE_CATALOG',
  protocolFamily: 'EDIWHEEL_B',
  protocolVersion: 'B4_0',
  baseUrl: 'https://edi.example.com',
  path: '/pricat',
  authRef: 'michelin-prod',
  cronSchedule: '0 0 3 * * *',
  enabled: true,
};

const orderBinding: SupplierBinding = {
  ...pricatBinding,
  bindingId: 'bind-order',
  capability: 'ORDER',
  path: '/order',
};

const successRun: PricatRun = {
  runId: 'run-1',
  vendorProfileId: PROFILE_ID,
  bindingId: 'bind-pricat',
  startedAt: '2026-08-12T03:00:00Z',
  finishedAt: '2026-08-12T03:04:00Z',
  windowFrom: '2026-08-11T03:00:00Z',
  windowTo: '2026-08-12T03:00:00Z',
  outcome: 'SUCCESS',
  linesFetched: 1200,
  linesStored: 1180,
  linesUnmatched: 15,
  linesDuplicate: 5,
  checkpointState: 'ck-9',
  checkpointAt: '2026-08-12T03:04:00Z',
};

const emptyRun: PricatRun = {
  ...successRun,
  runId: 'run-2',
  outcome: 'EMPTY',
  linesFetched: 0,
  linesStored: 0,
  linesUnmatched: 0,
  linesDuplicate: 0,
};

const failedRun: PricatRun = {
  ...successRun,
  runId: 'run-3',
  outcome: 'FAILED',
  finishedAt: '2026-08-12T03:01:00Z',
  linesFetched: 0,
  linesStored: 0,
  errorCode: 'VENDOR_TIMEOUT',
};

const runningRun: PricatRun = {
  ...successRun,
  runId: 'run-4',
  outcome: 'RUNNING',
  finishedAt: null,
};

const freshness: PricatFreshness = {
  vendorProfileId: PROFILE_ID,
  latestEffectiveDate: '2026-08-10',
  lastFetchedAt: '2026-08-12T03:04:00Z',
  stalenessThresholdMinutes: 1440,
  unmatchedLineCount: 15,
};

describe('SupplierPricatPanelComponent', () => {
  let fixture: ComponentFixture<SupplierPricatPanelComponent>;
  let component: SupplierPricatPanelComponent;
  let pricat: {
    listRuns: ReturnType<typeof vi.fn>;
    getFreshness: ReturnType<typeof vi.fn>;
    triggerRun: ReturnType<typeof vi.fn>;
  };
  let profile: { listBindings: ReturnType<typeof vi.fn> };

  async function setup(options?: {
    runs?: PricatRun[];
    bindings?: SupplierBinding[];
    loadError?: HttpErrorResponse;
  }): Promise<void> {
    const runs = options?.runs ?? [successRun];
    pricat = {
      listRuns: vi
        .fn()
        .mockReturnValue(
          options?.loadError ? throwError(() => options.loadError) : of(runs),
        ),
      getFreshness: vi.fn().mockReturnValue(of(freshness)),
      triggerRun: vi.fn().mockReturnValue(of({ runId: 'run-9', accepted: true, pollAfterMs: 10 })),
    };
    profile = {
      listBindings: vi.fn().mockReturnValue(of(options?.bindings ?? [pricatBinding, orderBinding])),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierPricatPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierPricatService, useValue: pricat },
        { provide: SupplierProfileService, useValue: profile },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierPricatPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('loads runs, freshness and bindings together', async () => {
    await setup();

    expect(pricat.listRuns).toHaveBeenCalledWith(PROFILE_ID);
    expect(pricat.getFreshness).toHaveBeenCalledWith(PROFILE_ID);
    expect(profile.listBindings).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
  });

  it('reports empty when the vendor has no run history', async () => {
    await setup({ runs: [] });

    expect(component.state()).toBe('empty');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup({ loadError: new HttpErrorResponse({ status: 500, statusText: 'x' }) });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without run data on 403', async () => {
    await setup({ loadError: new HttpErrorResponse({ status: 403, statusText: 'x' }) });

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  // ── Run history rendering ──────────────────────────────────────────────────

  it('renders counts, window and checkpoint state for each run', async () => {
    await setup();
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
    const text = row?.textContent ?? '';

    expect(text).toContain('1200');
    expect(text).toContain('1180');
    expect(text).toContain('15');
    expect(text).toContain('5');
    expect(text).toContain('ck-9');
  });

  it('flags an empty fetch and states that previous data remains authoritative', async () => {
    await setup({ runs: [emptyRun] });

    expect(component.isNonDestructive(emptyRun)).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('POSITIVITY.PRICAT.PREVIOUS_DATA_AUTHORITATIVE');
  });

  it('flags a failed run with the same non-destructive note', async () => {
    await setup({ runs: [failedRun] });

    expect(component.isNonDestructive(failedRun)).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.PRICAT.PREVIOUS_DATA_AUTHORITATIVE',
    );
  });

  it('does not attach the non-destructive note to a successful run', async () => {
    await setup({ runs: [successRun] });

    expect(component.isNonDestructive(successRun)).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'POSITIVITY.PRICAT.PREVIOUS_DATA_AUTHORITATIVE',
    );
  });

  it('never implies data was cleared or removed', async () => {
    await setup({ runs: [emptyRun, failedRun] });
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').toLowerCase();

    expect(text).not.toContain('cleared');
    expect(text).not.toContain('deleted');
    expect(text).not.toContain('wiped');
  });

  it('gives each outcome a distinct tone', async () => {
    await setup();

    expect(component.outcomeTone('SUCCESS')).toBe('success');
    expect(component.outcomeTone('PARTIAL')).toBe('warning');
    expect(component.outcomeTone('EMPTY')).toBe('warning');
    expect(component.outcomeTone('FAILED')).toBe('danger');
    expect(component.outcomeTone('RUNNING')).toBe('info');
  });

  // ── Freshness ──────────────────────────────────────────────────────────────

  it('renders the vendor effective date and the fetch time as separate labelled facts', async () => {
    await setup();
    const terms = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.staleness__term'),
    ).map(n => n.textContent?.trim());

    expect(terms).toEqual([
      'POSITIVITY.PRICAT.FRESHNESS.EFFECTIVE_DATE',
      'POSITIVITY.PRICAT.FRESHNESS.LAST_FETCH',
    ]);
  });

  // ── Unmatched badge ────────────────────────────────────────────────────────

  it('shows the unmatched-line count as a badge on the worklist link', async () => {
    await setup();
    const host = fixture.nativeElement as HTMLElement;

    expect(component.unmatchedCount()).toBe(15);
    expect(host.querySelector('.pricat-panel__badge')?.textContent?.trim()).toBe('15');
  });

  it('links to the unmatched-lines route with routerLink, not a bare href (ADR-0037)', async () => {
    await setup();
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '.pricat-panel__unmatched-link',
    );

    expect(link?.getAttribute('href')).toBe(
      `/app/positivity/profiles/${PROFILE_ID}/unmatched-lines`,
    );
  });

  // ── Run now ────────────────────────────────────────────────────────────────

  it('triggers a run against the PRICAT binding and refreshes without a reload', async () => {
    await setup();
    component.runNow();

    expect(pricat.triggerRun).toHaveBeenCalledWith(PROFILE_ID, 'bind-pricat');
    // listRuns called once for the initial load and again for the in-place refresh.
    expect(pricat.listRuns.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(component.triggerAcceptedRunId()).toBe('run-9');
  });

  it('disables Run now when the PRICAT capability is unbound', async () => {
    await setup({ bindings: [orderBinding] });

    expect(component.hasPricatBinding()).toBe(false);
    expect(component.canTrigger()).toBe(false);
    component.runNow();
    expect(pricat.triggerRun).not.toHaveBeenCalled();
  });

  it('treats a 403 from the trigger endpoint as the authoritative permission answer', async () => {
    await setup();
    pricat.triggerRun.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    component.runNow();

    expect(component.triggerForbidden()).toBe(true);
    expect(component.canTrigger()).toBe(false);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.PRICAT.ERROR.TRIGGER_FORBIDDEN');
  });

  it('does not retry a trigger once the backend has denied it', async () => {
    await setup();
    pricat.triggerRun.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    component.runNow();
    component.runNow();

    expect(pricat.triggerRun).toHaveBeenCalledTimes(1);
  });

  it('sets both state and errorKey when a trigger fails for a non-permission reason', async () => {
    await setup();
    pricat.triggerRun.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'x' })),
    );
    component.runNow();

    expect(component.triggerForbidden()).toBe(false);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('polls the run list after a 202 until the run leaves RUNNING', async () => {
    vi.useFakeTimers();
    await setup({ runs: [runningRun] });
    const callsBefore = pricat.listRuns.mock.calls.length;

    component.runNow();
    vi.advanceTimersByTime(10);
    vi.advanceTimersByTime(10);

    expect(pricat.listRuns.mock.calls.length).toBeGreaterThan(callsBefore + 1);
  });

  it('stops polling once no run is RUNNING', async () => {
    vi.useFakeTimers();
    await setup({ runs: [successRun] });

    component.runNow();
    vi.advanceTimersByTime(10);
    const afterFirstPoll = pricat.listRuns.mock.calls.length;
    vi.advanceTimersByTime(1000);

    expect(pricat.listRuns.mock.calls.length).toBe(afterFirstPoll);
  });

  it('clears the poll timer on destroy', async () => {
    vi.useFakeTimers();
    await setup({ runs: [runningRun] });
    component.runNow();
    fixture.destroy();
    const afterDestroy = pricat.listRuns.mock.calls.length;
    vi.advanceTimersByTime(1000);

    expect(pricat.listRuns.mock.calls.length).toBe(afterDestroy);
  });
});
