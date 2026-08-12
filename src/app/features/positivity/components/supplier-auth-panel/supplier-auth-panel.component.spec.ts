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

// The contract's read model is {authConfigId, name, type, apiKeyHeader} — it
// carries no credential material at all, so there is nothing here to redact.
const basicConfig: SupplierAuthConfig = {
  authConfigId: 'auth-1',
  authRef: 'michelin-prod',
  authType: 'BASIC_PLUS_APIKEY',
  apiKeyHeader: 'X-Api-Key',
};

const oauthConfig: SupplierAuthConfig = {
  authConfigId: 'auth-2',
  authRef: 'oauth-sandbox',
  authType: 'OAUTH2_CLIENT_CREDENTIALS',
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

  it('renders no credential material, because the read model carries none', async () => {
    await setup([basicConfig]);
    const view = component.configs()[0] as unknown as Record<string, unknown>;
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // The AuthConfigView type has no *Ref property at all — assert both that the
    // model stays that way and that nothing secret-shaped reaches the DOM.
    // `authRef` is the config's name, not a credential reference.
    expect(
      Object.keys(view).filter(key => key.endsWith('Ref') && key !== 'authRef'),
    ).toEqual([]);
    expect(text).not.toMatch(/\b(env|secret|vault):/);
    expect(text).not.toContain('MICHELIN_EDI_PASSWORD');
  });

  it('renders the API key header name, which is configuration and not a secret', async () => {
    await setup([basicConfig]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('X-Api-Key');
  });

  it('says the adapter default applies when no header name is configured', async () => {
    await setup([oauthConfig]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUTH.TABLE.ADAPTER_DEFAULT',
    );
  });

  it('tells the operator that credential references must be re-entered on edit', async () => {
    await setup([basicConfig]);
    component.startEdit(basicConfig);
    fixture.detectChanges();

    // The backend never discloses them, so there is nothing to pre-fill.
    expect(component.form.getRawValue().usernameRef).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'POSITIVITY.AUTH.FORM.REENTER_HINT',
    );
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
      apiKeyHeader: 'X-Api-Key',
    });
    component.save();

    const payload = service.createAuthConfig.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({
      authRef: 'michelin-prod',
      authType: 'BASIC_PLUS_APIKEY',
      usernameRef: 'env:MICHELIN_EDI_USER',
      passwordRef: 'env:MICHELIN_EDI_PASSWORD',
      apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
      apiKeyHeader: 'X-Api-Key',
    });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('authConfigId');
  });

  it('shows only the fields that belong to the selected auth type', async () => {
    await setup();
    component.startCreate();

    expect(component.credentialFields()).toEqual(['usernameRef', 'passwordRef', 'apiKeyRef']);
    expect(component.plainFields()).toEqual(['apiKeyHeader']);

    // The OAuth2 token endpoint is itself a secret reference in this contract.
    component.form.controls.authType.setValue('OAUTH2_CLIENT_CREDENTIALS');
    expect(component.credentialFields()).toEqual([
      'tokenUrlRef',
      'clientIdRef',
      'clientSecretRef',
    ]);
    expect(component.plainFields()).toEqual([]);

    component.form.controls.authType.setValue('BEARER');
    expect(component.credentialFields()).toEqual(['bearerTokenRef']);
  });

  it('omits controls that do not apply to the selected type from the payload', async () => {
    await setup();
    component.startCreate();
    component.form.patchValue({
      authRef: 'bearer-ref',
      usernameRef: 'env:LEFTOVER',
      bearerTokenRef: 'env:BEARER_TOKEN',
    });
    component.form.controls.authType.setValue('BEARER');
    component.save();

    const payload = service.createAuthConfig.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({
      authRef: 'bearer-ref',
      authType: 'BEARER',
      bearerTokenRef: 'env:BEARER_TOKEN',
    });
  });

  it('edits an existing config through the update endpoint', async () => {
    await setup([oauthConfig]);
    component.startEdit(oauthConfig);
    component.form.patchValue({ clientIdRef: 'env:OAUTH_CLIENT_ID' });
    component.save();

    expect(service.updateAuthConfig).toHaveBeenCalledWith(
      PROFILE_ID,
      'auth-2',
      expect.objectContaining({
        authRef: 'oauth-sandbox',
        clientIdRef: 'env:OAUTH_CLIENT_ID',
      }),
    );
  });

  it('maps a save-time 400 to the offending field and sets both state and errorKey', async () => {
    await setup();
    service.createAuthConfig.mockReturnValue(
      throwError(() =>
        httpError(400, {
          fieldErrors: [{ field: 'name', message: 'already used on this profile' }],
        }),
      ),
    );
    component.startCreate();
    component.form.patchValue({ authRef: 'dup' });
    component.save();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('name')).toBe('POSITIVITY.ERROR.FIELD.AUTH_REF_REQUIRED');
    expect(component.fieldDetail('name')).toBe('already used on this profile');
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

  it('blocks mutations for a YAML-managed profile', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    component.save();
    component.remove(basicConfig);

    expect(service.createAuthConfig).not.toHaveBeenCalled();
    expect(service.deleteAuthConfig).not.toHaveBeenCalled();
  });

  it('shows the write controls disabled with a stated reason, rather than hiding them', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#auth-readonly-reason')?.textContent).toContain(
      'POSITIVITY.COMMON.YAML_MANAGED_READONLY',
    );

    const danger = host.querySelector<HTMLButtonElement>('.pos-btn--danger');
    expect(danger, 'the delete control must remain visible').not.toBeNull();
    expect(danger!.disabled).toBe(true);
    expect(danger!.getAttribute('aria-describedby')).toBe('auth-readonly-reason');
  });

  it('reports a 409 on a YAML profile as the source-of-truth lock', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    component['handleMutationError'](httpError(409), 'POSITIVITY.AUTH.ERROR.SAVE');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT_YAML');
    expect(component.conflict()).toBe(true);
  });

  it('drives the type list off the generated enum rather than a hand-written union', async () => {
    await setup();

    expect(component.authTypes).toEqual([
      'BASIC_PLUS_APIKEY',
      'OAUTH2_CLIENT_CREDENTIALS',
      'BEARER',
    ]);
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
