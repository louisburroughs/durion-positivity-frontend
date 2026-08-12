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
} from '../../models/supplier-profile.models';
import { KNOWN_SUPPLIER_CAPABILITIES } from '../../utils/supplier-capability-keys';

const PROFILE_ID = 'profile-1';

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

  it('loads bindings and auth configs together', async () => {
    await setup();

    expect(service.listBindings).toHaveBeenCalledWith(PROFILE_ID);
    expect(service.listAuthConfigs).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
  });

  it('requests no capability registry — the contract exposes none', async () => {
    await setup();

    expect(service).not.toHaveProperty('listCapabilities');
    expect((service as Record<string, unknown>)['listCapabilities']).toBeUndefined();
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

  it('renders a row for every capability it can name, including unbound ones', async () => {
    await setup();

    expect(component.rows().map(r => r.capability)).toEqual([...KNOWN_SUPPLIER_CAPABILITIES]);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(KNOWN_SUPPLIER_CAPABILITIES.length);
  });

  it('also lists a bound capability this UI has never heard of', async () => {
    const exotic: SupplierBinding = { ...enabledOrderBinding, bindingId: 'bind-9', capability: 'BRAND_NEW' };
    await setup([enabledOrderBinding, exotic]);

    // The known list is a display aid, not a filter: a real binding must never vanish.
    expect(component.rows().map(r => r.capability)).toContain('BRAND_NEW');
    expect(component.isKnownCapability('BRAND_NEW')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('BRAND_NEW');
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
    // Every capability without a binding, not just one.
    expect(disabledRows).toHaveLength(KNOWN_SUPPLIER_CAPABILITIES.length - 2);
    expect(disabledRows[0].textContent).toContain('POSITIVITY.BINDINGS.STATUS.NOT_CONFIGURED');
  });

  it('distinguishes enabled, disabled and unbound in the status chip', async () => {
    await setup();
    const rows = component.rows();
    const order = rows.find(r => r.capability === 'ORDER')!;
    const pricat = rows.find(r => r.capability === 'PRICE_CATALOG')!;
    const stock = rows.find(r => r.capability === 'STOCK_REPORT')!;

    expect(component.statusLabelKey(order)).toBe('POSITIVITY.BINDINGS.STATUS.ENABLED');
    expect(component.statusLabelKey(pricat)).toBe('POSITIVITY.BINDINGS.STATUS.DISABLED');
    expect(component.statusLabelKey(stock)).toBe('POSITIVITY.BINDINGS.STATUS.NOT_CONFIGURED');
  });

  // ── Open unions: version and family are comboboxes, not closed dropdowns ────

  it('offers version and family as free-text comboboxes with suggestions', async () => {
    await setup();
    component.startCreate(component.rows()[0]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const version = host.querySelector<HTMLInputElement>('#binding-version');
    const family = host.querySelector<HTMLInputElement>('#binding-family');

    // A <select> here would reject a valid key the backend has just registered.
    expect(version?.tagName).toBe('INPUT');
    expect(version?.getAttribute('list')).toBe('binding-version-options');
    expect(family?.tagName).toBe('INPUT');
    expect(host.querySelector('#binding-version-options')?.tagName).toBe('DATALIST');
  });

  it('suggests the version keys shipped today without restricting entry to them', async () => {
    await setup();

    expect(component.protocolVersionSuggestions).toEqual([
      'A2_5',
      'B2_1',
      'B3_3',
      'B4_0',
      'C1_0',
      'C1_1',
      'C1_2',
      'S2S_V1',
    ]);
  });

  it('submits a version key that is not among the suggestions', async () => {
    await setup();
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
    component.form.patchValue({
      protocolFamily: 'BRAND_NEW_FAMILY',
      protocolVersion: 'Z9_9',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    const payload = service.createBinding.mock.calls[0][1] as Record<string, unknown>;
    expect(payload['protocolVersion']).toBe('Z9_9');
    expect(payload['protocolFamily']).toBe('BRAND_NEW_FAMILY');
  });

  it('carries the capture level through, and omits it to accept the deployment default', async () => {
    await setup();
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
      captureLevel: 'METADATA_ONLY',
    });
    component.save();

    expect(service.createBinding.mock.calls[0][1]).toMatchObject({
      captureLevel: 'METADATA_ONLY',
    });

    service.createBinding.mockClear();
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
      captureLevel: '',
    });
    component.save();

    expect(
      (service.createBinding.mock.calls[0][1] as Record<string, unknown>)['captureLevel'],
    ).toBeUndefined();
  });

  it('pre-selects the capability when configuring an unbound row', async () => {
    await setup();
    const stockRow = component.rows().find(r => r.capability === 'STOCK_REPORT')!;
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
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
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
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
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
        httpError(400, { fieldErrors: [{ field: 'authConfigName', message: 'must exist' }] }),
      ),
    );
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('authConfigName')).toBe(
      'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
    );
  });

  it('maps a malformed cron 400 to the cronSchedule field', async () => {
    await setup();
    service.createBinding.mockReturnValue(
      throwError(() =>
        httpError(400, { fieldErrors: [{ field: 'schedule', message: 'invalid cron' }] }),
      ),
    );
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
      cronSchedule: 'not a cron',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.fieldError('schedule')).toBe('POSITIVITY.ERROR.FIELD.CRON_MALFORMED');
  });

  it('reports a 409 as its own conflict state, distinct from a generic failure', async () => {
    await setup();
    service.createBinding.mockReturnValue(throwError(() => httpError(409)));
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
    component.form.patchValue({
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B2_1',
      baseUrl: 'https://edi.example.com',
      authRef: 'michelin-prod',
    });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(component.conflict()).toBe(true);
  });

  it('reports a 409 on a YAML profile as the source-of-truth lock', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    component['handleMutationError'](httpError(409), 'POSITIVITY.BINDINGS.ERROR.SAVE');

    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT_YAML');
  });

  it('treats a 5xx save as retryable with both state and errorKey set', async () => {
    await setup();
    service.createBinding.mockReturnValue(throwError(() => httpError(502)));
    component.startCreate(component.rows().find(r => r.capability === 'STOCK_REPORT')!);
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

  it('shows the write controls disabled with a stated reason rather than hiding them', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#bindings-readonly-reason')?.textContent).toContain(
      'POSITIVITY.COMMON.YAML_MANAGED_READONLY',
    );

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('tbody button'));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(b => b.disabled)).toBe(true);
    expect(buttons.every(b => b.getAttribute('aria-describedby') === 'bindings-readonly-reason')).toBe(
      true,
    );
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
