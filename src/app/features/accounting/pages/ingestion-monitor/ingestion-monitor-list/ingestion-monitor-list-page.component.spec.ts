import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import enUS from '../../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../../assets/i18n/qps-ploc.json';
import {
  AccountingEventListItem,
  IngestionProcessingStatus,
  PagedResponse,
} from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';
import { IngestionMonitorListPageComponent } from './ingestion-monitor-list-page.component';

/* --- Typed fixtures (ADR-0032) --------------------------------------------- */
const adjustmentRow: AccountingEventListItem = {
  eventId: '0199a0c0-0000-7000-8000-000000000494',
  eventReference: 'AE-202609-494',
  eventType: 'inventory.adjustment.posted',
  processingStatus: IngestionProcessingStatus.Skipped,
  receivedAt: '2026-09-29T15:13:00Z',
};

function pageOf(totalElements: number, totalPages: number): PagedResponse<AccountingEventListItem> {
  return { items: [adjustmentRow], content: [adjustmentRow], totalCount: totalElements, totalPages };
}

describe('IngestionMonitorListPageComponent', () => {
  let fixture: ComponentFixture<IngestionMonitorListPageComponent>;
  let component: IngestionMonitorListPageComponent;
  const queryParamMap$ = new BehaviorSubject(
    convertToParamMap({ eventType: 'InvoiceIssued' }),
  );

  const accountingServiceStub = {
    listEvents: vi.fn().mockReturnValue(
      of({
        items: [],
        totalCount: 0,
      }),
    ),
  };

  beforeEach(async () => {
    accountingServiceStub.listEvents.mockClear();
    await TestBed.configureTestingModule({
      imports: [IngestionMonitorListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IngestionMonitorListPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const loading = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(loading).toBeTruthy();
  });

  it('renders event rows when service returns data', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      of({
        items: [
          {
            eventId: '123e4567-e89b-12d3-a456-426614174000',
            eventReference: 'AE-202609-15',
            eventType: 'InvoiceIssued',
            processingStatus: 'PROCESSED',
          },
        ],
        totalCount: 1,
      }),
    );

    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="event-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('AE-202609-15');
    expect(rows[0].textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('renders unavailable instead of the UUID when the event reference is missing', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      of({
        items: [{
          eventId: '123e4567-e89b-12d3-a456-426614174000',
          eventType: 'InvoiceIssued',
          processingStatus: 'PROCESSED',
        }],
        totalCount: 1,
      }),
    );

    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-testid="event-row"]');
    expect(row.textContent).toContain('COMMON.NOT_AVAILABLE');
    expect(row.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('renders error state when service errors', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );

    fixture.detectChanges();
    const error = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(error).toBeTruthy();
  });

  it('pre-fills eventType filter from query param', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.filters().eventType).toBe('InvoiceIssued');
    const input = fixture.nativeElement.querySelector('[data-testid="event-type-filter"]');
    expect(input.value).toBe('InvoiceIssued');
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    expect(component.pageState()).toBe('forbidden');
  });

  it('renders not-found state when service errors with 404', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(
      throwError(() => ({ status: 404 })),
    );
    fixture.detectChanges();
    expect(component.pageState()).toBe('not-found');
  });

  it('goToDetail(row) navigates to the event detail page', () => {
    accountingServiceStub.listEvents.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.goToDetail({ eventId: 'e-99', eventType: 'InvoiceIssued', processingStatus: IngestionProcessingStatus.Processed });
    expect(spy).toHaveBeenCalledWith(['/app/accounting/events', 'e-99']);
  });

  describe('filters', () => {
    afterEach(() => {
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued' }));
    });

    it('leaves the event type input editable', () => {
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="event-type-filter"]');
      expect(input.readOnly).toBe(false);
    });

    it('sends the URL event type and status to the list read', () => {
      queryParamMap$.next(convertToParamMap({ eventType: ' inventory.adjustment.posted ', processingStatus: 'skipped' }));
      fixture.detectChanges();
      expect(accountingServiceStub.listEvents).toHaveBeenLastCalledWith(
        { eventType: 'inventory.adjustment.posted', processingStatus: IngestionProcessingStatus.Skipped },
        0,
        20,
      );
      expect(component.statusInput()).toBe('SKIPPED');
    });

    it('pre-fills the status select from the URL', async () => {
      queryParamMap$.next(convertToParamMap({ processingStatus: 'FAILED' }));
      fixture.detectChanges();
      await fixture.whenStable();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('[data-testid="status-filter"]');
      expect(select.value).toBe('FAILED');
    });

    for (const raw of ['FAILED,QUARANTINED', 'QUARANTINED', 'REJECTED', 'bogus']) {
      it(`drops a status the list endpoint cannot filter on (${raw}) instead of showing a filter it ignores`, () => {
        queryParamMap$.next(convertToParamMap({ processingStatus: raw }));
        fixture.detectChanges();
        expect(component.filters().processingStatus).toBeUndefined();
        expect(accountingServiceStub.listEvents).toHaveBeenLastCalledWith(
          { eventType: undefined, processingStatus: undefined },
          0,
          20,
        );
      });
    }

    it('offers only the statuses the backend filters on', () => {
      fixture.detectChanges();
      const options = Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="status-filter"] option') as NodeListOf<HTMLOptionElement>,
      ).map(option => option.value);
      expect(options).toEqual(['', 'RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SUSPENDED', 'SKIPPED']);
    });

    it('applies the drafted filters to the URL, trimmed, back on the first page', () => {
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.eventTypeInput.set('  inventory.adjustment.posted ');
      component.statusInput.set('FAILED');

      component.applyFilters();

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { eventType: 'inventory.adjustment.posted', processingStatus: 'FAILED', page: null },
        queryParamsHandling: 'merge',
      }));
    });

    it('submits the filter form on Enter', () => {
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.eventTypeInput.set('InvoiceIssued');
      const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="filter-form"]');

      form.dispatchEvent(new Event('submit'));

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { eventType: 'InvoiceIssued', processingStatus: null, page: null },
      }));
    });

    it('removes a blank event type from the URL rather than filtering on an empty string', () => {
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.eventTypeInput.set('   ');
      component.statusInput.set('');

      component.applyFilters();

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { eventType: null, processingStatus: null, page: null },
      }));
    });

    it('clears the drafts and the URL filters', () => {
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', processingStatus: 'FAILED', page: '2' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('[data-testid="clear-filters"]').click();

      expect(component.eventTypeInput()).toBe('');
      expect(component.statusInput()).toBe('');
      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { eventType: null, processingStatus: null, page: null },
        queryParamsHandling: 'merge',
      }));
    });
  });

  describe('pagination', () => {
    afterEach(() => {
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued' }));
    });

    it('shows a single page as page 1 of 1 with both buttons refused', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(1, 1)));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="previous-page"]').getAttribute('aria-disabled')).toBe('true');
      expect(fixture.nativeElement.querySelector('[data-testid="next-page"]').getAttribute('aria-disabled')).toBe('true');
    });

    it('shows no pager before the first read answers', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(new Subject());
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).toBeNull();
    });

    const shrunkResults: [string, PagedResponse<AccountingEventListItem>][] = [
      ['an empty result', { items: [], totalCount: 0, totalPages: 0 }],
      ['a single page', { items: [adjustmentRow], totalCount: 15, totalPages: 1 }],
    ];
    for (const [label, shrunk] of shrunkResults) {
      it(`keeps the pager, and the focus on Next, when the next page comes back as ${label}`, () => {
        const router = TestBed.inject(Router);
        const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
        fixture.detectChanges();
        const next: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="next-page"]');
        next.focus();

        const nextPage = new Subject<PagedResponse<AccountingEventListItem>>();
        accountingServiceStub.listEvents.mockReturnValueOnce(nextPage);
        queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', page: '1' }));
        fixture.detectChanges();
        nextPage.next(shrunk);
        fixture.detectChanges();

        expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: null }, replaceUrl: true }));
        expect(fixture.nativeElement.querySelector('[data-testid="next-page"]')).toBe(next);
        expect(document.activeElement).toBe(next);

        const corrected = new Subject<PagedResponse<AccountingEventListItem>>();
        accountingServiceStub.listEvents.mockReturnValueOnce(corrected);
        queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued' }));
        fixture.detectChanges();
        expect(document.activeElement).toBe(next);
        corrected.next(shrunk);
        fixture.detectChanges();

        expect(component.pageState()).toBe('ready');
        expect(fixture.nativeElement.querySelector('[data-testid="next-page"]')).toBe(next);
        expect(document.activeElement).toBe(next);
        expect(next.getAttribute('aria-disabled')).toBe('true');
      });
    }

    it('moves to the next page through the URL', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('[data-testid="next-page"]').click();

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { page: 1 },
        queryParamsHandling: 'merge',
      }));
    });

    it('refuses Previous on the first page and Next on the last', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const previous: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="previous-page"]');
      expect(previous.getAttribute('aria-disabled')).toBe('true');
      previous.click();
      expect(spy).not.toHaveBeenCalled();

      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', page: '2' }));
      fixture.detectChanges();
      const next: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="next-page"]');
      expect(next.getAttribute('aria-disabled')).toBe('true');
      next.click();
      expect(spy).not.toHaveBeenCalled();
    });

    it('drops the page param when going back to the first page', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      queryParamMap$.next(convertToParamMap({ page: '1' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.nativeElement.querySelector('[data-testid="previous-page"]').click();

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: null } }));
    });

    it('keeps the pager, and the focus on it, while the next page loads', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      const pending = new Subject<PagedResponse<AccountingEventListItem>>();
      accountingServiceStub.listEvents.mockReturnValueOnce(pending);
      const next: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="next-page"]');
      next.focus();

      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', page: '1' }));
      fixture.detectChanges();

      expect(component.pageState()).toBe('loading');
      expect(fixture.nativeElement.querySelector('[data-testid="next-page"]')).toBe(next);
      expect(document.activeElement).toBe(next);
      expect(next.getAttribute('aria-disabled')).toBe('true');
    });

    it('keeps the pager, and the focus on it, when the next page fails to load', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      const pending = new Subject<PagedResponse<AccountingEventListItem>>();
      accountingServiceStub.listEvents.mockReturnValueOnce(pending);
      const next: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="next-page"]');
      next.focus();

      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', page: '1' }));
      fixture.detectChanges();
      pending.error({ status: 500 });
      fixture.detectChanges();

      expect(component.pageState()).toBe('error');
      expect(fixture.nativeElement.querySelector('[data-testid="error-state"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="next-page"]')).toBe(next);
      expect(document.activeElement).toBe(next);
      expect(next.getAttribute('aria-disabled')).toBeNull();
    });

    it('redirects a deep link past the last page to the last page, replacing the URL', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      accountingServiceStub.listEvents.mockReturnValueOnce(of({ items: [], totalCount: 45, totalPages: 3 }));
      queryParamMap$.next(convertToParamMap({ page: '999' }));

      fixture.detectChanges();

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { page: 2 },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }));
      expect(component.pageState()).toBe('loading');
      expect(component.page()).toBe(2);
      expect(fixture.nativeElement.querySelector('[data-testid="event-row"]')).toBeNull();
    });

    it('redirects a page past the end of an empty result to the first page', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      accountingServiceStub.listEvents.mockReturnValueOnce(of({ items: [], totalCount: 0, totalPages: 0 }));
      queryParamMap$.next(convertToParamMap({ page: '4' }));

      fixture.detectChanges();

      expect(spy).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { page: null }, replaceUrl: true }));
    });

    it('does not redirect the first page of an empty result', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      accountingServiceStub.listEvents.mockReturnValueOnce(of({ items: [], totalCount: 0, totalPages: 0 }));

      fixture.detectChanges();

      expect(spy).not.toHaveBeenCalled();
      expect(component.pageState()).toBe('ready');
    });

    it('claims no totals and refuses Next when a filter change fails, rather than keep the old scope\'s', () => {
      const router = TestBed.inject(Router);
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      const status: HTMLElement = fixture.nativeElement.querySelector('[data-testid="pagination-status"]');
      expect(status.textContent?.trim()).not.toBe('');

      const filtered = new Subject<PagedResponse<AccountingEventListItem>>();
      accountingServiceStub.listEvents.mockReturnValueOnce(filtered);
      queryParamMap$.next(convertToParamMap({ eventType: 'inventory.adjustment.posted' }));
      fixture.detectChanges();
      expect(status.textContent?.trim()).toBe('');

      filtered.error({ status: 500 });
      fixture.detectChanges();
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      expect(component.pageState()).toBe('error');
      expect(fixture.nativeElement.querySelector('[data-testid="pagination-status"]')).toBe(status);
      expect(status.textContent?.trim()).toBe('');
      const next: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="next-page"]');
      expect(next.getAttribute('aria-disabled')).toBe('true');
      next.click();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('shows the new scope\'s totals once its read answers', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(5, 1)));
      queryParamMap$.next(convertToParamMap({ processingStatus: 'FAILED' }));
      fixture.detectChanges();

      expect(component.hasCurrentTotals()).toBe(true);
      expect(component.totalPages()).toBe(1);
      expect(fixture.nativeElement.querySelector('[data-testid="next-page"]').getAttribute('aria-disabled')).toBe('true');
    });

    it('claims no page while a URL page past the known end loads', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      accountingServiceStub.listEvents.mockReturnValueOnce(new Subject());
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', page: '9' }));
      fixture.detectChanges();

      expect(component.pageState()).toBe('loading');
      expect(fixture.nativeElement.querySelector('[data-testid="pagination-status"]').textContent.trim()).toBe('');
    });

    it('ignores a superseded page that lands after the current one', () => {
      const first = new Subject<PagedResponse<AccountingEventListItem>>();
      const second = new Subject<PagedResponse<AccountingEventListItem>>();
      accountingServiceStub.listEvents.mockReturnValueOnce(first).mockReturnValueOnce(second);
      fixture.detectChanges();
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued', page: '1' }));

      second.next({ items: [], totalCount: 21, totalPages: 2 });
      first.next(pageOf(45, 3));

      expect(component.events()).toEqual([]);
      expect(component.totalPages()).toBe(2);
    });
  });

  describe('status option copy (every shipped locale bundle)', () => {
    const bundles: [string, TranslationObject][] = [
      ['en-US', enUS as TranslationObject],
      ['es-US', esUS as TranslationObject],
      ['es-MX', esMX as TranslationObject],
      ['fr-CA', frCA as TranslationObject],
      ['fr-FR', frFR as TranslationObject],
      ['qps-ploc', qpsPloc as TranslationObject],
    ];
    const statusLabels = (bundle: TranslationObject): Record<string, string> =>
      ((bundle['ACCOUNTING'] as TranslationObject)['INGESTION_MONITOR_LIST'] as TranslationObject)['STATUS'] as Record<
        string,
        string
      >;
    const english = statusLabels(enUS as TranslationObject);

    for (const [locale, bundle] of bundles) {
      it(`renders the ${locale} label for every status option`, () => {
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation(locale, bundle);
        translate.use(locale);
        fixture.detectChanges();

        const labels = statusLabels(bundle);
        const options = Array.from(
          fixture.nativeElement.querySelectorAll('[data-testid="status-filter"] option') as NodeListOf<HTMLOptionElement>,
        ).slice(1);
        expect(options.length).toBe(6);
        for (const option of options) {
          expect(option.textContent?.trim()).toBe(labels[option.value]);
          if (locale !== 'en-US') {
            expect(labels[option.value]).not.toBe(english[option.value]);
          }
        }
      });
    }
  });

  describe('copy (real en-US bundle)', () => {
    beforeEach(() => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
    });

    const list = (enUS as TranslationObject)['ACCOUNTING'] as TranslationObject;
    const copy = list['INGESTION_MONITOR_LIST'] as TranslationObject;
    const statusCopy = copy['STATUS'] as Record<string, string>;
    const pageStatus = (page: number, totalPages: number, totalElements: number): string =>
      ((copy['PAGINATION'] as Record<string, string>)['STATUS'])
        .replace('{{page}}', String(page))
        .replace('{{totalPages}}', String(totalPages))
        .replace('{{totalElements}}', String(totalElements));

    it('renders every status option and row badge as text, never a raw key', () => {
      accountingServiceStub.listEvents.mockReturnValueOnce(of(pageOf(45, 3)));
      fixture.detectChanges();
      const text: string = fixture.nativeElement.textContent;
      expect(text).not.toContain('ACCOUNTING.INGESTION_MONITOR_LIST');
      const options = Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="status-filter"] option') as NodeListOf<HTMLOptionElement>,
      ).map(option => option.textContent?.trim());
      expect(options).toEqual([
        copy['FILTER_STATUS_ALL'],
        ...['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SUSPENDED', 'SKIPPED'].map(status => statusCopy[status]),
      ]);
      expect(fixture.nativeElement.querySelector('[data-testid="event-row"] .status-badge').textContent.trim())
        .toBe(statusCopy['SKIPPED']);
      expect(fixture.nativeElement.querySelector('[data-testid="pagination-status"]').textContent.trim())
        .toBe(pageStatus(1, 3, 45));
    });

    it('announces the corrected page, never the out-of-range one, while a deep link is corrected', () => {
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      accountingServiceStub.listEvents.mockReturnValueOnce(of({ items: [], totalCount: 45, totalPages: 3 }));
      queryParamMap$.next(convertToParamMap({ page: '999' }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="pagination-status"]').textContent.trim())
        .toBe(pageStatus(3, 3, 45));
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued' }));
    });
  });

  describe('query param sanitization', () => {
    afterEach(() => {
      queryParamMap$.next(convertToParamMap({ eventType: 'InvoiceIssued' }));
    });

    it('should default page to 0 for NaN input', () => {
      queryParamMap$.next(convertToParamMap({ page: 'abc' }));
      fixture.detectChanges();
      expect(component.page()).toBe(0);
    });

    it('should default size to 20 for NaN input', () => {
      queryParamMap$.next(convertToParamMap({ size: 'xyz' }));
      fixture.detectChanges();
      expect(component.size()).toBe(20);
    });

    it('should cap size to 100', () => {
      queryParamMap$.next(convertToParamMap({ size: '999' }));
      fixture.detectChanges();
      expect(component.size()).toBe(100);
    });

    it('should clamp negative page to 0', () => {
      queryParamMap$.next(convertToParamMap({ page: '-5' }));
      fixture.detectChanges();
      expect(component.page()).toBe(0);
    });
  });
});
