import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import {
  ContactPointDtoContactTypeEnum,
  Person,
  PostalAddressDto,
} from '@durion-sdk/people-contact';
import enUS from '../../../../../assets/i18n/en-US.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { PersonProfilePageComponent } from './person-profile-page.component';
import { PeopleService } from '../../services/people.service';
import { AuthService } from '../../../../core/services/auth.service';

/** Pinned literals, not read from PEOPLE_SECTION, so a repointed code fails here. */
const VIEW_PERMISSION = 'people-contact:person:view';
const EDIT_PERMISSION = 'people-contact:person:edit';

const PERSON_ID = '01960011-0000-7000-8000-000000000010';

const person: Person = {
  id: PERSON_ID,
  firstName: 'Dana',
  lastName: 'Okafor',
  username: 'dokafor',
  primaryEmail: 'dana@example.com',
  phoneNumbers: ['+15550100'],
  contactPoints: [
    { contactType: ContactPointDtoContactTypeEnum.Email, value: 'dana@example.com', primary: true },
    { contactType: ContactPointDtoContactTypeEnum.PhoneWork, value: '+15550100', primary: true },
    { contactType: ContactPointDtoContactTypeEnum.PhoneMobile, value: '+15550199', primary: false },
  ],
};

const address: PostalAddressDto = {
  line1: '1 Main St',
  city: 'Springfield',
  region: 'IL',
  postalCode: '62701',
  countryCode: 'US',
};

/** `permissions: null` models a legacy token with no `perm_bits` claim. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};

const stubService = {
  getPersonWithContactPoints: vi.fn(),
  getPersonPostalAddress: vi.fn(),
  updatePerson: vi.fn(),
  replaceContactPoints: vi.fn(),
  putPersonPostalAddress: vi.fn(),
  deletePersonPostalAddress: vi.fn(),
};

describe('PersonProfilePageComponent', () => {
  let fixture: ComponentFixture<PersonProfilePageComponent>;
  let component: PersonProfilePageComponent;
  let el: HTMLElement;
  let params$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const setup = async (
    options: {
      permissions?: string[] | null;
      person?: Observable<Person | null>;
      address?: Observable<PostalAddressDto | null>;
    } = {},
  ) => {
    vi.resetAllMocks();
    params$ = new BehaviorSubject(convertToParamMap({ personId: PERSON_ID }));
    session.permissions = 'permissions' in options
      ? (options.permissions ?? null)
      : [VIEW_PERMISSION, EDIT_PERMISSION];
    stubService.getPersonWithContactPoints.mockReturnValue(options.person ?? of(person));
    stubService.getPersonPostalAddress.mockReturnValue(options.address ?? of(address));
    stubService.updatePerson.mockReturnValue(of(person));
    stubService.replaceContactPoints.mockReturnValue(of(undefined));
    stubService.putPersonPostalAddress.mockReturnValue(of(address));
    stubService.deletePersonPostalAddress.mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [PersonProfilePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params$,
            snapshot: { paramMap: convertToParamMap({ personId: PERSON_ID }) },
          },
        },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(PersonProfilePageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const q = (testId: string) => el.querySelector(`[data-testid="${testId}"]`);

  afterEach(() => {
    fixture?.destroy();
    session.permissions = null;
  });

  it('loads the person, contact points and address into the form', async () => {
    await setup();

    expect(stubService.getPersonWithContactPoints).toHaveBeenCalledWith(PERSON_ID);
    expect(stubService.getPersonPostalAddress).toHaveBeenCalledWith(PERSON_ID);
    expect(component.state()).toBe('ready');
    expect(component.form.controls.firstName.value).toBe('Dana');
    expect(component.contactPoints.length).toBe(3);
    expect(component.form.controls.address.controls.line1.value).toBe('1 Main St');
    expect(el.querySelectorAll('[data-testid="contact-point-row"]').length).toBe(3);
  });

  it('renders identifiers read-only, outside the editable form', async () => {
    await setup();

    expect(q('person-id')?.textContent?.trim()).toBe(PERSON_ID);
    expect(q('person-username')?.textContent?.trim()).toBe('dokafor');
    const form = el.querySelector('form');
    expect(form?.querySelector('[data-testid="person-id"]')).toBeNull();
    expect(Object.keys(component.form.controls)).not.toContain('id');
    expect(Object.keys(component.form.controls)).not.toContain('username');
  });

  it('shows the no-linked-user copy from the shipped bundle when username is absent', async () => {
    await setup({ person: of({ ...person, username: undefined }) });

    expect(q('person-username')?.textContent?.trim()).toBe(enUS.PEOPLE.PERSON_PROFILE.NO_USERNAME);
  });

  it('keeps an empty address blank when the person has none on file', async () => {
    await setup({ address: of(null) });

    expect(component.state()).toBe('ready');
    expect(component.form.controls.address.controls.line1.value).toBe('');
  });

  it('routes a missing person to the not-found error, state before key', async () => {
    await setup({ person: of(null) });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.PERSON_PROFILE.ERROR.NOT_FOUND');
    expect(el.querySelector('form')).toBeNull();
  });

  it('routes a failed read to the load error', async () => {
    await setup({ person: throwError(() => new Error('boom')) });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.PERSON_PROFILE.ERROR.LOAD');
    expect(q('error-panel')?.textContent).toContain(enUS.PEOPLE.PERSON_PROFILE.ERROR.LOAD);
  });

  it('saves names, the full contact-point set and the address in order', async () => {
    await setup();
    component.form.controls.firstName.setValue(' Danielle ');
    component.contactPoints.at(2).controls.value.setValue('+15550200');

    component.save();

    expect(stubService.updatePerson).toHaveBeenCalledWith(PERSON_ID, {
      firstName: 'Danielle',
      lastName: 'Okafor',
      primaryEmail: 'dana@example.com',
      secondaryEmail: undefined,
      phoneNumbers: ['+15550100'],
    });
    expect(stubService.replaceContactPoints).toHaveBeenCalledWith(PERSON_ID, [
      { contactType: ContactPointDtoContactTypeEnum.Email, value: 'dana@example.com', primary: true },
      { contactType: ContactPointDtoContactTypeEnum.PhoneWork, value: '+15550100', primary: true },
      { contactType: ContactPointDtoContactTypeEnum.PhoneMobile, value: '+15550200', primary: false },
    ]);
    expect(stubService.putPersonPostalAddress).toHaveBeenCalledWith(PERSON_ID, {
      line1: '1 Main St',
      line2: undefined,
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      countryCode: 'US',
    });
    expect(component.saveSuccess()).toBe(true);
    fixture.detectChanges();
    // Readback after the write refreshes every signal the initial load populated.
    expect(stubService.getPersonWithContactPoints).toHaveBeenCalledTimes(2);
  });

  it('does not start the contact write until the identity write lands', async () => {
    await setup();
    const identity$ = new Subject<Person>();
    stubService.updatePerson.mockReturnValue(identity$);

    component.save();
    expect(stubService.replaceContactPoints).not.toHaveBeenCalled();
    expect(component.saving()).toBe(true);

    identity$.next(person);
    identity$.complete();
    expect(stubService.replaceContactPoints).toHaveBeenCalled();
  });

  it('does not start the address write until the contact-point write lands', async () => {
    await setup();
    const contacts$ = new Subject<void>();
    stubService.replaceContactPoints.mockReturnValue(contacts$);

    component.save();
    expect(stubService.replaceContactPoints).toHaveBeenCalled();
    expect(stubService.putPersonPostalAddress).not.toHaveBeenCalled();

    contacts$.next();
    contacts$.complete();
    expect(stubService.putPersonPostalAddress).toHaveBeenCalled();
  });

  it('refuses a whitespace-only name, since the payload is trimmed', async () => {
    await setup();
    component.form.controls.lastName.setValue('   ');

    component.save();
    fixture.detectChanges();

    expect(stubService.updatePerson).not.toHaveBeenCalled();
    expect(q('validation-last-name')?.textContent?.trim()).toBe(enUS.PEOPLE.PERSON_PROFILE.ERROR.LAST_NAME_REQUIRED);
  });

  it('clears a success banner when the readback after a save fails', async () => {
    await setup();
    stubService.getPersonWithContactPoints.mockReturnValue(throwError(() => new Error('boom')));

    component.save();
    fixture.detectChanges();

    expect(component.saveSuccess()).toBe(false);
    expect(component.errorKey()).toBe('PEOPLE.PERSON_PROFILE.ERROR.LOAD');
  });

  describe('route change (ADR-0063)', () => {
    const OTHER_ID = '01960011-0000-7000-8000-000000000020';

    it('drops the previous person before the new read lands', async () => {
      await setup();
      const next$ = new Subject<Person | null>();
      stubService.getPersonWithContactPoints.mockReturnValue(next$);

      params$.next(convertToParamMap({ personId: OTHER_ID }));
      fixture.detectChanges();

      expect(stubService.getPersonWithContactPoints).toHaveBeenLastCalledWith(OTHER_ID);
      expect(component.profile()).toBeNull();
      expect(el.querySelector('form')).toBeNull();
      component.save();
      expect(stubService.updatePerson).not.toHaveBeenCalled();
    });

    it('cancels the in-flight write chain when navigating to another person', async () => {
      await setup();
      const identity$ = new Subject<Person>();
      stubService.updatePerson.mockReturnValue(identity$);
      component.save();
      stubService.getPersonWithContactPoints.mockReturnValue(new Subject<Person | null>());

      params$.next(convertToParamMap({ personId: OTHER_ID }));
      fixture.detectChanges();
      expect(identity$.observed).toBe(false);
      identity$.next(person);
      identity$.complete();

      expect(stubService.replaceContactPoints).not.toHaveBeenCalled();
      expect(stubService.putPersonPostalAddress).not.toHaveBeenCalled();
    });

    it('discards a save that completes after navigating to another person', async () => {
      await setup();
      const identity$ = new Subject<Person>();
      stubService.updatePerson.mockReturnValue(identity$);
      component.save();
      stubService.getPersonWithContactPoints.mockReturnValue(new Subject<Person | null>());

      params$.next(convertToParamMap({ personId: OTHER_ID }));
      fixture.detectChanges();
      identity$.next(person);
      identity$.complete();
      fixture.detectChanges();

      expect(component.saveSuccess()).toBe(false);
      expect(component.saving()).toBe(false);
      expect(stubService.getPersonWithContactPoints).toHaveBeenCalledTimes(2);
    });
  });

  it('deletes the address when every address field is cleared', async () => {
    await setup();
    component.form.controls.address.setValue({
      line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: '',
    });

    component.save();

    expect(stubService.deletePersonPostalAddress).toHaveBeenCalledWith(PERSON_ID);
    expect(stubService.putPersonPostalAddress).not.toHaveBeenCalled();
  });

  it('writes no address when none was on file and none was entered', async () => {
    await setup({ address: of(null) });

    component.save();

    expect(stubService.deletePersonPostalAddress).not.toHaveBeenCalled();
    expect(stubService.putPersonPostalAddress).not.toHaveBeenCalled();
    expect(stubService.replaceContactPoints).toHaveBeenCalled();
  });

  it('refuses a partial address without line 1 and country', async () => {
    await setup({ address: of(null) });
    component.form.controls.address.controls.city.setValue('Springfield');

    component.save();
    fixture.detectChanges();

    expect(stubService.updatePerson).not.toHaveBeenCalled();
    expect(q('address-incomplete')?.textContent?.trim()).toBe(enUS.PEOPLE.PERSON_PROFILE.ERROR.ADDRESS_INCOMPLETE);
  });

  it('refuses to save without a first name', async () => {
    await setup();
    component.form.controls.firstName.setValue('');

    component.save();

    expect(stubService.updatePerson).not.toHaveBeenCalled();
  });

  it('refuses a whitespace-only contact value instead of silently dropping the row', async () => {
    await setup();
    component.addContactPoint();
    component.contactPoints.at(3).controls.value.setValue('   ');

    component.save();

    expect(stubService.updatePerson).not.toHaveBeenCalled();
  });

  describe('save in flight (ADR-0063)', () => {
    it('refuses a second submit while the write chain is pending', async () => {
      await setup();
      const identity$ = new Subject<Person>();
      stubService.updatePerson.mockReturnValue(identity$);

      component.save();
      component.save();

      expect(stubService.updatePerson).toHaveBeenCalledTimes(1);
    });

    it('locks the form while saving so edits cannot be lost to the readback', async () => {
      await setup();
      const identity$ = new Subject<Person>();
      stubService.updatePerson.mockReturnValue(identity$);

      component.save();
      fixture.detectChanges();

      expect(component.form.disabled).toBe(true);
      expect((q('save-button') as HTMLButtonElement).disabled).toBe(true);
      expect((q('add-contact-point') as HTMLButtonElement).disabled).toBe(true);

      identity$.next(person);
      identity$.complete();
      fixture.detectChanges();

      expect(component.form.enabled).toBe(true);
    });
  });

  it('makes retained data non-actionable after a failed readback (ADR-0064)', async () => {
    await setup();
    stubService.getPersonWithContactPoints.mockReturnValue(throwError(() => new Error('boom')));
    component.reload();
    fixture.detectChanges();

    expect(component.profile()).not.toBeNull();
    expect(component.form.disabled).toBe(true);
    expect(q('retry-button')).not.toBeNull();

    component.save();
    component.addContactPoint();
    expect(stubService.updatePerson).not.toHaveBeenCalled();
    expect(component.contactPoints.length).toBe(3);
  });

  it('keeps one primary per contact type', async () => {
    await setup();
    component.addContactPoint();
    const added = component.contactPoints.at(3);
    added.controls.value.setValue('alt@example.com');
    added.controls.primary.setValue(true);

    component.onPrimaryChange(3);

    expect(component.contactPoints.at(0).controls.primary.value).toBe(false);
    expect(component.contactPoints.at(1).controls.primary.value).toBe(true);
  });

  it('names each contact row and its remove button by index and type (ADR-0029 §8.12)', async () => {
    await setup();
    const fill = (key: string, index: number, type: string) =>
      key.replace('{{index}}', String(index)).replace('{{type}}', type);
    const types = enUS.PEOPLE.PERSON_PROFILE.CONTACT_TYPE;
    const rows = el.querySelectorAll('[data-testid="contact-point-row"]');
    const removes = el.querySelectorAll('[data-testid="remove-contact-point"]');

    expect(rows[0].getAttribute('role')).toBe('group');
    expect(rows[0].getAttribute('aria-label')).toBe(fill(enUS.PEOPLE.PERSON_PROFILE.CONTACT_ROW_ARIA, 1, types.EMAIL));
    expect(rows[1].getAttribute('aria-label')).toBe(fill(enUS.PEOPLE.PERSON_PROFILE.CONTACT_ROW_ARIA, 2, types.PHONE_WORK));
    expect(removes[2].getAttribute('aria-label')).toBe(fill(enUS.PEOPLE.PERSON_PROFILE.REMOVE_CONTACT_ARIA, 3, types.PHONE_MOBILE));
    // Label in Name: the visible "Remove" text starts the accessible name.
    expect(removes[2].getAttribute('aria-label')?.startsWith(enUS.PEOPLE.PERSON_PROFILE.REMOVE_CONTACT)).toBe(true);
  });

  // WCAG 2.5.3 Label in Name holds per shipped locale (ADR-0029 §8.6). qps-ploc is excluded
  // as in employee-register-page.a11y.spec.ts: its decoration keeps the visible text from
  // being a literal prefix of the accessible name.
  for (const [locale, bundle] of [['en-US', enUS], ['es-US', esUS], ['es-MX', esMX], ['fr-CA', frCA], ['fr-FR', frFR]] as const) {
    it(`keeps the visible Remove label at the start of the remove button's name in ${locale}`, () => {
      const copy = bundle.PEOPLE.PERSON_PROFILE;
      const name = copy.REMOVE_CONTACT_ARIA.replace('{{index}}', '1').replace('{{type}}', copy.CONTACT_TYPE.EMAIL);

      expect(name.startsWith(copy.REMOVE_CONTACT)).toBe(true);
    });
  }

  it('describes every address control with the address-wide hint (ADR-0029 §8.3)', async () => {
    await setup();

    for (const id of ['line1', 'line2', 'city', 'region', 'postalCode', 'countryCode']) {
      expect(el.querySelector(`#address-${id}`)?.getAttribute('aria-describedby')).toBe('address-hint');
    }
    expect(el.querySelector('#address-hint')).not.toBeNull();
  });

  it('moves focus to the add button after removing a contact point', async () => {
    await setup();
    const remove = el.querySelector<HTMLButtonElement>('[data-testid="remove-contact-point"]');
    remove?.focus();

    remove?.click();
    fixture.detectChanges();

    expect(component.contactPoints.length).toBe(2);
    expect(document.activeElement).toBe(q('add-contact-point'));
  });

  it('routes a failed save to the save error and keeps the form on screen', async () => {
    await setup();
    stubService.replaceContactPoints.mockReturnValue(throwError(() => new Error('boom')));

    component.save();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.PERSON_PROFILE.ERROR.SAVE');
    expect(component.saving()).toBe(false);
    expect(el.querySelector('form')).not.toBeNull();
  });

  describe('write gating (people-contact:person:edit)', () => {
    it('view-only: form disabled, no save or add controls, and save() refuses', async () => {
      await setup({ permissions: [VIEW_PERMISSION] });

      expect(component.canEdit()).toBe(false);
      expect(component.form.disabled).toBe(true);
      expect(q('save-button')).toBeNull();
      expect(q('add-contact-point')).toBeNull();
      expect(q('remove-contact-point')).toBeNull();
      expect(q('read-only-note')?.textContent?.trim()).toBe(enUS.PEOPLE.PERSON_PROFILE.READ_ONLY);

      component.save();
      component.addContactPoint();
      component.removeContactPoint(0);
      component.contactPoints.at(2).controls.primary.setValue(true, { emitEvent: false });
      component.contactPoints.at(2).controls.contactType.setValue(ContactPointDtoContactTypeEnum.Email);
      component.onPrimaryChange(2);
      expect(component.contactPoints.at(0).controls.primary.value).toBe(true);

      expect(stubService.updatePerson).not.toHaveBeenCalled();
      expect(component.contactPoints.length).toBe(3);
    });

    it('edit granted: save control renders and writes go out', async () => {
      await setup({ permissions: [VIEW_PERMISSION, EDIT_PERMISSION] });

      expect(component.form.enabled).toBe(true);
      expect(q('save-button')).not.toBeNull();
      component.save();
      expect(stubService.updatePerson).toHaveBeenCalled();
    });

    it('legacy token with unknown perm_bits falls back to allowing edits', async () => {
      await setup({ permissions: null });

      expect(component.canEdit()).toBe(true);
      expect(q('save-button')).not.toBeNull();
    });
  });
});
