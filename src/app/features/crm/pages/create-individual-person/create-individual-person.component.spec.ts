import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { CreateIndividualPersonComponent } from './create-individual-person.component';
import { CrmService } from '../../services/crm.service';

const crmServiceStub = { createPerson: vi.fn() };
const routerStub = { navigate: vi.fn() };

describe('CreateIndividualPersonComponent', () => {
  let fixture: ComponentFixture<CreateIndividualPersonComponent>;
  let component: CreateIndividualPersonComponent;

  const setup = async () => {
    await TestBed.configureTestingModule({
      imports: [CreateIndividualPersonComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: Router, useValue: routerStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(CreateIndividualPersonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const fillRequiredFields = () => {
    component.form.controls.firstName.setValue('Jamie');
    component.form.controls.lastName.setValue('Rivera');
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('creates the component in the idle state', async () => {
    await setup();
    expect(component.state()).toBe('idle');
    expect(component.isIdle).toBe(true);
  });

  it('does not submit an invalid form', async () => {
    await setup();
    component.submit();
    expect(crmServiceStub.createPerson).not.toHaveBeenCalled();
  });

  it('submits the trimmed payload and moves to success', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(of({ personId: 'person-1' }));

    component.submit();

    expect(crmServiceStub.createPerson).toHaveBeenCalledWith({
      firstName: 'Jamie',
      lastName: 'Rivera',
      email: undefined,
      phone: undefined,
    });
    expect(component.state()).toBe('success');
    expect(component.isSuccess).toBe(true);
    expect(component.createdPersonId()).toBe('person-1');
  });

  it('ignores a resubmit while one is already submitting', async () => {
    await setup();
    fillRequiredFields();
    const subject = new Subject<{ personId: string }>();
    crmServiceStub.createPerson.mockReturnValue(subject.asObservable());

    component.submit();
    expect(component.state()).toBe('submitting');
    component.submit();

    expect(crmServiceStub.createPerson).toHaveBeenCalledTimes(1);

    subject.next({ personId: 'person-2' });
    subject.complete();
  });

  it('routes a 403 to access-denied', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(throwError(() => ({ status: 403 })));

    component.submit();

    expect(component.state()).toBe('access-denied');
    expect(component.isAccessDenied).toBe(true);
  });

  it('surfaces the server message on a non-403 failure', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'Duplicate email on file' } })),
    );

    component.submit();

    expect(component.state()).toBe('error');
    expect(component.serverError()).toBe('Duplicate email on file');
  });

  it('falls back to the translated failure message when the server sends none', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(throwError(() => ({ status: 500 })));

    component.submit();

    expect(component.serverError()).toContain('Person creation failed');
  });

  it('resets to idle on createAnother()', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(of({ personId: 'person-3' }));
    component.submit();

    component.createAnother();

    expect(component.state()).toBe('idle');
    expect(component.createdPersonId()).toBeNull();
    expect(component.form.controls.firstName.value).toBe('');
  });

  it('navigates to the created person via viewPerson()', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(of({ personId: 'person-4' }));
    component.submit();

    component.viewPerson();

    expect(routerStub.navigate).toHaveBeenCalledWith(['/app/crm/person', 'person-4']);
  });

  it('viewPerson() is a no-op when nothing has been created', async () => {
    await setup();
    component.viewPerson();
    expect(routerStub.navigate).not.toHaveBeenCalled();
  });

  it('copyPersonId() reports an unsupported clipboard without throwing', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(of({ personId: 'person-5' }));
    component.submit();

    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    component.copyPersonId();

    expect(component.serverError()).toContain('Clipboard is not available');
    expect(component.copied()).toBe(false);

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('copyPersonId() flips copied() on a successful write, resetting after the timeout', async () => {
    vi.useFakeTimers();
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(of({ personId: 'person-6' }));
    component.submit();

    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    component.copyPersonId();
    await vi.runAllTimersAsync();

    expect(writeText).toHaveBeenCalledWith('person-6');
    expect(component.copied()).toBe(false);

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    vi.useRealTimers();
  });

  it('copyPersonId() surfaces a clipboard write failure', async () => {
    await setup();
    fillRequiredFields();
    crmServiceStub.createPerson.mockReturnValue(of({ personId: 'person-7' }));
    component.submit();

    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    component.copyPersonId();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.serverError()).toContain('Unable to copy ID');

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });
});
