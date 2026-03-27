import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { SecurityService } from '../../../services/security.service';
import { RolesListPageComponent } from './roles-list-page.component';

describe('RolesListPageComponent', () => {
  let fixture: ComponentFixture<RolesListPageComponent>;
  let component: RolesListPageComponent;

  const securityServiceStub = {
    getAllRoles: vi.fn().mockReturnValue(of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 20, totalPages: 0 })),
    createRole: vi.fn().mockReturnValue(of({ name: 'NEW_ROLE' })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolesListPageComponent],
      providers: [
        provideRouter([]),
        { provide: SecurityService, useValue: securityServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RolesListPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ngOnInit / loadRoles()', () => {
    it('populates roles() signal with results from service on init', () => {
      securityServiceStub.getAllRoles.mockReturnValueOnce(
        of({
          results: [{ name: 'ROLE_ADMIN' }, { name: 'ROLE_VIEW' }],
          totalCount: 2,
          pageNumber: 0,
          pageSize: 20,
          totalPages: 1,
        }),
      );
      fixture.detectChanges();

      expect(component.roles().length).toBe(2);
      expect(component.roles()[0].name).toBe('ROLE_ADMIN');
    });

    it('shows loading state while service is pending', () => {
      securityServiceStub.getAllRoles.mockReturnValueOnce(new Subject());
      fixture.detectChanges();

      expect(component.loading()).toBe(true);
      const el = fixture.nativeElement.querySelector('.state-panel');
      expect(el).toBeTruthy();
    });

    it('shows empty state when roles() is empty and not loading', () => {
      securityServiceStub.getAllRoles.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 20, totalPages: 0 }),
      );
      fixture.detectChanges();

      expect(component.roles().length).toBe(0);
      expect(component.loading()).toBe(false);
      const el = fixture.nativeElement.querySelector('.empty-state');
      expect(el).toBeTruthy();
    });

    it('sets error signal when service errors', () => {
      securityServiceStub.getAllRoles.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      expect(component.error()).toBe('Server error');
    });

    it('sets loading to false after error', () => {
      securityServiceStub.getAllRoles.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('clears stale roles and totalPages when service errors after previous load', () => {
      fixture.detectChanges();

      component.roles.set([{ name: 'OLD_ROLE' } as any]);
      component.totalPages.set(3);

      securityServiceStub.getAllRoles.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Reload failed' } })),
      );
      component.loadRoles();

      expect(component.roles()).toEqual([]);
      expect(component.totalPages()).toBe(0);
    });

    // T7: non-empty searchTerm with matching results → totalPages overridden to 1
    it('T7: when searchTerm matches results, totalPages() is 1 regardless of server totalPages', () => {
      fixture.detectChanges();

      securityServiceStub.getAllRoles.mockReturnValueOnce(
        of({
          results: [{ name: 'admin-role' }],
          totalCount: 1,
          pageNumber: 0,
          pageSize: 20,
          totalPages: 5,
        }),
      );
      component.searchTerm.set('admin');
      component.loadRoles();

      expect(component.totalPages()).toBe(1);
      expect(component.roles().length).toBe(1);
      expect(component.roles()[0].name).toBe('admin-role');
    });

    // T8: non-empty searchTerm with no matches → totalPages is 0 and roles() is empty
    it('T8: when searchTerm has no matches, totalPages() is 0 and roles() is empty', () => {
      fixture.detectChanges();

      securityServiceStub.getAllRoles.mockReturnValueOnce(
        of({
          results: [{ name: 'admin-role' }],
          totalCount: 1,
          pageNumber: 0,
          pageSize: 20,
          totalPages: 5,
        }),
      );
      component.searchTerm.set('zzz-no-match');
      component.loadRoles();

      expect(component.totalPages()).toBe(0);
      expect(component.roles()).toEqual([]);
    });
  });

  describe('modal state', () => {
    beforeEach(() => fixture.detectChanges());

    it('openCreateModal() sets showCreateModal() to true', () => {
      expect(component.showCreateModal()).toBe(false);
      component.openCreateModal();
      expect(component.showCreateModal()).toBe(true);
    });

    it('closeCreateModal() sets showCreateModal() to false', () => {
      component.openCreateModal();
      component.closeCreateModal();
      expect(component.showCreateModal()).toBe(false);
    });

    it('closeCreateModal() resets newRoleName, newRoleDescription, and createError', () => {
      component.newRoleName.set('SOME_ROLE');
      component.newRoleDescription.set('desc');
      component.createError.set('some error');
      component.closeCreateModal();

      expect(component.newRoleName()).toBe('');
      expect(component.newRoleDescription()).toBe('');
      expect(component.createError()).toBeNull();
    });
  });

  describe('submitCreate()', () => {
    beforeEach(() => fixture.detectChanges());

    it('with valid name calls securityService.createRole and resets modal', () => {
      component.openCreateModal();
      component.newRoleName.set('ROLE_SUPERVISOR');
      component.submitCreate();

      expect(securityServiceStub.createRole).toHaveBeenCalledWith({
        name: 'ROLE_SUPERVISOR',
        description: undefined,
      });
      expect(component.showCreateModal()).toBe(false);
    });

    it('with empty name sets createError and does not call createRole', () => {
      component.newRoleName.set('');
      component.submitCreate();

      expect(securityServiceStub.createRole).not.toHaveBeenCalled();
      expect(component.createError()).toBeTruthy();
    });

    it('with whitespace-only name sets createError and does not call createRole', () => {
      component.newRoleName.set('   ');
      component.submitCreate();

      expect(securityServiceStub.createRole).not.toHaveBeenCalled();
      expect(component.createError()).toBeTruthy();
    });

    it('reloads roles after successful create', () => {
      securityServiceStub.getAllRoles.mockClear();
      component.newRoleName.set('ROLE_NEW');
      component.submitCreate();

      expect(securityServiceStub.getAllRoles).toHaveBeenCalled();
    });

    it('sets createError when service returns an error', () => {
      component.openCreateModal();
      component.newRoleName.set('ROLE_FAIL');
      securityServiceStub.createRole.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Role already exists' } })),
      );
      component.submitCreate();

      expect(component.createError()).toBe('Role already exists');
      expect(component.showCreateModal()).toBe(true);
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      securityServiceStub.getAllRoles.mockReturnValue(
        of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 20, totalPages: 3 }),
      );
      fixture.detectChanges();
      securityServiceStub.getAllRoles.mockClear();
    });

    it('nextPage() increments page() signal and reloads', () => {
      securityServiceStub.getAllRoles.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 3 }),
      );
      component.nextPage();
      expect(component.page()).toBe(1);
      expect(securityServiceStub.getAllRoles).toHaveBeenCalledWith(1, 20);
    });

    it('nextPage() does nothing when already at last page', () => {
      component.totalPages.set(1);
      component.nextPage();
      expect(component.page()).toBe(0);
      expect(securityServiceStub.getAllRoles).not.toHaveBeenCalled();
    });

    it('prevPage() decrements page() signal and reloads', () => {
      component.page.set(2);
      component.totalPages.set(3);
      securityServiceStub.getAllRoles.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 3 }),
      );
      component.prevPage();
      expect(component.page()).toBe(1);
      expect(securityServiceStub.getAllRoles).toHaveBeenCalledWith(1, 20);
    });

    it('prevPage() does nothing when page is 0', () => {
      component.page.set(0);
      component.prevPage();
      expect(component.page()).toBe(0);
      expect(securityServiceStub.getAllRoles).not.toHaveBeenCalled();
    });
  });

  describe('navigateToDetail()', () => {
    beforeEach(() => fixture.detectChanges());

    it('calls router.navigate with the role name segment', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate');

      component.navigateToDetail({ name: 'ROLE_ADMIN' } as any);

      expect(spy).toHaveBeenCalledWith(['/app/security/roles', 'ROLE_ADMIN']);
    });
  });
});
