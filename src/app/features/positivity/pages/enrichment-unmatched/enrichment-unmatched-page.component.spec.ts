/**
 * Unmatched manufacturer-enrichment worklist (issue #195).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrichmentUnmatchedPageComponent } from './enrichment-unmatched-page.component';
import { SupplierEnrichmentService } from '../../services/supplier-enrichment.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { LocaleService } from '../../../../core/services/locale.service';
import {
  SupplierUnmatchedEnrichment,
  SupplierUnmatchedEnrichmentPage,
} from '../../models/supplier-enrichment.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const rows: SupplierUnmatchedEnrichment[] = [
  {
    unmatchedEnrichmentId: 'ue-1',
    vendorProfileId: 'vp-1',
    vendorDisplayName: 'Michelin EU',
    manufacturerName: 'Michelin',
    ean: '3528700123456',
    gtin: null,
    manufacturerPartNumber: 'MX-2255',
    descriptionPreview: [
      { locale: 'en-US', value: 'Pilot Sport 4 225/55R17' },
      { locale: 'fr-FR', value: 'Pilot Sport 4 225/55R17 — sport' },
    ],
    imageCount: 3,
    reason: 'NO_EAN_MATCH',
    firstSeenAt: '2026-08-01T03:04:00Z',
    lastSeenAt: '2026-08-12T03:04:00Z',
    occurrences: 7,
  },
];

const page: SupplierUnmatchedEnrichmentPage = {
  items: rows,
  totalCount: 1,
  nextPageToken: null,
};

const profiles: VendorProfileSummary[] = [
  {
    vendorProfileId: 'vp-1',
    supplierRef: 'michelin-eu',
    displayName: 'Michelin EU',
    enabled: true,
    sandbox: false,
    sourceOfTruth: 'ADMIN',
  },
];

describe('EnrichmentUnmatchedPageComponent', () => {
  let fixture: ComponentFixture<EnrichmentUnmatchedPageComponent>;

  const enrichmentService = { listUnmatchedEnrichment: vi.fn(), getProductEnrichment: vi.fn() };
  const profileService = { listProfiles: vi.fn() };
  const currentLocale = signal<string>('en-US');
  const localeService = { currentLocale };

  beforeEach(async () => {
    currentLocale.set('en-US');
    enrichmentService.listUnmatchedEnrichment.mockReturnValue(of(page));
    profileService.listProfiles.mockReturnValue(of(profiles));

    await TestBed.configureTestingModule({
      imports: [EnrichmentUnmatchedPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierEnrichmentService, useValue: enrichmentService },
        { provide: SupplierProfileService, useValue: profileService },
        { provide: LocaleService, useValue: localeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EnrichmentUnmatchedPageComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists vendor identity, preview and first/last seen for each unmatched record', () => {
    const el = render();

    expect(fixture.componentInstance.state()).toBe('ready');
    const cells = Array.from(el.querySelectorAll('tbody tr:first-child td, tbody tr:first-child th')).map(
      n => n.textContent?.trim(),
    );

    expect(cells[0]).toBe('3528700123456');
    expect(cells[2]).toBe('MX-2255');
    expect(cells[3]).toBe('Michelin');
    expect(cells[4]).toBe('Michelin EU');
    expect(cells[5]).toBe('Pilot Sport 4 225/55R17');
    expect(cells[6]).toBe('3');
    expect(cells[7]).toBe('POSITIVITY.ENRICHMENT.UNMATCHED.REASON.NO_EAN_MATCH');
    expect(cells[10]).toBe('7');
  });

  it('resolves the preview in the user locale, not through ngx-translate', () => {
    currentLocale.set('fr-CA');
    render();

    expect(fixture.componentInstance.previewFor(rows[0])).toBe(
      'Pilot Sport 4 225/55R17 — sport',
    );
  });

  it('shows a translated placeholder when a row has no usable preview', () => {
    const noPreview: SupplierUnmatchedEnrichment = { ...rows[0], descriptionPreview: [] };
    enrichmentService.listUnmatchedEnrichment.mockReturnValue(
      of({ items: [noPreview], totalCount: 1, nextPageToken: null }),
    );
    const el = render();

    expect(fixture.componentInstance.previewFor(noPreview)).toBeNull();
    expect(el.querySelector('.enrich-unmatched__preview')?.textContent?.trim()).toBe(
      'POSITIVITY.ENRICHMENT.UNMATCHED.NO_PREVIEW',
    );
  });

  it('exposes reason, search and date filters and forwards them on apply', () => {
    render();
    fixture.componentInstance.filterForm.setValue({
      vendorProfileId: 'vp-1',
      reason: 'AMBIGUOUS_MATCH',
      search: '  MX-2255  ',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
    fixture.componentInstance.applyFilter();

    expect(enrichmentService.listUnmatchedEnrichment).toHaveBeenLastCalledWith({
      vendorProfileId: 'vp-1',
      reason: 'AMBIGUOUS_MATCH',
      search: 'MX-2255',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
  });

  it('passes date-only filter values through untouched (ADR-0038)', () => {
    render();
    fixture.componentInstance.filterForm.patchValue({ dateFrom: '2026-08-01' });
    fixture.componentInstance.applyFilter();

    const [filter] = enrichmentService.listUnmatchedEnrichment.mock.calls.at(-1) as [
      { dateFrom?: string },
    ];
    expect(filter.dateFrom).toBe('2026-08-01');
  });

  it('clears every filter and reloads', () => {
    render();
    fixture.componentInstance.filterForm.patchValue({ search: 'MX', reason: 'NO_MPN_MATCH' });
    fixture.componentInstance.clearFilter();

    expect(enrichmentService.listUnmatchedEnrichment).toHaveBeenLastCalledWith({
      vendorProfileId: undefined,
      reason: undefined,
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('offers a vendor filter built from the profile roster', () => {
    const el = render();
    const vendorSelect = el.querySelector('#enrich-unmatched-vendor');

    expect(fixture.componentInstance.vendorFilterAvailable()).toBe(true);
    expect(vendorSelect?.querySelectorAll('option')).toHaveLength(2);
  });

  it('still loads the worklist when the profile roster is unavailable', () => {
    profileService.listProfiles.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.vendorFilterAvailable()).toBe(false);
    expect(el.querySelector('#enrich-unmatched-vendor')).toBeNull();
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('associates a visible label with every filter control (ADR-0029)', () => {
    const el = render();
    const controls = Array.from(el.querySelectorAll('form select, form input'));

    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(el.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
    }
  });

  it('reports an empty worklist distinctly from an error', () => {
    enrichmentService.listUnmatchedEnrichment.mockReturnValue(
      of({ items: [], totalCount: 0, nextPageToken: null }),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(el.querySelector('.enrich-unmatched__empty')).not.toBeNull();
  });

  it('sets state then errorKey when the worklist read fails (ADR-0031)', () => {
    enrichmentService.listUnmatchedEnrichment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    enrichmentService.listUnmatchedEnrichment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  it('offers no dismiss, ignore or manual-match control — v1 is read-only', () => {
    const el = render();
    const actionLabels = Array.from(el.querySelectorAll('tbody button, tbody a')).map(n =>
      n.textContent?.trim(),
    );

    expect(actionLabels).toEqual([]);
    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.componentInstance),
    );
    expect(methodNames.some(name => /^(dismiss|resolve|ignore|match)/i.test(name))).toBe(false);
  });

  it('lists every unmatched reason the contract defines', () => {
    render();

    expect(fixture.componentInstance.reasons).toEqual([
      'NO_EAN_MATCH',
      'NO_GTIN_MATCH',
      'NO_MPN_MATCH',
      'AMBIGUOUS_MATCH',
      'MISSING_IDENTIFIERS',
    ]);
  });
});
