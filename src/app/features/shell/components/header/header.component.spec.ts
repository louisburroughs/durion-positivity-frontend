import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { TenantSummary } from '../../../../core/models/auth.models';

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  const tenant = signal<TenantSummary | null>(null);

  const authStub = {
    tenant,
    currentUserClaims: () => ({ sub: 'demo', exp: 9999999999 }),
    logout: vi.fn(),
  };
  const themeStub = { isDark: () => false, toggle: vi.fn() };
  const localeStub = {
    currentLocale: () => 'en-US',
    localeOptions: [{ code: 'en-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.EN_US' }],
    setLocale: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    tenant.set(null);
    await TestBed.configureTestingModule({
      imports: [HeaderComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: ThemeService, useValue: themeStub },
        { provide: LocaleService, useValue: localeStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
  });

  it('shows no tenant chip until the session tenant is known', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('.tenant-chip')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.user-name')?.textContent).toContain('demo');
  });

  it('shows the tenant display name and slug next to the user once loaded', () => {
    tenant.set({
      tenantId: '01990000-0000-7000-8000-00000000c001',
      slug: 'acme-tire',
      displayName: 'Acme Tire & Auto',
      status: 'ACTIVE',
    });
    fixture.detectChanges();

    const chip = (fixture.nativeElement as HTMLElement).querySelector('.tenant-chip');
    expect(chip).toBeTruthy();
    expect(chip?.querySelector('.tenant-name')?.textContent?.trim()).toBe('Acme Tire & Auto');
    expect(chip?.querySelector('.tenant-slug')?.textContent?.trim()).toBe('acme-tire');
    // The visible text is the accessible name; an aria-label would replace it.
    expect(chip?.getAttribute('aria-label')).toBeNull();
    expect(chip?.querySelector('.sr-only')?.textContent?.trim()).toBe('SHELL.HEADER.TENANT_LABEL');
  });

  it('drops the chip again when the tenant is cleared on logout', () => {
    tenant.set({ tenantId: 't', slug: 'acme-tire', displayName: 'Acme', status: 'ACTIVE' });
    fixture.detectChanges();
    tenant.set(null);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.tenant-chip')).toBeNull();
  });
});
