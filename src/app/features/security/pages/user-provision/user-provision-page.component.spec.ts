import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { SecurityRole } from '../../models/security.models';
import { SecurityService } from '../../services/security.service';
import { UserProvisionPageComponent } from './user-provision-page.component';

const mockRoles: SecurityRole[] = [
  { name: 'MANAGER', description: 'Store manager' },
  { name: 'CASHIER', description: 'Cashier' },
];

const activatedRouteStub = {
  snapshot: {
    queryParamMap: {
      get: (key: string) => (key === 'personId' ? 'person-001' : null),
    },
  },
};

describe('UserProvisionPageComponent', () => {
  let fixture: ComponentFixture<UserProvisionPageComponent>;
  let component: UserProvisionPageComponent;

  const securityServiceStub = {
    getAllRoles: vi.fn(),
    createUser: vi.fn(),
  };

  beforeEach(async () => {
    securityServiceStub.getAllRoles.mockReturnValue(of(mockRoles));
    securityServiceStub.createUser.mockReturnValue(of({ userId: 'u-001' }));

    await TestBed.configureTestingModule({
      imports: [UserProvisionPageComponent],
      providers: [
        provideRouter([]),
        { provide: SecurityService, useValue: securityServiceStub },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProvisionPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('T1: shows loading-indicator while getAllRoles is pending', () => {
    securityServiceStub.getAllRoles.mockReturnValue(NEVER);
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('[data-testid="loading-indicator"]');
    expect(el).toBeTruthy();
  });

  it('T2: shows linked-person-banner when personId is set from route query param', () => {
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="linked-person-banner"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('person-001');
  });

  it('T3: shows error text when getAllRoles fails', () => {
    securityServiceStub.getAllRoles.mockReturnValue(throwError(() => new Error('server error')));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Failed to load roles.');
  });

  it('T4: populates role-select options after successful load', () => {
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('[data-testid="role-select"]');
    expect(select).toBeTruthy();
    const optionTexts: string[] = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).textContent!.trim(),
    );
    expect(optionTexts).toContain('MANAGER');
    expect(optionTexts).toContain('CASHIER');
  });

  it('T5: does not call createUser when form is invalid on submit', () => {
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="provision-submit-btn"]',
    );
    btn.click();

    expect(securityServiceStub.createUser).not.toHaveBeenCalled();
  });

  it('T6: shows field-error-username when username is touched and invalid', () => {
    fixture.detectChanges();

    component.form.get('username')!.markAsTouched();
    fixture.detectChanges();

    const errorEl = fixture.nativeElement.querySelector('[data-testid="field-error-username"]');
    expect(errorEl).toBeTruthy();
  });

  it('T7: calls createUser with correct body including personId on valid submit', () => {
    fixture.detectChanges();

    component.form.setValue({ username: 'test@example.com', roleId: 'MANAGER' });
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="provision-submit-btn"]',
    );
    btn.click();

    expect(securityServiceStub.createUser).toHaveBeenCalledWith({
      username: 'test@example.com',
      roleId: 'MANAGER',
      personId: 'person-001',
    });
  });

  it('T8: shows provision-success-state with userId after createUser succeeds', () => {
    securityServiceStub.createUser.mockReturnValue(of({ userId: 'u-999' }));
    fixture.detectChanges();

    component.form.setValue({ username: 'test@example.com', roleId: 'MANAGER' });
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="provision-submit-btn"]',
    );
    btn.click();
    fixture.detectChanges();

    const successEl = fixture.nativeElement.querySelector('[data-testid="provision-success-state"]');
    expect(successEl).toBeTruthy();
    expect(successEl.textContent).toContain('u-999');
  });

  it('T9: shows generic error when createUser fails without fieldErrors', () => {
    securityServiceStub.createUser.mockReturnValue(throwError(() => new Error('network error')));
    fixture.detectChanges();

    component.form.setValue({ username: 'test@example.com', roleId: 'MANAGER' });
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="provision-submit-btn"]',
    );
    btn.click();
    fixture.detectChanges();

    expect(component.error()).toContain('Failed to provision user.');
  });

  it('T10: shows field-level username error when createUser returns fieldErrors', () => {
    securityServiceStub.createUser.mockReturnValue(
      throwError(() => ({ error: { fieldErrors: { username: 'Taken' } } })),
    );
    fixture.detectChanges();

    component.form.setValue({ username: 'test@example.com', roleId: 'MANAGER' });
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="provision-submit-btn"]',
    );
    btn.click();
    fixture.detectChanges();

    const errorEl = fixture.nativeElement.querySelector('[data-testid="field-error-username"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Taken');
  });
});
