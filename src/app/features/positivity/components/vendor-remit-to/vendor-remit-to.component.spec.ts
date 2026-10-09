import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { RemitToChange } from '../../models/supplier-vendor.models';
import { VendorCopy } from '../../utils/supplier-vendor.util';
import {
  CHANGE_ID,
  VENDOR_ID,
  VendorAuthStub,
  VendorServiceMock,
  change,
  httpError,
  type,
  vendor,
  vendorProviders,
  vendorServiceMock,
} from '../../vendors.spec-helper';
import { VendorRemitToComponent } from './vendor-remit-to.component';

describe('VendorRemitToComponent (#469 item 5; §4.9 "a second person")', () => {
  let service: VendorServiceMock;
  let fixture: ComponentFixture<VendorRemitToComponent>;
  let emitted: (VendorCopy | null)[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(selector: string) => el().querySelector(selector) as T | null;
  const click = (selector: string): void => {
    q<HTMLButtonElement>(selector)!.click();
    fixture.detectChanges();
  };

  function setup(
    changes: RemitToChange[],
    inputs: Partial<{ canWrite: boolean; canApprove: boolean; subject: string | null; changesRead: 'PENDING' | 'OK' | 'FAILED' }> = {},
  ): void {
    TestBed.configureTestingModule({
      imports: [VendorRemitToComponent, TranslateModule.forRoot()],
      providers: vendorProviders(service, new VendorAuthStub()),
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture = TestBed.createComponent(VendorRemitToComponent);
    fixture.componentRef.setInput('vendor', vendor());
    fixture.componentRef.setInput('changes', changes);
    fixture.componentRef.setInput('changesRead', inputs.changesRead ?? 'OK');
    fixture.componentRef.setInput('vendorReady', true);
    fixture.componentRef.setInput('canWrite', inputs.canWrite ?? true);
    fixture.componentRef.setInput('canApprove', inputs.canApprove ?? true);
    fixture.componentRef.setInput('subject', inputs.subject === undefined ? 'clerk.b' : inputs.subject);
    emitted = [];
    fixture.componentInstance.changed.subscribe(value => emitted.push(value));
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = vendorServiceMock();
  });

  it('shows the approved remit-to and its version', () => {
    setup([]);
    expect(q('[data-testid="remit-current"]')?.textContent).toContain('1 Main St');
    expect(q('[data-testid="remit-version"]')?.textContent).toContain('Version 1');
  });

  describe('AC 5: self-approval', () => {
    it('A, who requested the change, sees Approve aria-disabled with the reason, and approve() refuses', () => {
      setup([change({ requestedBy: 'clerk.a' })], { subject: 'clerk.a' });
      const approve = q<HTMLButtonElement>('[data-testid="remit-approve"]')!;

      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(approve.getAttribute('aria-describedby')).toBe(q('[data-testid="remit-approve-blocked"]')!.id);
      expect(q('[data-testid="remit-approve-blocked"]')?.textContent?.trim()).toBe("You can't approve a change you requested");
      expect(q('[data-testid="remit-verification"]')).toBeNull();

      fixture.componentInstance.verificationNote.set('Called them on the number on file');
      fixture.componentInstance.approve();
      expect(service.approveRemitChange).not.toHaveBeenCalled();
    });

    it('B approves with a 10-character verification note, and the page is asked to read again', () => {
      setup([change({ requestedBy: 'clerk.a' })], { subject: 'clerk.b' });
      const approve = q<HTMLButtonElement>('[data-testid="remit-approve"]')!;
      expect(approve.getAttribute('aria-disabled')).toBeNull();

      type(q('[data-testid="remit-verification"]'), '123456789');
      fixture.detectChanges();
      expect(approve.disabled).toBe(true);

      type(q('[data-testid="remit-verification"]'), 'Called them');
      fixture.detectChanges();
      click('[data-testid="remit-approve"]');

      expect(service.approveRemitChange).toHaveBeenCalledWith(VENDOR_ID, CHANGE_ID, 'Called them');
      expect(emitted).toEqual([{ key: 'POSITIVITY.VENDORS.REMIT.APPROVED' }]);
    });

    it('the consequence precedes Approve (P4)', () => {
      setup([change()]);
      const consequence = q('[data-testid="remit-approve-consequence"]')!;
      expect(consequence.textContent?.trim()).toBe(
        'Payments will go to the new address. Bills approved before the change need a second confirmation before they are paid.',
      );
      expect(consequence.compareDocumentPosition(q('[data-testid="remit-approve"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('still classifies the server’s 403 SUPPLIER_VENDOR_REMIT_SELF_APPROVAL', () => {
      service.approveRemitChange.mockReturnValue(throwError(() => httpError(403, 'SUPPLIER_VENDOR_REMIT_SELF_APPROVAL')));
      setup([change({ requestedBy: 'CLERK.A' })], { subject: 'clerk.a' });
      type(q('[data-testid="remit-verification"]'), 'Called them on file');
      fixture.detectChanges();
      click('[data-testid="remit-approve"]');

      expect(q('[data-testid="remit-approve-error"]')?.textContent?.trim()).toBe("You can't approve a change you requested");
      expect(emitted).toEqual([]);
    });
  });

  it('AC 2: without supplier:vendor_remit:approve, Approve and Reject are absent and the handlers refuse', () => {
    setup([change()], { canApprove: false });
    expect(q('[data-testid="remit-approve"]')).toBeNull();
    expect(q('[data-testid="remit-reject"]')).toBeNull();

    fixture.componentInstance.verificationNote.set('Called them on file');
    fixture.componentInstance.approve();
    fixture.componentInstance.openReject();
    expect(service.approveRemitChange).not.toHaveBeenCalled();
    expect(fixture.componentInstance.rejectOpen()).toBe(false);
  });

  it('AC 2: without supplier:vendor:write, Request a change is absent and openRequest() refuses', () => {
    setup([], { canWrite: false });
    expect(q('[data-testid="remit-request"]')).toBeNull();
    fixture.componentInstance.openRequest();
    expect(fixture.componentInstance.requestOpen()).toBe(false);
  });

  it('Request a change waits for an OK changes read', () => {
    setup([], { changesRead: 'PENDING' });
    expect(q('[data-testid="remit-request"]')).toBeNull();
  });

  describe('Request a change', () => {
    it('opens a modal pre-filled with the current address; the consequence precedes the button; a short reason blocks it', () => {
      setup([]);
      click('[data-testid="remit-request"]');
      const dialog = q<HTMLDialogElement>('dialog[appModalDialog][data-testid="remit-request-dialog"]')!;
      expect(dialog.matches(':modal')).toBe(true);
      expect(q<HTMLInputElement>('[data-testid="remit-addressLine1"]')?.value).toBe('1 Main St');
      expect(q('[data-testid="remit-request-consequence"]')?.textContent?.trim()).toBe(
        'The new address is used only after someone else approves it.',
      );

      type(q('[data-testid="remit-request-reason"]'), 'short');
      fixture.detectChanges();
      expect(q<HTMLButtonElement>('[data-testid="remit-request-submit"]')!.disabled).toBe(true);
    });

    it('sends the proposed remit-to and reason', () => {
      setup([]);
      click('[data-testid="remit-request"]');
      type(q('[data-testid="remit-addressLine1"]'), '99 New Rd');
      type(q('[data-testid="remit-request-reason"]'), 'Vendor moved offices');
      fixture.detectChanges();
      click('[data-testid="remit-request-submit"]');

      expect(service.requestRemitChange).toHaveBeenCalledWith(
        VENDOR_ID,
        {
          payeeName: 'Acme Tire Ltd',
          addressLine1: '99 New Rd',
          city: 'Springfield',
          region: 'IL',
          postalCode: '62701',
          countryCode: 'US',
          remittanceEmail: 'ap@acme.example',
        },
        'Vendor moved offices',
      );
      expect(emitted).toEqual([{ key: 'POSITIVITY.VENDORS.REMIT.REQUESTED' }]);
      expect(q('[data-testid="remit-request-dialog"]')).toBeNull();
    });

    it('AC 6: a forced request answered 409 SUPPLIER_VENDOR_REMIT_CHANGE_PENDING closes and asks for a re-read', () => {
      service.requestRemitChange.mockReturnValue(throwError(() => httpError(409, 'SUPPLIER_VENDOR_REMIT_CHANGE_PENDING')));
      setup([]);
      click('[data-testid="remit-request"]');
      type(q('[data-testid="remit-request-reason"]'), 'Vendor moved offices');
      fixture.detectChanges();
      click('[data-testid="remit-request-submit"]');

      expect(q('[data-testid="remit-request-dialog"]')).toBeNull();
      expect(emitted).toEqual([{ key: 'POSITIVITY.VENDORS.ERROR.REMIT_PENDING' }]);
    });
  });

  describe('Reject', () => {
    it('needs a 10-character note and sends it', () => {
      setup([change()]);
      click('[data-testid="remit-reject"]');
      expect(q('dialog[appModalDialog][data-testid="remit-reject-dialog"]')).toBeTruthy();
      type(q('[data-testid="remit-reject-note"]'), 'too short');
      fixture.detectChanges();
      expect(q<HTMLButtonElement>('[data-testid="remit-reject-confirm"]')!.disabled).toBe(true);

      type(q('[data-testid="remit-reject-note"]'), 'Could not verify by phone');
      fixture.detectChanges();
      click('[data-testid="remit-reject-confirm"]');

      expect(service.rejectRemitChange).toHaveBeenCalledWith(VENDOR_ID, CHANGE_ID, 'Could not verify by phone');
      expect(emitted).toEqual([{ key: 'POSITIVITY.VENDORS.REMIT.REJECTED' }]);
    });

    it('a second decider gets 409 …NOT_PENDING: the dialog closes and the page reads the decision', () => {
      service.rejectRemitChange.mockReturnValue(throwError(() => httpError(409, 'SUPPLIER_VENDOR_REMIT_CHANGE_NOT_PENDING')));
      setup([change()]);
      click('[data-testid="remit-reject"]');
      type(q('[data-testid="remit-reject-note"]'), 'Could not verify by phone');
      fixture.detectChanges();
      click('[data-testid="remit-reject-confirm"]');

      expect(q('[data-testid="remit-reject-dialog"]')).toBeNull();
      expect(emitted).toEqual([{ key: 'POSITIVITY.VENDORS.ERROR.REMIT_NOT_PENDING' }]);
    });
  });

  it('a decision answered after the pending change was replaced is dropped and the section is usable (ADR-0063)', () => {
    const late = new Subject<RemitToChange>();
    service.approveRemitChange.mockReturnValue(late);
    setup([change()]);
    type(q('[data-testid="remit-verification"]'), 'Called them on file');
    fixture.detectChanges();
    click('[data-testid="remit-approve"]');
    expect(fixture.componentInstance.busy()).toBe(true);

    fixture.componentRef.setInput('changes', [change({ changeId: 'another' })]);
    fixture.detectChanges();
    late.next(change({ status: 'APPROVED' }));

    expect(emitted).toEqual([]);
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  describe('B7: handlers refuse a valid form once the permission is revoked (ADR-0040 §6a)', () => {
    it('submitRequest()', () => {
      setup([]);
      click('[data-testid="remit-request"]');
      type(q('[data-testid="remit-request-reason"]'), 'Vendor moved offices');
      fixture.detectChanges();
      expect(fixture.componentInstance.requestValid()).toBe(true);
      fixture.componentRef.setInput('canWrite', false);
      fixture.componentInstance.submitRequest();
      expect(service.requestRemitChange).not.toHaveBeenCalled();
    });

    it('confirmReject()', () => {
      setup([change()]);
      click('[data-testid="remit-reject"]');
      type(q('[data-testid="remit-reject-note"]'), 'Could not verify by phone');
      fixture.detectChanges();
      expect(fixture.componentInstance.rejectValid()).toBe(true);
      fixture.componentRef.setInput('canApprove', false);
      fixture.componentInstance.confirmReject();
      expect(service.rejectRemitChange).not.toHaveBeenCalled();
    });

    it('approve()', () => {
      setup([change()]);
      type(q('[data-testid="remit-verification"]'), 'Called them on file');
      fixture.detectChanges();
      fixture.componentRef.setInput('canApprove', false);
      fixture.componentInstance.approve();
      expect(service.approveRemitChange).not.toHaveBeenCalled();
    });
  });

  describe('B1/B5: notes', () => {
    it('cap at 1000 characters and say "10 to 1000 characters."', () => {
      setup([change()]);
      expect(q('[data-testid="remit-verification"]')?.getAttribute('maxlength')).toBe('1000');
      expect(q(`#${fixture.componentInstance.id}-verification-hint`)?.textContent?.trim()).toBe('10 to 1000 characters.');
      click('[data-testid="remit-reject"]');
      expect(q('[data-testid="remit-reject-note"]')?.getAttribute('maxlength')).toBe('1000');
      expect(q(`#${fixture.componentInstance.id}-reject-title`)?.textContent?.trim()).toBe('Reject the remit-to change for V-000123');
    });

    it('a refused verification note is marked on its textarea', () => {
      service.approveRemitChange.mockReturnValue(
        throwError(() => httpError(400, 'VALIDATION_ERROR', { fieldErrors: [{ field: 'verificationNote', message: 'x' }] })),
      );
      setup([change()]);
      type(q('[data-testid="remit-verification"]'), 'Called them on file');
      fixture.detectChanges();
      click('[data-testid="remit-approve"]');

      expect(q('[data-testid="remit-verification"]')?.getAttribute('aria-invalid')).toBe('true');
      expect(q('[data-testid="remit-verification-error"]')?.textContent?.trim()).toBe('Write at least 10 characters.');
    });

    it('a refused reject note is marked on its textarea', () => {
      service.rejectRemitChange.mockReturnValue(throwError(() => httpError(400, 'VALIDATION_ERROR', { fieldErrors: [{ field: 'note', message: 'x' }] })));
      setup([change()]);
      click('[data-testid="remit-reject"]');
      type(q('[data-testid="remit-reject-note"]'), 'Could not verify by phone');
      fixture.detectChanges();
      click('[data-testid="remit-reject-confirm"]');

      expect(q('[data-testid="remit-reject-note"]')?.getAttribute('aria-invalid')).toBe('true');
      expect(q('[data-testid="remit-reject-note-error"]')).toBeTruthy();
    });

    it('a refused request reason is marked; an unrendered path shows the surface message', () => {
      service.requestRemitChange
        .mockReturnValueOnce(throwError(() => httpError(400, 'VALIDATION_ERROR', { fieldErrors: [{ field: 'reason', message: 'x' }] })))
        .mockReturnValueOnce(throwError(() => httpError(400, 'VALIDATION_ERROR', { fieldErrors: [{ field: 'mystery', message: 'x' }] })));
      setup([]);
      click('[data-testid="remit-request"]');
      expect(q(`#${fixture.componentInstance.id}-request-title`)?.textContent?.trim()).toBe('Request a remit-to change for V-000123');
      type(q('[data-testid="remit-request-reason"]'), 'Vendor moved offices');
      fixture.detectChanges();
      click('[data-testid="remit-request-submit"]');
      expect(q('[data-testid="remit-request-reason"]')?.getAttribute('aria-invalid')).toBe('true');
      expect(q('[data-testid="remit-request-reason-error"]')).toBeTruthy();

      click('[data-testid="remit-request-submit"]');
      expect(q('[data-testid="remit-request-reason-error"]')).toBeNull();
      expect(q('[data-testid="remit-request-error"]')?.textContent?.trim()).toBe('The remit-to change could not be requested.');
    });
  });

  it('lists the history with requester, decider, notes and versions', () => {
    setup([
      change({ status: 'APPROVED', decidedBy: 'controller.b', decidedAt: '2026-10-08T10:00:00Z', decisionNote: 'Called the vendor', toVersion: 2 }),
    ]);
    const row = q('[data-testid="remit-history-row"]')!;
    expect(row.textContent).toContain('clerk.a');
    expect(row.textContent).toContain('controller.b');
    expect(row.textContent).toContain('Decision: Called the vendor');
    expect(row.textContent).toContain('1 → 2');
  });

  it('never shows a raw identity for a requester', () => {
    setup([change({ requestedBy: '0192a4c2-0000-7000-8000-000000000009' })]);
    expect(q('[data-testid="remit-pending-requester"]')?.textContent?.trim()).toBe(enUS.COMMON.NOT_AVAILABLE);
  });

  it('renders proposed lines as text', () => {
    setup([change({ proposedRemitTo: { ...change().proposedRemitTo!, addressLine1: '<b onmouseover=x>1</b>' } })]);
    expect(q('[data-testid="remit-pending-new"] b')).toBeNull();
    expect(q('[data-testid="remit-pending-new"]')?.textContent).toContain('<b onmouseover=x>1</b>');
  });

  it('reads nothing itself; the pending change comes from the page', () => {
    setup([change()]);
    expect(service.listRemitChanges).not.toHaveBeenCalled();
  });
});
