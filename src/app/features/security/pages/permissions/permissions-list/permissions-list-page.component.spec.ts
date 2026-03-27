import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { SecurityService } from '../../../services/security.service';
import { PermissionsListPageComponent } from './permissions-list-page.component';

describe('PermissionsListPageComponent', () => {
  let fixture: ComponentFixture<PermissionsListPageComponent>;
  let component: PermissionsListPageComponent;

  const securityServiceStub = {
    getAllPermissions: vi.fn().mockReturnValue(
      of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 100, totalPages: 0 }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PermissionsListPageComponent],
      providers: [
        { provide: SecurityService, useValue: securityServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PermissionsListPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ngOnInit / loadPermissions()', () => {
    it('populates permissions() signal with results on init', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({
          results: [{ permissionKey: 'PERM_READ' }, { permissionKey: 'PERM_WRITE' }],
          totalCount: 2,
          pageNumber: 0,
          pageSize: 100,
          totalPages: 1,
        }),
      );
      fixture.detectChanges();

      expect(component.permissions().length).toBe(2);
      expect(component.permissions()[0].permissionKey).toBe('PERM_READ');
    });

    it('shows loading state when service is pending', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(new Subject());
      fixture.detectChanges();

      expect(component.loading()).toBe(true);
    });

    it('sets error when service errors', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Permission load failed' } })),
      );
      fixture.detectChanges();

      expect(component.error()).toBe('Permission load failed');
      expect(component.loading()).toBe(false);
    });

    it('permissions() is empty array when service returns empty results', () => {
      fixture.detectChanges();

      expect(component.permissions().length).toBe(0);
      expect(component.loading()).toBe(false);
    });

    it('sets loading to false after successful permission load', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({
          results: [{ permissionKey: 'PERM_READ' }],
          totalCount: 1,
          pageNumber: 0,
          pageSize: 100,
          totalPages: 1,
        }),
      );
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('uses fallback error message when err.error.message is absent', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        throwError(() => ({})),
      );
      fixture.detectChanges();

      expect(component.error()).toBe('Failed to load permissions.');
      expect(component.loading()).toBe(false);
    });
  });

  describe('search()', () => {
    it('filters permissions by searchTerm (case-insensitive) and calls service', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({
          results: [
            { permissionKey: 'PERM_READ' },
            { permissionKey: 'PERM_WRITE' },
            { permissionKey: 'ADMIN_DELETE' },
          ],
          totalCount: 3,
          pageNumber: 0,
          pageSize: 100,
          totalPages: 1,
        }),
      );
      component.searchTerm.set('perm');
      fixture.detectChanges();

      // reload is done on init; set stub for next load
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({
          results: [
            { permissionKey: 'PERM_READ' },
            { permissionKey: 'PERM_WRITE' },
            { permissionKey: 'ADMIN_DELETE' },
          ],
          totalCount: 3,
          pageNumber: 0,
          pageSize: 100,
          totalPages: 1,
        }),
      );
      component.search();

      // After search, page is reset to 0 and permissions are filtered by term
      expect(component.page()).toBe(0);
      const filtered = component.permissions().filter(p =>
        p.permissionKey.toLowerCase().includes('perm'),
      );
      expect(filtered.length).toBe(component.permissions().length);
    });

    it('resets page to 0 before reloading', () => {
      fixture.detectChanges();
      component.page.set(2);
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 100, totalPages: 0 }),
      );
      component.search();
      expect(component.page()).toBe(0);
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      securityServiceStub.getAllPermissions.mockReturnValue(
        of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 100, totalPages: 3 }),
      );
      fixture.detectChanges();
      securityServiceStub.getAllPermissions.mockClear();
    });

    it('nextPage() increments page() and reloads', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 3 }),
      );
      component.nextPage();
      expect(component.page()).toBe(1);
      expect(securityServiceStub.getAllPermissions).toHaveBeenCalledWith(1, 100);
    });

    it('nextPage() does nothing when at last page', () => {
      component.totalPages.set(1);
      component.nextPage();
      expect(component.page()).toBe(0);
      expect(securityServiceStub.getAllPermissions).not.toHaveBeenCalled();
    });

    it('prevPage() decrements page() and reloads', () => {
      component.page.set(2);
      component.totalPages.set(3);
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 3 }),
      );
      component.prevPage();
      expect(component.page()).toBe(1);
    });

    it('prevPage() does nothing when page is 0', () => {
      component.page.set(0);
      component.prevPage();
      expect(component.page()).toBe(0);
      expect(securityServiceStub.getAllPermissions).not.toHaveBeenCalled();
    });
  });
});
