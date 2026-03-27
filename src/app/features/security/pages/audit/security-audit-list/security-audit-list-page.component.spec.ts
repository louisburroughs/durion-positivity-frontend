import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SecurityAuditListPageComponent } from './security-audit-list-page.component';

describe('SecurityAuditListPageComponent', () => {
  let fixture: ComponentFixture<SecurityAuditListPageComponent>;
  let component: SecurityAuditListPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecurityAuditListPageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SecurityAuditListPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('state() signal is "coming-soon"', () => {
    expect(component.state()).toBe('coming-soon');
  });

  it('renders the coming-soon panel', () => {
    const panel = fixture.nativeElement.querySelector('.coming-soon-panel');
    expect(panel).toBeTruthy();
  });

  it('renders "Security Audit Log" heading', () => {
    const heading = fixture.nativeElement.querySelector('#security-audit-title');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toContain('Security Audit Log');
  });
});
