import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceArtifact, InvoiceDetail } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { InvoiceDetailPageComponent } from './invoice-detail-page.component';

const INVOICE_ID = 'inv-001';

const translations = {
  BILLING: {
    INVOICE_DETAIL: {
      HEADER: {
        OVERLINE: 'Invoice',
      },
      LOADING: 'Loading invoice...',
      SECTION: {
        SUMMARY: 'Invoice Summary',
        DOCUMENTS: 'Documents',
      },
      FIELD: {
        WORKORDER: 'Workorder',
      },
      ACTION: {
        BACK_TO_WORKORDER: 'Back to Workorder',
        ISSUE: 'Issue Invoice',
        ISSUING: 'Issuing...',
        DOWNLOAD: 'Download',
      },
      SUCCESS: {
        ISSUED: 'Invoice issued successfully. Documents available below.',
      },
      ERROR: {
        NOT_FOUND: 'Invoice not found.',
        LOAD: 'Failed to load invoice. Please try again.',
        ALREADY_ISSUED: 'Invoice has already been issued.',
      },
      ELEVATION: {
        ARIA_LABEL: 'Manager elevation required',
        TITLE: 'Manager Authorization Required',
        DESCRIPTION: 'Issuing this invoice requires manager-level authorization. Enter the manager password to proceed.',
        PASSWORD_LABEL: 'Manager Password',
        PASSWORD_PLACEHOLDER: 'Enter password',
        AUTHORIZE: 'Authorize',
        VERIFYING: 'Verifying...',
        ERROR: {
          PASSWORD_REQUIRED: 'Password is required.',
          INVALID_PASSWORD: 'Incorrect password. Please try again.',
        },
      },
    },
  },
  COMMON: {
    CANCEL: 'Cancel',
  },
};

const routeStub = {
  snapshot: {
    paramMap: {
      get: (key: string) => (key === 'invoiceId' ? INVOICE_ID : null),
    },
  },
};

const invoiceFixture: InvoiceDetail = {
  invoiceId: INVOICE_ID,
  invoiceNumber: 'INV-001',
  workOrderId: 'wo-001',
  status: 'DRAFT',
  subtotal: 100,
  grandTotal: 100,
  issuancePolicy: {
    issuableNow: true,
    requiresElevation: false,
  },
};

const artifactFixture: InvoiceArtifact[] = [
  {
    artifactRefId: 'artifact-001',
    fileName: 'invoice.pdf',
    contentType: 'application/pdf',
  },
];

describe('InvoiceDetailPageComponent', () => {
  let fixture: ComponentFixture<InvoiceDetailPageComponent>;
  let component: InvoiceDetailPageComponent;
  let billingTransportStub: {
    loadInvoiceDetail: ReturnType<typeof vi.fn>;
    loadInvoiceArtifacts: ReturnType<typeof vi.fn>;
    createArtifactDownloadToken: ReturnType<typeof vi.fn>;
    elevate: ReturnType<typeof vi.fn>;
    issueInvoice: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    billingTransportStub = {
      loadInvoiceDetail: vi.fn().mockReturnValue(of(invoiceFixture)),
      loadInvoiceArtifacts: vi.fn().mockReturnValue(of(artifactFixture)),
      createArtifactDownloadToken: vi.fn().mockReturnValue(of({
        downloadToken: 'token-001',
        downloadUrl: 'https://cdn.example.com/invoice.pdf',
      })),
      elevate: vi.fn().mockReturnValue(of({ elevationToken: 'elev-001' })),
      issueInvoice: vi.fn().mockReturnValue(of({ ...invoiceFixture, status: 'ISSUED' })),
    };

    await TestBed.configureTestingModule({
      imports: [InvoiceDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: BillingTransportService, useValue: billingTransportStub },
      ],
    }).compileComponents();

    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en-US', translations);
    translateService.use('en-US');

    fixture = TestBed.createComponent(InvoiceDetailPageComponent);
    component = fixture.componentInstance;
  });

  it('renders translated invoice heading, actions, and document controls after load', () => {
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    expect(component.pageState()).toBe('ready');
    expect(host.querySelector('.wo-header__overline')?.textContent).toContain('Invoice');
    expect(host.querySelector('#invoice-heading')?.textContent).toContain(INVOICE_ID);
    expect(host.querySelector('.btn--ghost')?.textContent).toContain('Back to Workorder');
    expect(host.querySelector('.btn--accent')?.textContent).toContain('Issue Invoice');
    expect(host.querySelector('#totals-heading')?.textContent).toContain('Invoice Summary');
    expect(host.textContent).toContain('Documents');
    expect(host.textContent).toContain('Download');

    expect(billingTransportStub.loadInvoiceDetail).toHaveBeenCalledWith(INVOICE_ID);
    expect(billingTransportStub.loadInvoiceArtifacts).toHaveBeenCalledWith(INVOICE_ID);
  });

  it('renders translated elevation modal copy and validation state', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValueOnce(of({
      ...invoiceFixture,
      issuancePolicy: {
        issuableNow: true,
        requiresElevation: true,
      },
    }));

    fixture.detectChanges();
    component.initiateIssue();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const passwordInput = host.querySelector('#elevation-password') as HTMLInputElement | null;

    expect(host.textContent).toContain('Manager Authorization Required');
    expect(host.textContent).toContain('Issuing this invoice requires manager-level authorization. Enter the manager password to proceed.');
    expect(host.textContent).toContain('Manager Password');
    expect(passwordInput?.placeholder).toBe('Enter password');
    expect(host.textContent).toContain('Cancel');
    expect(host.textContent).toContain('Authorize');

    component.elevationPassword.set('');
    component.elevate();
    fixture.detectChanges();

    expect(host.textContent).toContain('Password is required.');
    expect(billingTransportStub.elevate).not.toHaveBeenCalled();
  });

  it('renders translated success status after issue completes', () => {
    fixture.detectChanges();

    component.initiateIssue();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    expect(billingTransportStub.issueInvoice).toHaveBeenCalledWith(INVOICE_ID, {});
    expect(component.issueState()).toBe('success');
    expect(component.issueSuccess()).toBe(true);
    expect(host.textContent).toContain('Invoice issued successfully. Documents available below.');
  });

  it('renders translated page error copy when invoice loading fails', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValueOnce(
      throwError(() => ({ status: 404 })),
    );

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    expect(component.pageState()).toBe('error');
    expect(host.textContent).toContain('Invoice not found.');
    expect(billingTransportStub.loadInvoiceArtifacts).not.toHaveBeenCalled();
  });

  it('renders translated issue error copy when issue is rejected', () => {
    billingTransportStub.issueInvoice.mockReturnValueOnce(
      throwError(() => ({ status: 409 })),
    );

    fixture.detectChanges();
    component.initiateIssue();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    expect(component.issueState()).toBe('error');
    expect(host.textContent).toContain('Invoice has already been issued.');
  });
});
