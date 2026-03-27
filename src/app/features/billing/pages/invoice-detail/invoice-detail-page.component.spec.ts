import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { InvoiceDetailPageComponent } from './invoice-detail-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const INVOICE_ID = 'inv-001';

const mockRoute = {
  snapshot: { paramMap: { get: (k: string) => (k === 'invoiceId' ? INVOICE_ID : null) } },
};

const STUB_INVOICE = {
  id: INVOICE_ID,
  status: 'DRAFT',
  workOrderId: 'wo-001',
  issuancePolicy: { issuableNow: true, requiresElevation: false },
};

/** Flush the initial invoice GET + artifacts GET triggered by ngOnInit. */
function flushLoad(http: HttpTestingController, invoiceOverride?: object): void {
  http
    .expectOne(`${BASE}/billing/invoices/${INVOICE_ID}`)
    .flush(invoiceOverride ?? STUB_INVOICE);
  http.expectOne(`${BASE}/billing/invoices/${INVOICE_ID}/artifacts`).flush([]);
}

describe('InvoiceDetailPageComponent [Stories 209–212]', () => {
  let fixture: ComponentFixture<InvoiceDetailPageComponent>;
  let component: InvoiceDetailPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceDetailPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InvoiceDetailPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create and reach ready state', () => {
    fixture.detectChanges();
    flushLoad(http);
    expect(component).toBeTruthy();
    expect(component.pageState()).toBe('ready');
  });

  // ── F1/r2998536720 + F2/r2998536767 — canIssue() policy gating ───────────

  describe('canIssue()', () => {
    it('returns true when status is DRAFT and issuableNow is true', () => {
      fixture.detectChanges();
      flushLoad(http, { ...STUB_INVOICE, status: 'DRAFT', issuancePolicy: { issuableNow: true } });
      expect(component.canIssue()).toBe(true);
    });

    it('returns false when issuancePolicy.issuableNow is false, even if status is DRAFT (F1/r2998536720)', () => {
      fixture.detectChanges();
      flushLoad(http, { ...STUB_INVOICE, status: 'DRAFT', issuancePolicy: { issuableNow: false } });
      expect(component.canIssue()).toBe(false);
    });

    it('returns true when issuancePolicy is absent — backward compat defaults to issuable', () => {
      fixture.detectChanges();
      const { issuancePolicy: _ignored, ...invoiceWithoutPolicy } = STUB_INVOICE;
      flushLoad(http, { ...invoiceWithoutPolicy, status: 'DRAFT' });
      expect(component.canIssue()).toBe(true);
    });

    it('returns true when status is FINALIZED and issuableNow is not false (F2/r2998536767)', () => {
      fixture.detectChanges();
      flushLoad(http, { ...STUB_INVOICE, status: 'FINALIZED', issuancePolicy: { issuableNow: true } });
      expect(component.canIssue()).toBe(true);
    });

    it('returns false when status is ISSUED regardless of policy', () => {
      fixture.detectChanges();
      flushLoad(http, { ...STUB_INVOICE, status: 'ISSUED', issuancePolicy: { issuableNow: true } });
      expect(component.canIssue()).toBe(false);
    });
  });

  // ── F3/r2998536725 — Fallback download URL uses environment.apiBaseUrl ─────

  describe('downloadArtifact()', () => {
    it('uses downloadUrl from API response when present', () => {
      fixture.detectChanges();
      flushLoad(http);

      const fakeAnchor = { href: '', download: '', target: '', rel: '', click: vi.fn() };
      const createSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
          if (tag === 'a') return fakeAnchor as unknown as HTMLElement;
          return document.createElement(tag);
        });

      component.downloadArtifact('ref-001', 'invoice.pdf');
      http.expectOne(`${BASE}/billing/artifacts/ref-001/download-token`).flush({
        downloadToken: 'tok-abc',
        downloadUrl: 'https://cdn.example.com/invoice.pdf',
      });

      expect(fakeAnchor.href).toBe('https://cdn.example.com/invoice.pdf');
      createSpy.mockRestore();
    });

    it('constructs fallback URL using environment.apiBaseUrl when downloadUrl is absent (F3/r2998536725)', () => {
      fixture.detectChanges();
      flushLoad(http);

      const fakeAnchor = { href: '', download: '', target: '', rel: '', click: vi.fn() };
      const createSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
          if (tag === 'a') return fakeAnchor as unknown as HTMLElement;
          return document.createElement(tag);
        });

      component.downloadArtifact('ref-001', 'invoice.pdf');
      http.expectOne(`${BASE}/billing/artifacts/ref-001/download-token`).flush({
        downloadToken: 'tok-abc',
      });

      expect(fakeAnchor.href).toBe(
        `${environment.apiBaseUrl}/billing/artifacts/ref-001/download?token=tok-abc`,
      );
      createSpy.mockRestore();
    });
  });

  // ── PRCR-001 — elevationPassword cleared on elevate success and on dismiss ──

  describe('elevationPassword clearing (PRCR-001)', () => {
    it('clears elevationPassword after elevate() succeeds', () => {
      fixture.detectChanges();
      flushLoad(http, {
        ...STUB_INVOICE,
        issuancePolicy: { issuableNow: true, requiresElevation: true },
      });

      component.elevationPassword.set('supersecret');
      component.elevate();

      // Flush POST /billing/auth/elevate
      http
        .expectOne(`${BASE}/billing/auth/elevate`)
        .flush({ elevationToken: 'tok123' });

      // elevate() success calls performIssue() which POSTs to issue
      http
        .expectOne(`${BASE}/billing/invoices/${INVOICE_ID}/issue`)
        .flush({ ...STUB_INVOICE, status: 'ISSUED' });
      // performIssue success reloads artifacts
      http.expectOne(`${BASE}/billing/invoices/${INVOICE_ID}/artifacts`).flush([]);

      expect(component.elevationPassword()).toBe('');
    });

    it('clears elevationPassword when dismissElevationModal() is called', () => {
      fixture.detectChanges();
      flushLoad(http);

      component.elevationPassword.set('supersecret');
      component.dismissElevationModal();

      expect(component.elevationPassword()).toBe('');
    });
  });
});
