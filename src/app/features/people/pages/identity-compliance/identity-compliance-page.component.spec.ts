import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { InactivePersonActiveUserResponsePersonStatusEnum } from '@durion-sdk/people';
import { IdentityCompliancePageComponent } from './identity-compliance-page.component';
import { IdentityComplianceService } from '../../services/identity-compliance.service';
import { IdentityComplianceFinding } from '../../models/identity-compliance.models';

const mockService = {
  findActiveUsersForInactivePersons: vi.fn(),
};

const finding: IdentityComplianceFinding = {
  linkId: '01960012-0000-7000-8000-000000000001',
  username: 'jdoe',
  personId: '01960011-0000-7000-8000-000000000001',
  personStatus: InactivePersonActiveUserResponsePersonStatusEnum.Disabled,
  personStatusEffectiveAt: '2026-01-01T00:00:00Z',
};

describe('IdentityCompliancePageComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [IdentityCompliancePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: IdentityComplianceService, useValue: mockService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(IdentityCompliancePageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready with findings', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([finding]));
    const fixture = TestBed.createComponent(IdentityCompliancePageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.state()).toBe('ready');
    expect(component.findings()).toHaveLength(1);
  });

  it('should transition to empty (compliant) when no findings', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(IdentityCompliancePageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('empty');
  });

  it('should set error state before errorKey on load failure', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(IdentityCompliancePageComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.load();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.IDENTITY_COMPLIANCE.ERROR.LOAD');
    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });

  it('maps person statuses to badge severity classes', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([]));
    const component = TestBed.createComponent(IdentityCompliancePageComponent).componentInstance;

    expect(component.badgeClass(InactivePersonActiveUserResponsePersonStatusEnum.Disabled)).toBe('badge--error');
    expect(component.badgeClass(InactivePersonActiveUserResponsePersonStatusEnum.Terminated)).toBe('badge--error');
    expect(component.badgeClass(InactivePersonActiveUserResponsePersonStatusEnum.Suspended)).toBe('badge--warning');
    expect(component.badgeClass(InactivePersonActiveUserResponsePersonStatusEnum.Active)).toBe('badge--neutral');
    expect(component.badgeClass(undefined)).toBe('badge--neutral');
  });
});
