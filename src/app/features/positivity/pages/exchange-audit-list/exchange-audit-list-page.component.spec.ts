import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExchangeAuditListPageComponent } from './exchange-audit-list-page.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  ExchangeAuditPage,
  ExchangeAuditRecord,
} from '../../models/supplier-exchange.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const profileSummary: VendorProfileSummary = {
  vendorProfileId: 'profile-1',
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

const successExchange: ExchangeAuditRecord = {
  exchangeId: 'exch-1',
  vendorProfileId: 'profile-1',
  vendorDisplayName: 'Michelin EU',
  capability: 'ORDER',
  protocolFamily: 'EDIWHEEL_C1',
  protocolVersion: 'C1_1',
  outcome: 'SUCCESS',
  httpStatus: 200,
  durationMs: 412,
  correlationId: 'corr-1',
  captureLevel: 'REDACTED',
  startedAt: '2026-08-12T09:00:00Z',
  finishedAt: '2026-08-12T09:00:01Z',
};

const failedExchange: ExchangeAuditRecord = {
  ...successExchange,
  exchangeId: 'exch-2',
  outcome: 'CIRCUIT_OPEN',
  httpStatus: null,
  correlationId: 'corr-2',
};

const pageFixture: ExchangeAuditPage = {
  items: [successExchange, failedExchange],
  totalCount: 2,
  nextPageToken: null,
};

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

  beforeEach(() => vi.clearAllMocks());

  it('loads exchanges and the vendor list for the filter', async () => {
    await setup();

    expect(audit.listExchanges).toHaveBeenCalled();
    expect(profiles.listProfiles).toHaveBeenCalled();
    expect(component.state()).toBe('ready');
    expect(component.totalCount()).toBe(2);
  });

  it('reports empty when nothing matches', async () => {
    await setup({ items: [], totalCount: 0, nextPageToken: null });

    expect(component.state()).toBe('empty');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without exchange data on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  it('filters by vendor, capability, outcome and date-only bounds', async () => {
    await setup();
    component.filterForm.patchValue({
      vendorProfileId: 'profile-1',
      capability: 'ORDER',
      outcome: 'FAILURE',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
    component.applyFilter();

    expect(audit.listExchanges).toHaveBeenLastCalledWith({
      vendorProfileId: 'profile-1',
      capability: 'ORDER',
      outcome: 'FAILURE',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
  });

  it('clears the filters and reloads', async () => {
    await setup();
    component.filterForm.patchValue({ outcome: 'FAILURE' });
    component.clearFilter();

    expect(component.filterForm.getRawValue().outcome).toBe('');
    expect(audit.listExchanges).toHaveBeenLastCalledWith({
      vendorProfileId: undefined,
      capability: undefined,
      outcome: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('gives each outcome a distinct tone', async () => {
    await setup();

    expect(component.outcomeTone('SUCCESS')).toBe('success');
    expect(component.outcomeTone('FAILURE')).toBe('danger');
    expect(component.outcomeTone('TIMEOUT')).toBe('warning');
    expect(component.outcomeTone('REJECTED')).toBe('warning');
    expect(component.outcomeTone('CIRCUIT_OPEN')).toBe('danger');
  });

  it('renders the outcome as a text chip, not colour alone', async () => {
    await setup();
    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.supplier-chip__label'),
    ).map(n => n.textContent?.trim());

    expect(chips).toContain('POSITIVITY.AUDIT.OUTCOME.SUCCESS');
    expect(chips).toContain('POSITIVITY.AUDIT.OUTCOME.CIRCUIT_OPEN');
  });

  it('offers no retry or replay action on audit rows', async () => {
    await setup();
    const host = fixture.nativeElement as HTMLElement;
    const labels = Array.from(host.querySelectorAll('tbody button')).map(b =>
      (b.textContent ?? '').toUpperCase(),
    );

    expect(labels).toHaveLength(0);
    expect(host.textContent).toContain('POSITIVITY.AUDIT.READ_ONLY_NOTICE');
  });

  it('links each row to its detail route with routerLink (ADR-0037)', async () => {
    await setup();
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
