import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierAuthPanelComponent } from './supplier-auth-panel.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierAuthConfig,
  SupplierApiErrorBody,
} from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const basicConfig: SupplierAuthConfig = {
  authConfigId: 'auth-1',
  authRef: 'michelin-prod',
  authType: 'BASIC_PLUS_APIKEY',
  usernameRef: 'env:MICHELIN_EDI_USER',
  passwordRef: 'env:MICHELIN_EDI_PASSWORD',
  apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
};

const oauthConfig: SupplierAuthConfig = {
  authConfigId: 'auth-2',
  authRef: 'oauth-sandbox',
  authType: 'OAUTH2_CLIENT_CREDENTIALS',
  clientIdRef: 'env:OAUTH_CLIENT_ID',
  clientSecretRef: 'env:OAUTH_CLIENT_SECRET',
  tokenUrl: 'https://auth.example.com/token',
  scope: 'catalog.read',
};

function httpError(status: number, body?: SupplierApiErrorBody): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error: body ?? null });
}

describe('SupplierAuthPanelComponent', () => {
  let fixture: ComponentFixture<SupplierAuthPanelComponent>;
  let component: SupplierAuthPanelComponent;
  let service: {
    listAuthConfigs: ReturnType<typeof vi.fn>;
    createAuthConfig: ReturnType<typeof vi.fn>;
    updateAuthConfig: ReturnType<typeof vi.fn>;
    deleteAuthConfig: ReturnType<typeof vi.fn>;
  };

  async function setup(configs: SupplierAuthConfig[] = [basicConfig]): Promise<void> {
    service = {
      listAuthConfigs: vi.fn().mockReturnValue(of(configs)),
      createAuthConfig: vi.fn().mockReturnValue(of(basicConfig)),
      updateAuthConfig: vi.fn().mockReturnValue(of(basicConfig)),
      deleteAuthConfig: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierAuthPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierProfileService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierAuthPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads auth configs for the profile and reaches ready', async () => {
    await setup();

    expect(service.listAuthConfigs).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
    expect(component.configs()).toHaveLength(1);
  });

  it('reports empty when the profile has no auth configs', async () => {
    await setup([]);

    expect(component.state()).toBe('empty');
  });

  it('sets state to error and the load error key when the list call fails', async () => {
    service = {
      listAuthConfigs: vi.fn().mockReturnValue(throwError(() => httpError(500))),
      createAuthConfig: vi.fn(),
      updateAuthConfig: vi.fn(),
      deleteAuthConfig: vi.fn(),
    };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierAuthPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierProfileService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierAuthPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without leaking data when the API answers 403', async () => {
    service = {
      listAuthConfigs: vi.fn().mockReturnValue(throwError(() => httpError(403))),
      createAuthConfig: vi.fn(),
      updateAuthConfig: vi.fn(),
      deleteAuthConfig: vi.fn(),
    };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierAuthPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierProfileService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierAuthPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(component.configs()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  // ── Credential handling ────────────────────────────────────────────────────

  it('never renders a resolved secret — only the reference strings the API returned', async () => {
    await setup([basicConfig]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('env:MICHELIN_EDI_USER');
    expect(text).toContain('env:MICHELIN_EDI_PASSWORD');
    expect(text).toContain('env:MICHELIN_EDI_APIKEY');
    // Every rendered reference carries a resolution scheme; no bare value leaks.
    for (const code of Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.auth-panel__ref'),
    )) {
      expect(code.textContent?.trim()).toMatch(/^(env|secret|vault):/);
    }
  });

  it('offers no password-typed input — there is no secret to type, only a reference', async () => {
    await setup();
    component.startCreate();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('input[type="password"]')).toHaveLength(0);
    expect(host.querySelector('#auth-passwordRef')?.getAttribute('type')).toBe('text');
  });

  it('sends only *Ref reference strings in the create payload, never a plaintext credential', async () => {
    await setup();
    component.startCreate();
    component.form.patchValue({
      authRef: 'michelin-prod',
      authType: 'BASIC_PLUS_APIKEY',
      usernameRef: 'env:MICHELIN_EDI_USER',
      passwordRef: 'env:MICHELIN_EDI_PASSWORD',
      apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
    });
    component.save();

    const payload = service.createAuthConfig.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({
      authRef: 'michelin-prod',
      authType: 'BASIC_PLUS_APIKEY',
      usernameRef: 'env:MICHELIN_EDI_USER',
      passwordRef: 'env:MICHELIN_EDI_PASSWORD',
      apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
    });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('authConfigId');
  });

  it('shows only the fields that belong to the selected auth type', async () => {
    await setup();
    component.startCreate();

    expect(component.credentialFields()).toEqual(['usernameRef', 'passwordRef', 'apiKeyRef']);
    expect(component.plainFields()).toEqual([]);

    component.form.controls.authType.setValue('OAUTH2_CLIENT_CREDENTIALS');
    expect(component.credentialFields()).toEqual(['clientIdRef', 'clientSecretRef']);
    expect(component.plainFields()).toEqual(['tokenUrl', 'scope']);

    component.form.controls.authType.setValue('BEARER');
    expect(component.credentialFields()).toEqual(['tokenRef']);
  });

  it('omits controls that do not apply to the selected type from the payload', async () => {
    await setup();
    component.startCreate();
    component.form.patchValue({
      authRef: 'bearer-ref',
      usernameRef: 'env:LEFTOVER',
      tokenRef: 'env:BEARER_TOKEN',
    });
    component.form.controls.authType.setValue('BEARER');
    component.save();

    const payload = service.createAuthConfig.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({
      authRef: 'bearer-ref',
      authType: 'BEARER',
      tokenRef: 'env:BEARER_TOKEN',
    });
  });

  it('edits an existing config through the update endpoint', async () => {
    await setup([oauthConfig]);
    component.startEdit(oauthConfig);
    component.form.patchValue({ scope: 'catalog.write' });
    component.save();

    expect(service.updateAuthConfig).toHaveBeenCalledWith(
      PROFILE_ID,
      'auth-2',
      expect.objectContaining({ authRef: 'oauth-sandbox', scope: 'catalog.write' }),
    );
  });

  it('maps a save-time 400 to the offending field and sets both state and errorKey', async () => {
    await setup();
    service.createAuthConfig.mockReturnValue(
      throwError(() =>
        httpError(400, { fieldErrors: [{ field: 'authRef', code: 'AUTH_REF_DUPLICATE' }] }),
      ),
    );
    component.startCreate();
    component.form.patchValue({ authRef: 'dup' });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('authRef')).toBe('POSITIVITY.ERROR.FIELD.AUTH_REF_DUPLICATE');
  });

  it('sets both state and errorKey when a delete fails', async () => {
    await setup();
    service.deleteAuthConfig.mockReturnValue(throwError(() => httpError(500)));
    component.remove(basicConfig);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('does not submit an invalid form', async () => {
    await setup();
    component.startCreate();
    component.save();

    expect(service.createAuthConfig).not.toHaveBeenCalled();
  });

  it('suppresses mutations and action buttons for a YAML-managed profile', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    component.save();
    component.remove(basicConfig);

    expect(service.createAuthConfig).not.toHaveBeenCalled();
    expect(service.deleteAuthConfig).not.toHaveBeenCalled();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.pos-btn--danger')).toBeNull();
  });

  it('associates every visible input with a label (ADR-0029)', async () => {
    await setup();
    component.startCreate();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const inputs = Array.from(host.querySelectorAll('input, select'));
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const id = input.getAttribute('id');
      expect(id, 'every control needs an id to be labelled').toBeTruthy();
      expect(host.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });
});
