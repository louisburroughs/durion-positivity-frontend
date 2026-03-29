import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { WorkSessionSubmitPageComponent } from './work-session-submit-page.component';
import { PeopleService } from '../../services/people.service';

describe('WorkSessionSubmitPageComponent', () => {
  let fixture: ComponentFixture<WorkSessionSubmitPageComponent>;
  let component: WorkSessionSubmitPageComponent;
  let peopleService: { submitWorkSession: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    peopleService = {
      submitWorkSession: vi.fn().mockReturnValue(of({ correlationId: 'CORR-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [WorkSessionSubmitPageComponent],
      providers: [
        { provide: PeopleService, useValue: peopleService },
        { provide: ActivatedRoute, useValue: { params: of({ sessionId: 'SESSION-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkSessionSubmitPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders submit job time heading', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toContain('Submit Job Time');
  });

  it('displays session id from route params', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="session-id-display"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('SESSION-1');
  });

  it('shows submit button initially disabled when form invalid (billableMinutes is 0)', () => {
    // The button's [disabled] binding is driven by canSubmit() (state-based), not form validity.
    // Initially submitState='NOT_SUBMITTED' → canSubmit()=true → button is NOT disabled.
    // The form guard fires inside submitJobTime(): markAllAsTouched + early return on invalid.
    const btn = fixture.nativeElement.querySelector('[data-testid="submit-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);

    peopleService.submitWorkSession.mockClear();
    component.submitJobTime(); // billableMinutes=0 → form invalid → returns early
    fixture.detectChanges();

    expect(component.submitState()).toBe('NOT_SUBMITTED');
    expect(peopleService.submitWorkSession).not.toHaveBeenCalled();
  });

  it('submits successfully and shows result panel', () => {
    component.submitForm.controls.billableMinutes.setValue(120);
    component.submitForm.controls.breakMinutes.setValue(15);
    component.submitForm.controls.submittedAt.setValue(new Date().toISOString());
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="submit-btn"]').click();
    fixture.detectChanges();

    const resultPanel = fixture.nativeElement.querySelector('[data-testid="result-panel"]');
    expect(resultPanel).toBeTruthy();
  });

  it('shows correlation id after successful submit', () => {
    component.submitForm.controls.billableMinutes.setValue(120);
    component.submitForm.controls.breakMinutes.setValue(15);
    component.submitForm.controls.submittedAt.setValue(new Date().toISOString());

    component.submitJobTime();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('[data-testid="correlation-id"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('CORR-1');
  });

  it('shows error panel when submit fails', () => {
    peopleService.submitWorkSession.mockReturnValue(
      throwError(() => ({ error: { code: 'ERR', message: 'Fail', correlationId: 'CORR-2' } })),
    );
    component.submitForm.controls.billableMinutes.setValue(120);
    component.submitForm.controls.breakMinutes.setValue(15);
    component.submitForm.controls.submittedAt.setValue(new Date().toISOString());

    component.submitJobTime();
    fixture.detectChanges();

    const errorPanel = fixture.nativeElement.querySelector('[data-testid="error-panel"]');
    expect(errorPanel).toBeTruthy();
  });

  it('shows error code in result panel on failure', () => {
    peopleService.submitWorkSession.mockReturnValue(
      throwError(() => ({ error: { code: 'ERR', message: 'Fail', correlationId: 'CORR-2' } })),
    );
    component.submitForm.controls.billableMinutes.setValue(120);
    component.submitForm.controls.breakMinutes.setValue(15);
    component.submitForm.controls.submittedAt.setValue(new Date().toISOString());

    component.submitJobTime();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('[data-testid="error-code"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('ERR');
  });

  it('submitState is SUBMITTED after successful submit', () => {
    component.submitForm.controls.billableMinutes.setValue(120);
    component.submitForm.controls.breakMinutes.setValue(15);
    component.submitForm.controls.submittedAt.setValue(new Date().toISOString());

    component.submitJobTime();
    fixture.detectChanges();

    expect(component.submitState()).toBe('SUBMITTED');
  });

  it('canSubmit is false when SUBMITTING', () => {
    peopleService.submitWorkSession.mockReturnValue(NEVER);
    component.submitForm.controls.billableMinutes.setValue(120);
    component.submitForm.controls.breakMinutes.setValue(15);
    component.submitForm.controls.submittedAt.setValue(new Date().toISOString());

    component.submitJobTime();
    fixture.detectChanges();

    expect(component.canSubmit()).toBe(false);
  });
});
