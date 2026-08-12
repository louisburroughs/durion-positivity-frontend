import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExchangeAuditListPageComponent } from './exchange-audit-list-page.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { ExchangeAuditPage, ExchangeAuditRecord } from '../../models/supplier-exchange.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const profileSummary: VendorProfileSummary = {
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

const successExchange: ExchangeAuditRecord = {
  exchangeAuditId: 'exch-1',
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  bindingId: 'bind-1',
  capability: 'ORDER',
  protocolFamily: 'EDIWHEEL_C1',
  protocolVersion: 'C1_1',
  httpMethod: 'POST',
  endpointUri: 'https://edi.example.com/order',
  attempt: 1,
  correlationId: 'corr-1',
  outcome: 'SUCCESS',
  httpStatus: 200,
  startedAt: '2026-08-12T09:00:00Z',
  durationMs: 412,
  captureLevel: 'REDACTED',
  requestPayloadPresent: true,
  responsePayloadPresent: true,
};

/** Circuit-breaker suppression: no response arrived, so there is no status. */
const suppressedExchange: ExchangeAuditRecord = {
  ...successExchange,
  exchangeAuditId: 'exch-2',
  outcome: 'CIRCUIT_OPEN',
  httpStatus: null,
  durationMs: null,
  correlationId: 'corr-2',
};

const pageFixture: ExchangeAuditPage = {
  items: [successExchange, suppressedExchange],
  page: 0,
  size: 25,
  totalCount: 2,
  totalPages: 1,
};

/** Local `YYYY-MM-DD` built from local getters, per ADR-0038. */
function dateOnly(offsetDays: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

describe('ExchangeAuditListPageComponent', () => {
  let fixture: ComponentFixture<ExchangeAuditListPageComponent>;
  let component: ExchangeAuditListPageComponent;
  let audit: { listExchanges: ReturnType<typeof vi.fn> };
  let profiles: { listProfiles: ReturnType<typeof vi.fn> };

  async function setup(
    result: ExchangeAuditPage | HttpErrorResponse = pageFixture,
  ): Promise<void> {
    audit = {
      listExchanges: vi
        .fn()
        .mockReturnValue(
          result instanceof HttpErrorResponse ? throwError(() => result) : of(result),
        ),
    };
    profiles = { listProfiles: vi.fn().mockReturnValue(of([profileSummary])) };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ExchangeAuditListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierExchangeAuditService, useValue: audit },
        { provide: SupplierProfileService, useValue: profiles },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExchangeAuditListPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Choose a vendor and run the query, as an operator would. */
  function selectVendorAndApply(): void {
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID });
    component.applyFilter();
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  // ── The vendor is required ────────────────────────────────────────────────

  it('prompts for a vendor and issues no request until one is chosen', async () => {
    await setup();

    expect(component.state()).toBe('prompt');
    expect(audit.listExchanges).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.SELECT_VENDOR_PROMPT',
    );
  });

  it('does not present the prompt as an empty result or an error', async () => {
    await setup();
    const host = fixture.nativeElement as HTMLElement;

    expect(component.errorKey()).toBeNull();
    expect(host.textContent).not.toContain('POSITIVITY.AUDIT.EMPTY');
    expect(host.querySelector('.pos-banner--error')).toBeNull();
  });

  it('loads the vendor list for the filter without a vendor being chosen', async () => {
    await setup();

    expect(profiles.listProfiles).toHaveBeenCalled();
  });

  it('queries once a vendor is chosen', async () => {
    await setup();
    selectVendorAndApply();

    expect(audit.listExchanges).toHaveBeenCalledTimes(1);
    expect(component.state()).toBe('ready');
    expect(component.totalCount()).toBe(2);
  });

  // ── Default window ────────────────────────────────────────────────────────

  it('pre-fills the last seven days, inclusive of today', async () => {
    await setup();
    const raw = component.filterForm.getRawValue();

    expect(raw.dateTo).toBe(dateOnly(0));
    expect(raw.dateFrom).toBe(dateOnly(-6));
  });

  it('sends the date-only window straight through; conversion belongs to the service', async () => {
    await setup();
    component.filterForm.patchValue({
      vendorProfileId: PROFILE_ID,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-07',
      capability: 'ORDER',
    });
    component.applyFilter();

    expect(audit.listExchanges).toHaveBeenLastCalledWith(
      {
        vendorProfileId: PROFILE_ID,
        dateFrom: '2026-08-01',
        dateTo: '2026-08-07',
        capability: 'ORDER',
      },
      0,
    );
  });

  it('sends no outcome to the service — there is no such query parameter', async () => {
    await setup();
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID, outcome: 'FAILURE' });
    component.applyFilter();

    const sentFilter = audit.listExchanges.mock.calls[0][0] as Record<string, unknown>;
    expect(sentFilter).not.toHaveProperty('outcome');
  });

  it('restores the default window when cleared, and stops querying without a vendor', async () => {
    await setup();
    selectVendorAndApply();
    component.clearFilter();

    expect(component.filterForm.getRawValue().outcome).toBe('');
    expect(component.filterForm.getRawValue().dateTo).toBe(dateOnly(0));
    expect(component.state()).toBe('prompt');
  });

  // ── Client-side outcome filtering ─────────────────────────────────────────

  it('narrows the loaded rows client-side by outcome', async () => {
    await setup();
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID, outcome: 'SUCCESS' });
    component.applyFilter();
    fixture.detectChanges();

    expect(component.loadedExchanges()).toHaveLength(2);
    expect(component.exchanges()).toHaveLength(1);
    expect(component.exchanges()[0].outcome).toBe('SUCCESS');
  });

  it('says the outcome filter applies to the loaded page only', async () => {
    await setup();
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID, outcome: 'SUCCESS' });
    component.applyFilter();
    fixture.detectChanges();

    expect(component.outcomeFilterActive()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.OUTCOME_FILTER_SCOPE',
    );
  });

  it('does not show the scope note when no outcome filter is applied', async () => {
    await setup();
    selectVendorAndApply();

    expect(component.outcomeFilterActive()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'POSITIVITY.AUDIT.OUTCOME_FILTER_SCOPE',
    );
  });

  it('distinguishes "none on this page" from "no exchanges at all"', async () => {
    await setup();
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID, outcome: 'TIMEOUT' });
    component.applyFilter();
    fixture.detectChanges();

    expect(component.hiddenByOutcomeFilter()).toBe(true);
    expect(component.state()).toBe('ready');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('POSITIVITY.AUDIT.OUTCOME_FILTER_EMPTY');
    expect(text).not.toContain('POSITIVITY.AUDIT.EMPTY');
  });

  it('keeps the server total, not the filtered count, as the reported total', async () => {
    await setup({ ...pageFixture, totalCount: 57, totalPages: 3 });
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID, outcome: 'SUCCESS' });
    component.applyFilter();

    expect(component.totalCount()).toBe(57);
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('reports the page position 1-based', async () => {
    await setup({ ...pageFixture, page: 2, totalPages: 5 });
    selectVendorAndApply();

    expect(component.page()).toBe(2);
    expect(component.pageNumber()).toBe(3);
    expect(component.totalPages()).toBe(5);
  });

  it('advances to the next page', async () => {
    await setup({ ...pageFixture, page: 0, totalPages: 3 });
    selectVendorAndApply();
    component.nextPage();

    expect(audit.listExchanges).toHaveBeenLastCalledWith(expect.any(Object), 1);
  });

  it('goes back to the previous page', async () => {
    await setup({ ...pageFixture, page: 2, totalPages: 3 });
    selectVendorAndApply();
    component.previousPage();

    expect(audit.listExchanges).toHaveBeenLastCalledWith(expect.any(Object), 1);
  });

  it('refuses to page before the first page', async () => {
    await setup({ ...pageFixture, page: 0, totalPages: 3 });
    selectVendorAndApply();
    audit.listExchanges.mockClear();
    component.previousPage();

    expect(component.hasPreviousPage()).toBe(false);
    expect(audit.listExchanges).not.toHaveBeenCalled();
  });

  it('refuses to page past the last page', async () => {
    await setup({ ...pageFixture, page: 2, totalPages: 3 });
    selectVendorAndApply();
    audit.listExchanges.mockClear();
    component.nextPage();

    expect(component.hasNextPage()).toBe(false);
    expect(audit.listExchanges).not.toHaveBeenCalled();
  });

  it('restarts at the first page when filters change', async () => {
    await setup({ ...pageFixture, page: 2, totalPages: 3 });
    selectVendorAndApply();
    component.nextPage();
    component.applyFilter();

    expect(audit.listExchanges).toHaveBeenLastCalledWith(expect.any(Object), 0);
  });

  it('disables the paging controls at the ends of the range', async () => {
    await setup({ ...pageFixture, page: 0, totalPages: 1 });
    selectVendorAndApply();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.audit-page__pagination button',
      ),
    );

    expect(buttons).toHaveLength(2);
    expect(buttons.every(b => b.disabled)).toBe(true);
  });

  // ── Truthful rendering ────────────────────────────────────────────────────

  it('renders a missing HTTP status as "no response", never as 0', async () => {
    await setup();
    selectVendorAndApply();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    const suppressedRow = rows[1].textContent ?? '';

    expect(suppressedRow).toContain('POSITIVITY.AUDIT.NO_RESPONSE');
    expect(suppressedRow).not.toMatch(/\b0\b/);
  });

  it('renders an outcome key it does not recognise verbatim rather than dropping it', async () => {
    await setup({
      ...pageFixture,
      items: [{ ...successExchange, outcome: 'SOME_NEW_CLASSIFICATION' }],
    });
    selectVendorAndApply();

    expect(component.isKnownOutcome('SOME_NEW_CLASSIFICATION')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'SOME_NEW_CLASSIFICATION',
    );
  });

  it('gives each known outcome a distinct tone', async () => {
    await setup();

    expect(component.outcomeTone('SUCCESS')).toBe('success');
    expect(component.outcomeTone('FAILURE')).toBe('danger');
    expect(component.outcomeTone('TIMEOUT')).toBe('warning');
    expect(component.outcomeTone('REJECTED')).toBe('warning');
    expect(component.outcomeTone('CIRCUIT_OPEN')).toBe('danger');
    expect(component.outcomeTone('ANYTHING_ELSE')).toBe('neutral');
  });

  it('renders the outcome as a text chip, not colour alone', async () => {
    await setup();
    selectVendorAndApply();
    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.supplier-chip__label'),
    ).map(n => n.textContent?.trim());

    expect(chips).toContain('POSITIVITY.AUDIT.OUTCOME.SUCCESS');
    expect(chips).toContain('POSITIVITY.AUDIT.OUTCOME.CIRCUIT_OPEN');
  });

  it('falls back to the exchange’s own alias snapshot for an unknown vendor', async () => {
    await setup({
      ...pageFixture,
      items: [{ ...successExchange, vendorProfileId: 'deleted-profile' }],
    });
    selectVendorAndApply();

    // History outlives configuration: the profile may no longer exist.
    expect(component.vendorLabel(component.exchanges()[0])).toBe('michelin-eu');
  });

  // ── Errors and read-only posture ──────────────────────────────────────────

  it('reports empty when nothing matches', async () => {
    await setup({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 });
    selectVendorAndApply();

    expect(component.state()).toBe('empty');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));
    selectVendorAndApply();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without exchange data on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));
    selectVendorAndApply();

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  it('offers no retry or replay action on audit rows', async () => {
    await setup();
    selectVendorAndApply();
    const host = fixture.nativeElement as HTMLElement;
    const labels = Array.from(host.querySelectorAll('tbody button'));

    expect(labels).toHaveLength(0);
    expect(host.textContent).toContain('POSITIVITY.AUDIT.READ_ONLY_NOTICE');
  });

  it('links each row to its detail route with routerLink (ADR-0037)', async () => {
    await setup();
    selectVendorAndApply();
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.audit-page__link'),
    );

    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/app/positivity/exchanges/exch-1');
  });

  it('labels every filter control (ADR-0029)', async () => {
    await setup();
    const host = fixture.nativeElement as HTMLElement;

    for (const control of Array.from(host.querySelectorAll('form input, form select'))) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(host.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });
});
