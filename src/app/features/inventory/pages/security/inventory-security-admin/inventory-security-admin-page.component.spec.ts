import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { InventorySecurityAdminPageComponent } from './inventory-security-admin-page.component';
import { SecurityService } from '../../../../security/services/security.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { InventoryPermissionEntry } from '../../../models/inventory.models';
import { PagedResponse, SecurityPermission } from '../../../../security/models/security.models';

const mockSecurityService = {
  getAllPermissions: vi.fn(),
};

const mockAuthService = {
  currentUserClaims: signal<{ authorities?: string[]; roles?: string[] } | null>(null),
};

const securityPermissionsFixture: SecurityPermission[] = [
  { permissionKey: 'INVENTORY.VIEW', description: 'View inventory records' },
  { permissionKey: 'INVENTORY.ADJUST', description: 'Adjust inventory quantities' },
  { permissionKey: 'INVENTORY.TRANSFER', description: 'Transfer inventory' },
];

const pagedResponseFixture: PagedResponse<SecurityPermission> = {
  results: securityPermissionsFixture,
  totalCount: 3,
  pageNumber: 0,
  pageSize: 500,
  totalPages: 1,
};

const derivedPermissionsFixture: InventoryPermissionEntry[] = securityPermissionsFixture.map(p => ({
  permissionKey: p.permissionKey,
  description: p.description ?? '',
  category: 'inventory',
  isCurrentUserGranted: false,
}));

async function setupSecurityAdmin() {
  await TestBed.configureTestingModule({
    imports: [InventorySecurityAdminPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: SecurityService, useValue: mockSecurityService },
      { provide: AuthService, useValue: mockAuthService },
    ],
  }).compileComponents();
  return TestBed.createComponent(InventorySecurityAdminPageComponent).componentInstance;
}

describe('InventorySecurityAdminPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService.currentUserClaims.set(null);
  });

  it('renders permission table when state is ready', async () => {
    mockSecurityService.getAllPermissions.mockReturnValue(of(pagedResponseFixture));
    const component = await setupSecurityAdmin();

    expect(component.state()).toBe('ready');
    expect(component.permissions().length).toBe(3);
    expect(component.permissions()[0].permissionKey).toBe('INVENTORY.VIEW');
  });

  it('filterQuery narrows filteredPermissions correctly', async () => {
    mockSecurityService.getAllPermissions.mockReturnValue(of(pagedResponseFixture));
    const component = await setupSecurityAdmin();

    component.setFilterQuery('ADJUST');

    expect(component.filteredPermissions().length).toBe(1);
    expect(component.filteredPermissions()[0].permissionKey).toBe('INVENTORY.ADJUST');
  });

  it('filterQuery is case-insensitive', async () => {
    mockSecurityService.getAllPermissions.mockReturnValue(of(pagedResponseFixture));
    const component = await setupSecurityAdmin();

    component.setFilterQuery('adjust');

    expect(component.filteredPermissions().length).toBe(1);
  });

  it('empty filterQuery returns all permissions', async () => {
    mockSecurityService.getAllPermissions.mockReturnValue(of(pagedResponseFixture));
    const component = await setupSecurityAdmin();

    component.setFilterQuery('ADJUST');
    component.setFilterQuery('');

    expect(component.filteredPermissions().length).toBe(3);
  });

  it('sets error state on 403 response', async () => {
    const forbiddenErr = { status: 403 };
    mockSecurityService.getAllPermissions.mockReturnValue(throwError(() => forbiddenErr));
    const component = await setupSecurityAdmin();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.SECURITY.PERMISSIONS.ERROR.FORBIDDEN');
  });

  it('sets error state on non-403 failure', async () => {
    mockSecurityService.getAllPermissions.mockReturnValue(
      throwError(() => new Error('server error')),
    );
    const component = await setupSecurityAdmin();

    expect(component.permissions().length).toBe(0);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.SECURITY.PERMISSIONS.ERROR.LOAD');
  });
});
