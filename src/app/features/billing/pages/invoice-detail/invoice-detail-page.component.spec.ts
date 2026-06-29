import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EMPTY, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceArtifact, InvoiceDetail } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { AuthService } from '../../../../core/services/auth.service';
import { InvoiceDetailPageComponent } from './invoice-detail-page.component';

const INVOICE_ID = 'inv-001';

const translations = {
  BILLING: {
    INVOICE_DETAIL: {
      HEADER: {
        OVERLINE: 'Invoice',
        DRAFT_NO_NUMBER: 'Draft (number assigned when issued)',
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
        DESCRIPTION: "Issuing this invoice requires manager-level authorization. Enter an authorizing manager's employee number to proceed.",
        MANAGER_NUMBER_LABEL: 'Manager Employee Number',
        MANAGER_NUMBER_PLACEHOLDER: 'Enter manager employee number',
        AUTHORIZE: 'Authorize',
        VERIFYING: 'Verifying...',
        ERROR: {
          EMPLOYEE_REQUIRED: 'Manager employee number is required.',
          NOT_AUTHORIZED: 'That employee number is not an authorized manager. Please try again.',
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
  let authServiceStub: { hasAnyRole: ReturnType<typeof vi.fn> };

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
    // Default: non-manager — exercises the manager-approval modal path.
    authServiceStub = { hasAnyRole: vi.fn().mockReturnValue(false) };

    await TestBed.configureTestingModule({
      imports: [InvoiceDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: AuthService, useValue: authServiceStub },
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
    expect(host.querySelector('#invoice-heading')?.textContent).toContain('INV-001');
    expect(host.querySelector('.btn--ghost')?.textContent).toContain('Back to Workorder');
    expect(host.querySelector('.btn--accent')?.textContent).toContain('Issue Invoice');
    expect(host.querySelector('#totals-heading')?.textContent).toContain('Invoice Summary');
    expect(host.textContent).toContain('Documents');
    expect(host.querySelector('.doc-link')?.textContent).toContain('invoice.pdf');

    expect(billingTransportStub.loadInvoiceDetail).toHaveBeenCalledWith(INVOICE_ID);
    expect(billingTransportStub.loadInvoiceArtifacts).toHaveBeenCalledWith(INVOICE_ID);
  });

  it('renders the workorder number and line-item type chip', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValueOnce(of({
      ...invoiceFixture,
      workOrderNumber: 'WO-2026-1001',
      lineItems: [
        { id: 'li-1', description: 'Diagnostics', quantity: 1, unitPrice: 100, lineTotal: 100, type: 'LABOR' as const },
      ],
    }));

    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const workorderValue = host.querySelector('.totals-grid__value')?.textContent ?? '';
    expect(workorderValue).toContain('WO-2026-1001');
    expect(workorderValue).not.toContain('wo-001');
    expect(host.querySelector('.type-chip')?.textContent).toContain('LABOR');
  });

  it('shows the draft fallback heading when a draft invoice has no number', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValueOnce(of({
      ...invoiceFixture,
      invoiceNumber: undefined,
      status: 'DRAFT' as const,
    }));

    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#invoice-heading')?.textContent).toContain('Draft (number assigned when issued)');
  });

  it('does not show the draft fallback heading while loading', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValueOnce(EMPTY);

    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(component.pageState()).toBe('loading');
    expect(host.querySelector('#invoice-heading')?.textContent).not.toContain('Draft');
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
    const managerInput = host.querySelector('#elevation-manager-number') as HTMLInputElement | null;

    expect(host.textContent).toContain('Manager Authorization Required');
    expect(host.textContent).toContain("Issuing this invoice requires manager-level authorization. Enter an authorizing manager's employee number to proceed.");
    expect(host.textContent).toContain('Manager Employee Number');
    expect(managerInput?.placeholder).toBe('Enter manager employee number');
    expect(host.textContent).toContain('Cancel');
    expect(host.textContent).toContain('Authorize');

    component.managerEmployeeNumber.set('');
    component.elevate();
    fixture.detectChanges();

    expect(host.textContent).toContain('Manager employee number is required.');
    expect(billingTransportStub.elevate).not.toHaveBeenCalled();
  });

  it('on successful elevate: stores token, closes modal, and issues with the token', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValueOnce(of({
      ...invoiceFixture,
      issuancePolicy: { issuableNow: true, requiresElevation: true },
    }));
    billingTransportStub.elevate.mockReturnValueOnce(of({ elevationToken: 'elev-xyz' }));

    fixture.detectChanges();
    component.initiateIssue();
    component.managerEmployeeNumber.set('EMP-0001');
    component.elevate();
    fixture.detectChanges();

    expect(billingTransportStub.elevate).toHaveBeenCalledWith('EMP-0001', INVOICE_ID);
    expect(component.elevationToken()).toBe('elev-xyz');
    expect(component.showElevationModal()).toBe(false);
    expect(billingTransportStub.issueInvoice).toHaveBeenCalledWith(INVOICE_ID, { elevationToken: 'elev-xyz' });
  });

  it('maps a 401 elevate error to NOT_AUTHORIZED and a non-401 error to GENERIC', () => {
    billingTransportStub.loadInvoiceDetail.mockReturnValue(of({
      ...invoiceFixture,
      issuancePolicy: { issuableNow: true, requiresElevation: true },
    }));

    fixture.detectChanges();
    component.initiateIssue();

    component.managerEmployeeNumber.set('EMP-0001');
    billingTransportStub.elevate.mockReturnValueOnce(throwError(() => ({ status: 401 })));
    component.elevate();
    expect(component.elevationError()).toBe('BILLING.INVOICE_DETAIL.ELEVATION.ERROR.NOT_AUTHORIZED');

    component.managerEmployeeNumber.set('EMP-0001');
    billingTransportStub.elevate.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    component.elevate();
    expect(component.elevationError()).toBe('BILLING.INVOICE_DETAIL.ELEVATION.ERROR.GENERIC');
  });

  it('skips the elevation modal and issues directly for a manager with override role', () => {
    authServiceStub.hasAnyRole.mockReturnValue(true);
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

    expect(component.showElevationModal()).toBe(false);
    expect(billingTransportStub.elevate).not.toHaveBeenCalled();
    expect(billingTransportStub.issueInvoice).toHaveBeenCalled();
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
