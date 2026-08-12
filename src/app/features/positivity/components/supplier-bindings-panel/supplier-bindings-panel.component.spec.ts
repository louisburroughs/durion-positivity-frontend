import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierBindingsPanelComponent } from './supplier-bindings-panel.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierApiErrorBody,
  SupplierAuthConfig,
  SupplierBinding,
  SupplierCapabilityDescriptor,
} from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const capabilityCatalog: SupplierCapabilityDescriptor[] = [
  {
    capability: 'ORDER',
    protocolOptions: [
      { protocolFamily: 'EDIWHEEL_C1', versions: ['C1_0', 'C1_1'] },
      { protocolFamily: 'MICHELIN_S2S', versions: ['V1'] },
    ],
  },
  {
    capability: 'PRICE_CATALOG',
    protocolOptions: [{ protocolFamily: 'EDIWHEEL_B', versions: ['B4_0'] }],
  },
  {
    capability: 'STOCK_REPORT',
    protocolOptions: [{ protocolFamily: 'EDIWHEEL_B', versions: ['B2_1'] }],
  },
];

const enabledOrderBinding: SupplierBinding = {
  bindingId: 'bind-1',
  capability: 'ORDER',
  protocolFamily: 'EDIWHEEL_C1',
  protocolVersion: 'C1_1',
  baseUrl: 'https://edi.example.com',
  path: '/order',
  authRef: 'michelin-prod',
  cronSchedule: null,
  enabled: true,
};

const disabledPricatBinding: SupplierBinding = {
  bindingId: 'bind-2',
  capability: 'PRICE_CATALOG',
  protocolFamily: 'EDIWHEEL_B',
  protocolVersion: 'B4_0',
  baseUrl: 'https://edi.example.com',
  path: '/pricat',
  authRef: 'michelin-prod',
  cronSchedule: '0 0 3 * * *',
  enabled: false,
};

const authConfig: SupplierAuthConfig = {
  authConfigId: 'auth-1',
  authRef: 'michelin-prod',
  authType: 'BASIC_PLUS_APIKEY',
};

function httpError(status: number, body?: SupplierApiErrorBody): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error: body ?? null });
}

describe('SupplierBindingsPanelComponent', () => {
  let fixture: ComponentFixture<SupplierBindingsPanelComponent>;
  let component: SupplierBindingsPanelComponent;
  let service: {
    listBindings: ReturnType<typeof vi.fn>;
    listCapabilities: ReturnType<typeof vi.fn>;
    listAuthConfigs: ReturnType<typeof vi.fn>;
    createBinding: ReturnType<typeof vi.fn>;
    updateBinding: ReturnType<typeof vi.fn>;
    deleteBinding: ReturnType<typeof vi.fn>;
  };

  async function setup(
    bindings: SupplierBinding[] = [enabledOrderBinding, disabledPricatBinding],
    failure?: HttpErrorResponse,
  ): Promise<void> {
    service = {
      listBindings: vi
        .fn()
        .mockReturnValue(failure ? throwError(() => failure) : of(bindings)),
      listCapabilities: vi.fn().mockReturnValue(of(capabilityCatalog)),
      listAuthConfigs: vi.fn().mockReturnValue(of([authConfig])),
      createBinding: vi.fn().mockReturnValue(of(enabledOrderBinding)),
      updateBinding: vi.fn().mockReturnValue(of(enabledOrderBinding)),
      deleteBinding: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierBindingsPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierProfileService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierBindingsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads bindings, the capability registry and auth configs together', async () => {
    await setup();

    expect(service.listBindings).toHaveBeenCalledWith(PROFILE_ID);
    expect(service.listCapabilities).toHaveBeenCalled();
    expect(service.listAuthConfigs).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup([], httpError(500));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without binding data on 403', async () => {
    await setup([], httpError(403));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  // ── Absence is meaningful ──────────────────────────────────────────────────

  it('renders a row for every registry capability, including unbound ones', async () => {
    await setup();

    expect(component.rows().map(r => r.capability)).toEqual([
      'ORDER',
      'PRICE_CATALOG',
      'STOCK_REPORT',
    ]);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
  });

  it('marks an unbound capability explicitly disabled rather than hiding it', async () => {
    await setup();
    const stockRow = component.rows().find(r => r.capability === 'STOCK_REPORT');

    expect(stockRow?.binding).toBeNull();
    expect(component.statusLabelKey(stockRow!)).toBe(
      'POSITIVITY.BINDINGS.STATUS.NOT_CONFIGURED',
    );

    const domRows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );
    const disabledRows = domRows.filter(r => r.getAttribute('aria-disabled') === 'true');
    expect(disabledRows).toHaveLength(1);
    expect(disabledRows[0].textContent).toContain('POSITIVITY.BINDINGS.STATUS.NOT_CONFIGURED');
  });

  it('distinguishes enabled, disabled and unbound in the status chip', async () => {
    await setup();
    const [order, pricat, stock] = component.rows();

    expect(component.statusLabelKey(order)).toBe('POSITIVITY.BINDINGS.STATUS.ENABLED');
    expect(component.statusLabelKey(pricat)).toBe('POSITIVITY.BINDINGS.STATUS.DISABLED');
    expect(component.statusLabelKey(stock)).toBe('POSITIVITY.BINDINGS.STATUS.NOT_CONFIGURED');
  });

  // ── Protocol selectors ─────────────────────────────────────────────────────

  it('narrows protocol families and versions to the selected capability', async () => {
    await setup();
    component.startCreate(component.rows()[0]);

    expect(component.protocolFamilies()).toEqual(['EDIWHEEL_C1', 'MICHELIN_S2S']);
    expect(component.protocolVersions()).toEqual([]);

    component.form.controls.protocolFamily.setValue('EDIWHEEL_C1');
    expect(component.protocolVersions()).toEqual(['C1_0', 'C1_1']);
  });

  it('pre-selects the capability when configuring an unbound row', async () => {
    await setup();
    const stockRow = component.rows()[2];
    component.startCreate(stockRow);

    expect(component.form.getRawValue().capability).toBe('STOCK_REPORT');
    expect(component.formOpen()).toBe(true);
  });

  // ── Confirmation on live bindings (open question, resolved conservatively) ──

  it('requires explicit confirmation before saving an edit to an enabled binding', async () => {
    await setup();
    component.startEdit(enabledOrderBinding);
    component.form.patchValue({ path: '/order-v2' });
    component.save();

    expect(component.pendingConfirmation()).not.toBeNull();
    expect(service.updateBinding).not.toHaveBeenCalled();

    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-labelledby')).toBe('binding-confirm-title');
  });

  it('sends the held edit once confirmed', async () => {
    await setup();
    component.startEdit(enabledOrderBinding);
    component.form.patchValue({ path: '/order-v2' });
    component.save();
    component.confirmSave();

    expect(service.updateBinding).toHaveBeenCalledWith(
      PROFILE_ID,
      'bind-1',
      expect.objectContaining({ path: '/order-v2', capability: 'ORDER' }),
    );
    expect(component.pendingConfirmation()).toBeNull();
  });

  it('abandons the edit when the confirmation is cancelled', async () => {
    await setup();
    component.startEdit(enabledOrderBinding);
    component.save();
    component.cancelConfirmation();

    expect(component.pendingConfirmation()).toBeNull();
    expect(service.updateBinding).not.toHaveBeenCalled();
  });

  it('does not prompt when editing a disabled binding', async () => {
    await setup();
    component.startEdit(disabledPricatBinding);
    component.form.patchValue({ path: '/pricat-v2' });
    component.save();

    expect(component.pendingConfirmation()).toBeNull();
    expect(service.updateBinding).toHaveBeenCalled();
  });

  it('does not prompt when creating a new binding', async () => {
    await setup();
    component.startCreate(component.rows()[2]);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    expect(component.pendingConfirmation()).toBeNull();
    expect(service.createBinding).toHaveBeenCalled();
  });

  // ── Payload + error mapping ────────────────────────────────────────────────

  it('sends a null cron rather than an empty string when no schedule is set', async () => {
    await setup();
    component.startCreate(component.rows()[2]);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
      cronSchedule: '   ',
    });
    component.save();

    const payload = service.createBinding.mock.calls[0][1] as Record<string, unknown>;
    expect(payload['cronSchedule']).toBeNull();
    expect(payload).not.toHaveProperty('bindingId');
  });

  it('maps a binding-without-auth 400 to the authRef field', async () => {
    await setup();
    service.createBinding.mockReturnValue(
      throwError(() =>
        httpError(400, { fieldErrors: [{ field: 'authRef', code: 'BINDING_AUTH_REQUIRED' }] }),
      ),
    );
    component.startCreate(component.rows()[2]);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('authRef')).toBe(
      'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
    );
  });

  it('maps a malformed cron 400 to the cronSchedule field', async () => {
    await setup();
    service.createBinding.mockReturnValue(
      throwError(() =>
        httpError(400, { fieldErrors: [{ field: 'cronSchedule', code: 'CRON_MALFORMED' }] }),
      ),
    );
    component.startCreate(component.rows()[2]);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
      cronSchedule: 'not a cron',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.fieldError('cronSchedule')).toBe('POSITIVITY.ERROR.FIELD.CRON_MALFORMED');
  });

  it('maps a 409 duplicate capability binding to the capability field', async () => {
    await setup();
    service.createBinding.mockReturnValue(throwError(() => httpError(409)));
    component.startCreate(component.rows()[2]);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(component.fieldError('capability')).toBe(
      'POSITIVITY.ERROR.FIELD.DUPLICATE_CAPABILITY_BINDING',
    );
  });

  it('treats a 5xx save as retryable with both state and errorKey set', async () => {
    await setup();
    service.createBinding.mockReturnValue(throwError(() => httpError(502)));
    component.startCreate(component.rows()[2]);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('sets both state and errorKey when a delete fails', async () => {
    await setup();
    service.deleteBinding.mockReturnValue(throwError(() => httpError(500)));
    component.remove(enabledOrderBinding);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('blocks mutations on a YAML-managed profile', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    component.startEdit(enabledOrderBinding);
    component.save();
    component.remove(enabledOrderBinding);

    expect(service.updateBinding).not.toHaveBeenCalled();
    expect(service.deleteBinding).not.toHaveBeenCalled();
  });

  it('labels every form control (ADR-0029)', async () => {
    await setup();
    component.startCreate(component.rows()[0]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    for (const control of Array.from(host.querySelectorAll('form input, form select'))) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(host.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });
});
