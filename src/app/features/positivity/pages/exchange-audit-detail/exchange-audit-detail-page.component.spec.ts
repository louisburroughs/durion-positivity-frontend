import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExchangeAuditDetailPageComponent } from './exchange-audit-detail-page.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import {
  ExchangeAuditPage,
  ExchangeAuditRecord,
  ExchangePayloadView,
} from '../../models/supplier-exchange.models';

const EXCHANGE_ID = 'exch-1';

const record: ExchangeAuditRecord = {
  exchangeAuditId: EXCHANGE_ID,
  vendorProfileId: 'profile-1',
  supplierRef: 'michelin-eu',
  bindingId: 'bind-1',
  capability: 'ORDER',
  protocolFamily: 'EDIWHEEL_C1',
  protocolVersion: 'C1_1',
  httpMethod: 'POST',
  endpointUri: 'https://edi.example.com/order?token=***',
  attempt: 1,
  correlationId: 'corr-1',
  outcome: 'SUCCESS',
  httpStatus: 200,
  startedAt: '2026-08-12T09:00:00Z',
  durationMs: 412,
  captureLevel: 'REDACTED',
  requestPayloadPresent: true,
  responsePayloadPresent: true,
  createdBy: 'operator@example.com',
};

const payload: ExchangePayloadView = {
  exchangeAuditId: EXCHANGE_ID,
  captureLevel: 'REDACTED',
  redacted: true,
  requestPayload: '<Order><BuyerParty>***</BuyerParty></Order>',
  responsePayload: '<OrderResponse/>',
};

const singleAttemptPage: ExchangeAuditPage = {
  items: [record],
  page: 0,
  size: 25,
  totalCount: 1,
  totalPages: 1,
};

describe('ExchangeAuditDetailPageComponent', () => {
  let fixture: ComponentFixture<ExchangeAuditDetailPageComponent>;
  let component: ExchangeAuditDetailPageComponent;
  let service: {
    getExchange: ReturnType<typeof vi.fn>;
    getExchangePayload: ReturnType<typeof vi.fn>;
    traceCorrelation: ReturnType<typeof vi.fn>;
  };

  async function setup(options?: {
    exchange?: ExchangeAuditRecord | HttpErrorResponse;
    payload?: ExchangePayloadView | HttpErrorResponse;
    attempts?: ExchangeAuditPage | HttpErrorResponse;
  }): Promise<void> {
    const exchangeResult = options?.exchange ?? record;
    const payloadResult = options?.payload ?? payload;
    const attemptsResult = options?.attempts ?? singleAttemptPage;

    const asObservable = (value: unknown) =>
      value instanceof HttpErrorResponse ? throwError(() => value) : of(value);

    service = {
      getExchange: vi.fn().mockReturnValue(asObservable(exchangeResult)),
      getExchangePayload: vi.fn().mockReturnValue(asObservable(payloadResult)),
      traceCorrelation: vi.fn().mockReturnValue(asObservable(attemptsResult)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ExchangeAuditDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierExchangeAuditService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap({ exchangeId: EXCHANGE_ID })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExchangeAuditDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the exchange metadata and its payload', async () => {
    await setup();

    expect(service.getExchange).toHaveBeenCalledWith(EXCHANGE_ID);
    expect(service.getExchangePayload).toHaveBeenCalledWith(EXCHANGE_ID);
    expect(component.state()).toBe('ready');
    expect(component.payloadState()).toBe('ready');
  });

  it('sets both state and errorKey when the metadata fails to load', async () => {
    await setup({ exchange: new HttpErrorResponse({ status: 500, statusText: 'x' }) });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state when metadata access itself is denied', async () => {
    await setup({ exchange: new HttpErrorResponse({ status: 403, statusText: 'x' }) });

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  // ── Retry sequence ────────────────────────────────────────────────────────

  it('traces the correlation to assemble the retry sequence', async () => {
    await setup();

    expect(service.traceCorrelation).toHaveBeenCalledWith('corr-1');
  });

  it('shows each attempt of a retried call, oldest first', async () => {
    const retried: ExchangeAuditPage = {
      ...singleAttemptPage,
      items: [
        { ...record, exchangeAuditId: 'a1', attempt: 1, outcome: 'TIMEOUT', httpStatus: null },
        { ...record, exchangeAuditId: 'a2', attempt: 2, outcome: 'FAILURE', httpStatus: 502 },
        { ...record, exchangeAuditId: EXCHANGE_ID, attempt: 3, outcome: 'SUCCESS' },
      ],
      totalCount: 3,
    };
    await setup({ attempts: retried });

    expect(component.hasRetrySequence()).toBe(true);
    expect(component.attempts().map(a => a.attempt)).toEqual([1, 2, 3]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.ATTEMPTS.HINT',
    );
  });

  it('says so plainly when the call was not retried', async () => {
    await setup();

    expect(component.hasRetrySequence()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.ATTEMPTS.SINGLE',
    );
  });

  it('links sibling attempts but not the one being viewed', async () => {
    const retried: ExchangeAuditPage = {
      ...singleAttemptPage,
      items: [
        { ...record, exchangeAuditId: 'a1', attempt: 1 },
        { ...record, exchangeAuditId: EXCHANGE_ID, attempt: 2 },
      ],
      totalCount: 2,
    };
    await setup({ attempts: retried });
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.exchange-detail__link'),
    );

    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/app/positivity/exchanges/a1');
  });

  it('keeps the page usable when the retry trace fails', async () => {
    await setup({ attempts: new HttpErrorResponse({ status: 500, statusText: 'x' }) });

    // The row itself loaded; losing the trace costs the sequence and nothing else.
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
    expect(component.attemptsFailed()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.ATTEMPTS.UNAVAILABLE',
    );
  });

  // ── Two-pane payload view ─────────────────────────────────────────────────

  it('renders request and response as two separate panes', async () => {
    await setup();
    const panes = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.exchange-detail__pane',
    );

    expect(panes).toHaveLength(2);
    expect(panes[0].textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.REQUEST');
    expect(panes[1].textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.RESPONSE');
  });

  it('renders payloads exactly as delivered and says they are not the wire documents', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('<Order><BuyerParty>***</BuyerParty></Order>');
    expect(text).toContain('POSITIVITY.AUDIT.PAYLOAD.REDACTION_NOTE');
  });

  it('omits the redaction warning when the documents were stored unaltered', async () => {
    await setup({ payload: { ...payload, captureLevel: 'FULL', redacted: false } });

    expect(component.payloadState()).toBe('ready');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'POSITIVITY.AUDIT.PAYLOAD.REDACTION_NOTE',
    );
  });

  // ── The four no-content states ────────────────────────────────────────────

  it('renders payload-restricted on 403, keeping the metadata on screen', async () => {
    await setup({ payload: new HttpErrorResponse({ status: 403, statusText: 'x' }) });

    expect(component.state()).toBe('ready');
    expect(component.payloadState()).toBe('payload-restricted');
    expect(component.payloadErrorKey()).toBe('POSITIVITY.AUDIT.PAYLOAD.RESTRICTED');
    expect(component.payload()).toBeNull();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.exchange-detail__pane')).toBeNull();
    expect(host.textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.RESTRICTED');
    // A payload denial is not a page failure.
    expect(host.textContent).toContain('corr-1');
  });

  it('leaks no payload content in the restricted state', async () => {
    await setup({ payload: new HttpErrorResponse({ status: 403, statusText: 'x' }) });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('<Order>');
    expect(text).not.toContain('OrderResponse');
  });

  it('distinguishes a genuine payload failure from a permission denial', async () => {
    await setup({ payload: new HttpErrorResponse({ status: 500, statusText: 'x' }) });

    expect(component.payloadState()).toBe('error');
    expect(component.payloadErrorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('reports metadata-only capture as its own state, not an error', async () => {
    await setup({
      payload: {
        exchangeAuditId: EXCHANGE_ID,
        captureLevel: 'METADATA_ONLY',
        redacted: false,
        requestPayload: null,
        responsePayload: null,
      },
    });

    expect(component.payloadState()).toBe('metadata-only');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.METADATA_ONLY');
    expect(host.querySelector('.pos-banner--error')).toBeNull();
  });

  it('reports a retention-purged payload as its own state', async () => {
    await setup({
      exchange: { ...record, payloadsPurgedAt: '2027-09-15T00:00:00Z' },
      payload: {
        exchangeAuditId: EXCHANGE_ID,
        captureLevel: 'REDACTED',
        redacted: true,
        requestPayload: null,
        responsePayload: null,
      },
    });

    expect(component.payloadState()).toBe('purged');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.PAYLOAD.PURGED',
    );
  });

  it('distinguishes "never captured" from "purged" when nothing was purged', async () => {
    await setup({
      exchange: { ...record, payloadsPurgedAt: null },
      payload: {
        exchangeAuditId: EXCHANGE_ID,
        captureLevel: 'FULL',
        redacted: false,
        requestPayload: null,
        responsePayload: null,
      },
    });

    expect(component.payloadState()).toBe('not-captured');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('POSITIVITY.AUDIT.PAYLOAD.NOT_CAPTURED');
    expect(text).not.toContain('POSITIVITY.AUDIT.PAYLOAD.PURGED');
  });

  it('renders a one-sided capture without claiming the whole payload is missing', async () => {
    await setup({
      payload: { ...payload, redacted: false, captureLevel: 'FULL', requestPayload: null },
    });

    expect(component.payloadState()).toBe('ready');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('POSITIVITY.AUDIT.PAYLOAD.NO_REQUEST_BODY');
    expect(text).toContain('<OrderResponse/>');
  });

  // ── Truthful rendering of degenerate values ───────────────────────────────

  it('renders a null HTTP status as "no response", never as 0', async () => {
    await setup({ exchange: { ...record, httpStatus: null, durationMs: null, outcome: 'TIMEOUT' } });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('POSITIVITY.AUDIT.NO_RESPONSE_DETAIL');
    expect(text).not.toMatch(/\b0\b/);
  });

  it('labels the endpoint as a path, not a URI, at METADATA_ONLY', async () => {
    await setup({
      exchange: { ...record, captureLevel: 'METADATA_ONLY', endpointUri: '/order' },
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(component.endpointIsPathOnly()).toBe(true);
    expect(text).toContain('POSITIVITY.AUDIT.ENDPOINT_PATH');
    expect(text).toContain('POSITIVITY.AUDIT.ENDPOINT_PATH_NOTE');
    expect(text).not.toContain('POSITIVITY.AUDIT.ENDPOINT_URI');
  });

  it('labels the endpoint as an address when the query string was retained', async () => {
    await setup();

    expect(component.endpointIsPathOnly()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.ENDPOINT_URI',
    );
  });

  it('marks the supplier alias as a point-in-time snapshot', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('michelin-eu');
    expect(text).toContain('POSITIVITY.AUDIT.SUPPLIER_REF_SNAPSHOT');
  });

  it('quotes the vendor failure detail as data when there is one', async () => {
    await setup({ exchange: { ...record, outcome: 'FAILURE', failureDetail: 'HTTP 502 from vendor' } });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('POSITIVITY.AUDIT.FAILURE_DETAIL');
    expect(text).toContain('HTTP 502 from vendor');
  });

  it('omits the failure block on a successful exchange', async () => {
    await setup();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'POSITIVITY.AUDIT.FAILURE_DETAIL',
    );
  });

  // ── Read-only + a11y ──────────────────────────────────────────────────────

  it('offers no retry or replay of the exchange itself', async () => {
    await setup();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).map(b => (b.textContent ?? '').toUpperCase());

    expect(labels.some(l => l.includes('REPLAY'))).toBe(false);
    expect(labels.some(l => l.includes('RESEND'))).toBe(false);
  });

  it('links back to the audit list with routerLink (ADR-0037)', async () => {
    await setup();
    const crumb = (fixture.nativeElement as HTMLElement).querySelector(
      '.exchange-detail__breadcrumb a',
    );

    expect(crumb?.getAttribute('href')).toBe('/app/positivity/exchanges');
  });

  it('associates each metadata value with its label through a definition list', async () => {
    await setup();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.exchange-detail__meta-item',
    );

    expect(items.length).toBeGreaterThan(0);
    for (const item of Array.from(items)) {
      expect(item.querySelector('dt')).not.toBeNull();
      expect(item.querySelector('dd')).not.toBeNull();
    }
  });
});
