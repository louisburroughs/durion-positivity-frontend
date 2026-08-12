import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExchangeAuditDetailPageComponent } from './exchange-audit-detail-page.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import {
  ExchangeAuditRecord,
  ExchangePayloadView,
} from '../../models/supplier-exchange.models';

const EXCHANGE_ID = 'exch-1';

const record: ExchangeAuditRecord = {
  exchangeId: EXCHANGE_ID,
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
  unmappedFields: ['Order.Geolocation'],
};

const payload: ExchangePayloadView = {
  exchangeId: EXCHANGE_ID,
  captureLevel: 'REDACTED',
  requestContentType: 'application/xml',
  requestBody: '<Order><BuyerParty>***</BuyerParty></Order>',
  requestHeaders: [{ name: 'Authorization', value: '***', redacted: true }],
  responseContentType: 'application/xml',
  responseBody: '<OrderResponse/>',
  responseHeaders: [{ name: 'Content-Type', value: 'application/xml', redacted: false }],
  redactedFields: ['Order.BuyerParty'],
};

describe('ExchangeAuditDetailPageComponent', () => {
  let fixture: ComponentFixture<ExchangeAuditDetailPageComponent>;
  let component: ExchangeAuditDetailPageComponent;
  let service: {
    getExchange: ReturnType<typeof vi.fn>;
    getExchangePayload: ReturnType<typeof vi.fn>;
  };

  async function setup(options?: {
    exchange?: ExchangeAuditRecord | HttpErrorResponse;
    payload?: ExchangePayloadView | HttpErrorResponse;
  }): Promise<void> {
    const exchangeResult = options?.exchange ?? record;
    const payloadResult = options?.payload ?? payload;

    service = {
      getExchange: vi
        .fn()
        .mockReturnValue(
          exchangeResult instanceof HttpErrorResponse
            ? throwError(() => exchangeResult)
            : of(exchangeResult),
        ),
      getExchangePayload: vi
        .fn()
        .mockReturnValue(
          payloadResult instanceof HttpErrorResponse
            ? throwError(() => payloadResult)
            : of(payloadResult),
        ),
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

  // ── Two-pane payload view ──────────────────────────────────────────────────

  it('renders request and response as two separate panes', async () => {
    await setup();
    const panes = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.exchange-detail__pane',
    );

    expect(panes).toHaveLength(2);
    expect(panes[0].textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.REQUEST');
    expect(panes[1].textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.RESPONSE');
  });

  it('renders payloads exactly as delivered, keeping redaction intact', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('<Order><BuyerParty>***</BuyerParty></Order>');
    expect(text).toContain('POSITIVITY.AUDIT.PAYLOAD.REDACTION_NOTE');
    expect(text).toContain('Order.BuyerParty');
  });

  it('flags redacted headers as redacted', async () => {
    await setup();
    const flags = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.exchange-detail__redacted-flag',
    );

    expect(flags).toHaveLength(1);
  });

  // ── payload-restricted ─────────────────────────────────────────────────────

  it('renders payload-restricted when the payload endpoint answers 403, keeping the metadata', async () => {
    await setup({ payload: new HttpErrorResponse({ status: 403, statusText: 'x' }) });

    expect(component.state()).toBe('ready');
    expect(component.payloadState()).toBe('payload-restricted');
    expect(component.payloadErrorKey()).toBe('POSITIVITY.AUDIT.PAYLOAD.RESTRICTED');
    expect(component.payload()).toBeNull();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.exchange-detail__pane')).toBeNull();
    expect(host.textContent).toContain('POSITIVITY.AUDIT.PAYLOAD.RESTRICTED');
    // metadata is still on screen — a payload denial is not a page failure
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
        exchangeId: EXCHANGE_ID,
        captureLevel: 'METADATA_ONLY',
        requestBody: null,
        responseBody: null,
      },
    });

    expect(component.payloadState()).toBe('metadata-only');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.PAYLOAD.METADATA_ONLY',
    );
  });

  it('reports a retention-purged payload as its own state', async () => {
    await setup({
      payload: { ...payload, payloadPurgedAt: '2026-07-01T00:00:00Z' },
    });

    expect(component.payloadState()).toBe('payload-purged');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUDIT.PAYLOAD.PURGED',
    );
  });

  // ── Read-only + a11y ───────────────────────────────────────────────────────

  it('offers no retry or replay of the exchange itself', async () => {
    await setup();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).map(b => (b.textContent ?? '').toUpperCase());

    expect(labels.some(l => l.includes('REPLAY'))).toBe(false);
    expect(labels.some(l => l.includes('RESEND'))).toBe(false);
  });

  it('surfaces fields the bound protocol version could not express', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('POSITIVITY.AUDIT.UNMAPPED_FIELDS');
    expect(text).toContain('Order.Geolocation');
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
