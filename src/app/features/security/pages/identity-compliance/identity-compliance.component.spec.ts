import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { IdentityComplianceComponent } from './identity-compliance.component';
import { IdentityComplianceService } from '../../services/identity-compliance.service';
import { IdentityComplianceFinding } from '../../models/identity-compliance.models';

const mockService = {
  findActiveUsersForInactivePersons: vi.fn(),
};

const finding = {
  linkId: 'link-1',
  username: 'jdoe',
  personId: 'person-1',
  personStatus: 'DISABLED',
  personStatusEffectiveAt: '2026-01-01T00:00:00Z',
} as unknown as IdentityComplianceFinding;

describe('IdentityComplianceComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [IdentityComplianceComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: IdentityComplianceService, useValue: mockService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(IdentityComplianceComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready with findings', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([finding]));
    const fixture = TestBed.createComponent(IdentityComplianceComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.state()).toBe('ready');
    expect(component.findings()).toHaveLength(1);
  });

  it('should transition to empty (compliant) when no findings', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(IdentityComplianceComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('empty');
  });

  it('should set error state before errorKey on load failure', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(IdentityComplianceComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.load();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });

  it('maps person statuses to badge severity classes', () => {
    mockService.findActiveUsersForInactivePersons.mockReturnValue(of([]));
    const component = TestBed.createComponent(IdentityComplianceComponent).componentInstance;

    expect(component.badgeClass('DISABLED' as never)).toBe('badge--error');
    expect(component.badgeClass('TERMINATED' as never)).toBe('badge--error');
    expect(component.badgeClass('SUSPENDED' as never)).toBe('badge--warning');
    expect(component.badgeClass('ACTIVE' as never)).toBe('badge--neutral');
  });
});
