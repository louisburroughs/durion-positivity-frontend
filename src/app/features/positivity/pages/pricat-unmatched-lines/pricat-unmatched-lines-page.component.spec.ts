import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricatUnmatchedLinesPageComponent } from './pricat-unmatched-lines-page.component';
import { SupplierPricatService } from '../../services/supplier-pricat.service';
import {
  PricatUnmatchedLine,
  PricatUnmatchedPage,
} from '../../models/supplier-pricat.models';

const PROFILE_ID = 'profile-1';

const lineA: PricatUnmatchedLine = {
  unmatchedLineId: 'ul-1',
  vendorProfileId: PROFILE_ID,
  ean: '3528700123456',
  gtin: null,
  manufacturerPartNumber: 'MX-2255',
  description: 'Pilot Sport 4 225/55R17',
  reason: 'NO_EAN_MATCH',
  firstSeenAt: '2026-08-01T03:04:00Z',
  lastSeenAt: '2026-08-12T03:04:00Z',
  occurrences: 12,
};

const lineB: PricatUnmatchedLine = {
  unmatchedLineId: 'ul-2',
  vendorProfileId: PROFILE_ID,
  ean: null,
  gtin: '00012345600012',
  manufacturerPartNumber: null,
  description: '=SUM(A1:A9)',
  reason: 'MISSING_IDENTIFIERS',
  firstSeenAt: '2026-08-05T03:04:00Z',
  lastSeenAt: '2026-08-12T03:04:00Z',
  occurrences: 3,
};

const pageFixture: PricatUnmatchedPage = {
  items: [lineA, lineB],
  totalCount: 2,
  nextPageToken: null,
};

describe('PricatUnmatchedLinesPageComponent', () => {
  let fixture: ComponentFixture<PricatUnmatchedLinesPageComponent>;
  let component: PricatUnmatchedLinesPageComponent;
  let service: { listUnmatchedLines: ReturnType<typeof vi.fn> };

  async function setup(
    result: PricatUnmatchedPage | HttpErrorResponse = pageFixture,
  ): Promise<void> {
    service = {
      listUnmatchedLines: vi
        .fn()
        .mockReturnValue(
          result instanceof HttpErrorResponse ? throwError(() => result) : of(result),
        ),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PricatUnmatchedLinesPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierPricatService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap({ vendorProfileId: PROFILE_ID })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PricatUnmatchedLinesPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the worklist for the profile in the route', async () => {
    await setup();

    expect(service.listUnmatchedLines).toHaveBeenCalledWith(PROFILE_ID, {
      reason: undefined,
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(component.state()).toBe('ready');
    expect(component.totalCount()).toBe(2);
  });

  it('reports empty when nothing is unmatched', async () => {
    await setup({ items: [], totalCount: 0, nextPageToken: null });

    expect(component.state()).toBe('empty');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without worklist data on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  // ── Worklist semantics ─────────────────────────────────────────────────────

  it('offers no dismissal control — rows clear only when the backend matches them', async () => {
    await setup();
    const host = fixture.nativeElement as HTMLElement;
    const labels = Array.from(host.querySelectorAll('button')).map(b =>
      (b.textContent ?? '').toUpperCase(),
    );

    expect(labels.some(l => l.includes('DISMISS'))).toBe(false);
    expect(labels.some(l => l.includes('IGNORE'))).toBe(false);
    expect(labels.some(l => l.includes('RESOLVE'))).toBe(false);
    expect(host.textContent).toContain('POSITIVITY.UNMATCHED.WORKLIST_NOTICE');
  });

  it('exposes no method that could remove a row locally', () => {
    const methods = Object.getOwnPropertyNames(PricatUnmatchedLinesPageComponent.prototype);

    expect(methods.some(name => /dismiss|ignore|resolve|remove|delete/i.test(name))).toBe(false);
  });

  // ── Table content ──────────────────────────────────────────────────────────

  it('renders vendor line identity, reason and first/last seen for each row', async () => {
    await setup();
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
    const text = row?.textContent ?? '';

    expect(text).toContain('3528700123456');
    expect(text).toContain('MX-2255');
    expect(text).toContain('Pilot Sport 4 225/55R17');
    expect(text).toContain('POSITIVITY.UNMATCHED.REASON.NO_EAN_MATCH');
    expect(text).toContain('12');
  });

  // ── Filtering ──────────────────────────────────────────────────────────────

  it('forwards the reason, search and date-only bounds to the API verbatim', async () => {
    await setup();
    component.filterForm.patchValue({
      reason: 'NO_EAN_MATCH',
      search: '  MX-2255  ',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
    component.applyFilter();

    expect(service.listUnmatchedLines).toHaveBeenLastCalledWith(PROFILE_ID, {
      reason: 'NO_EAN_MATCH',
      search: 'MX-2255',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
  });

  it('clears the filters and reloads', async () => {
    await setup();
    component.filterForm.patchValue({ reason: 'NO_EAN_MATCH' });
    component.clearFilter();

    expect(component.filterForm.getRawValue().reason).toBe('');
    expect(service.listUnmatchedLines).toHaveBeenLastCalledWith(PROFILE_ID, {
      reason: undefined,
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  // ── CSV export ─────────────────────────────────────────────────────────────

  it('builds a CSV with one header row and one row per displayed line', async () => {
    await setup();
    const rows = component.buildCsv().trimEnd().split('\r\n');

    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain('"3528700123456"');
    expect(rows[2]).toContain('"00012345600012"');
  });

  it('emits one CSV header per exported column', async () => {
    await setup();

    expect(component.csvHeaderKeys).toHaveLength(component.csvColumnCount);
    const headerCells = component.buildCsv().split('\r\n')[0].split(',');
    expect(headerCells).toHaveLength(component.csvColumnCount);
  });

  it('neutralises formula-looking vendor text in the export', async () => {
    await setup();
    const csv = component.buildCsv();

    expect(csv).toContain('"\'=SUM(A1:A9)"');
  });

  it('disables the export when there is nothing to export', async () => {
    await setup({ items: [], totalCount: 0, nextPageToken: null });

    expect(component.canExport()).toBe(false);
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find(b => (b.textContent ?? '').includes('EXPORT_CSV'));
    expect((button as HTMLButtonElement | undefined)?.disabled).toBe(true);
  });

  it('does not attempt a download when there are no rows', async () => {
    await setup({ items: [], totalCount: 0, nextPageToken: null });
    const createSpy = vi.spyOn(document, 'createElement');
    component.exportCsv();

    expect(createSpy).not.toHaveBeenCalledWith('a');
    createSpy.mockRestore();
  });

  // ── Navigation + a11y ──────────────────────────────────────────────────────

  it('links back to the profile with routerLink (ADR-0037)', async () => {
    await setup();
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.unmatched-page__breadcrumb a'),
    ).map(a => a.getAttribute('href'));

    expect(links).toContain('/app/positivity');
    expect(links).toContain(`/app/positivity/profiles/${PROFILE_ID}`);
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

  it('gives the table a caption and column-scoped headers', async () => {
    await setup();
    const table = (fixture.nativeElement as HTMLElement).querySelector('table');

    expect(table?.querySelector('caption')).not.toBeNull();
    const headers = Array.from(table?.querySelectorAll('thead th') ?? []);
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every(h => h.getAttribute('scope') === 'col')).toBe(true);
  });
});
