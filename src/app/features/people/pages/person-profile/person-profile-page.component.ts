import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription, concatMap, forkJoin, map, of } from 'rxjs';
import {
  ContactPointDto,
  ContactPointDtoContactTypeEnum,
  Person,
  PostalAddressDto,
} from '@durion-sdk/people-contact';

import { AuthService } from '../../../../core/services/auth.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import { PeopleService } from '../../services/people.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

/** `Validators.required` passes whitespace, but the payload is trimmed, so blank must fail here. */
const NOT_BLANK = Validators.pattern(/\S/);

type ContactPointForm = FormGroup<{
  contactType: FormControl<ContactPointDtoContactTypeEnum>;
  value: FormControl<string>;
  primary: FormControl<boolean>;
}>;

interface PersonProfile {
  person: Person;
  address: PostalAddressDto | null;
}

/**
 * Identity profile for any person in the directory — employee or not. Names,
 * typed contact points and the postal address are editable; the person id and the
 * linked username are identifiers owned elsewhere (the id by this record, the
 * username by pos-security) and render read-only.
 */
@Component({
  selector: 'app-person-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './person-profile-page.component.html',
  styleUrl: './person-profile-page.component.css',
})
export class PersonProfilePageComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly contactTypes = Object.values(ContactPointDtoContactTypeEnum);

  private readonly personId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('personId'))),
    { initialValue: this.route.snapshot.paramMap.get('personId') },
  );
  private readonly reloadTick = signal(0);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly profile = signal<PersonProfile | null>(null);
  readonly hasCachedData = computed(() => this.profile() !== null);
  readonly saving = signal(false);
  readonly saveSuccess = signal(false);
  /** ADR-0063: bumped per save and on a route change, so a superseded save cannot land. */
  private saveSeq = 0;
  /** The in-flight write chain; a route change unsubscribes it so no later step is issued. */
  private saveSub: Subscription | null = null;

  /** ADR-0040 §6a: a read permission never enables a write; unknown perm_bits fall back to allow. */
  readonly canEdit = computed(() =>
    !this.auth.permissionsKnown() || this.auth.hasAnyPermission(PEOPLE_SECTION.personEdit));

  /** ADR-0064: retained data is shown, but only actionable once the current read succeeded. */
  readonly readOk = signal(false);

  /** Edits are live only with the permission, a good current read, and no save in flight (ADR-0063). */
  readonly editable = computed(() => this.canEdit() && this.readOk() && !this.saving());

  private readonly addContactButton = viewChild<ElementRef<HTMLButtonElement>>('addContactButton');

  readonly form = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required, NOT_BLANK] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required, NOT_BLANK] }),
    contactPoints: new FormArray<ContactPointForm>([]),
    address: new FormGroup({
      line1: new FormControl('', { nonNullable: true }),
      line2: new FormControl('', { nonNullable: true }),
      city: new FormControl('', { nonNullable: true }),
      region: new FormControl('', { nonNullable: true }),
      postalCode: new FormControl('', { nonNullable: true }),
      countryCode: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^[A-Za-z]{2}$/)] }),
    }),
  });

  /** An address is optional, but once any part is entered, line 1 and the country become required. */
  readonly addressIncomplete = signal(false);

  constructor() {
    effect((onCleanup) => {
      const personId = this.personId();
      this.reloadTick();
      // ADR-0063 §7: a new route key drops the previous person's data and any save
      // still in flight for them before the new read is issued.
      if (untracked(this.profile)?.person.id !== personId) {
        this.profile.set(null);
        this.saveSeq++;
        this.saveSub?.unsubscribe();
        this.saveSub = null;
        this.saving.set(false);
        this.saveSuccess.set(false);
      }
      if (!personId) {
        this.state.set('error');
        this.errorKey.set('PEOPLE.PERSON_PROFILE.ERROR.NOT_FOUND');
        return;
      }
      this.readOk.set(false);
      this.state.set('loading');
      const sub = forkJoin({
        person: this.peopleService.getPersonWithContactPoints(personId),
        address: this.peopleService.getPersonPostalAddress(personId),
      }).subscribe({
        // An `of()`-backed read lands synchronously inside this effect, so nothing in these
        // callbacks may read a signal: `readOk` is written here, and tracking it would loop.
        next: ({ person, address }) => {
          if (!person) {
            this.profile.set(null);
            this.state.set('error');
            this.errorKey.set('PEOPLE.PERSON_PROFILE.ERROR.NOT_FOUND');
            return;
          }
          this.profile.set({ person, address });
          this.patchForm(person, address);
          this.readOk.set(true);
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: () => {
          this.saveSuccess.set(false);
          this.state.set('error');
          this.errorKey.set('PEOPLE.PERSON_PROFILE.ERROR.LOAD');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      if (this.editable()) {
        this.form.enable({ emitEvent: false });
      } else {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  get contactPoints(): FormArray<ContactPointForm> {
    return this.form.controls.contactPoints;
  }

  reload(): void {
    this.reloadTick.update(n => n + 1);
  }

  addContactPoint(): void {
    if (!this.editable()) return;
    this.contactPoints.push(this.buildContactPoint({
      contactType: ContactPointDtoContactTypeEnum.Email,
      value: '',
      primary: false,
    }));
  }

  removeContactPoint(index: number): void {
    if (!this.editable()) return;
    this.contactPoints.removeAt(index);
    this.contactPoints.markAsDirty();
    // ADR-0029 §8.7: the focused remove button is gone; hand focus to a stable control.
    this.addContactButton()?.nativeElement.focus();
  }

  /** Only one primary per contact type: checking one clears the others of the same type. */
  onPrimaryChange(index: number): void {
    if (!this.editable()) return;
    const changed = this.contactPoints.at(index);
    if (!changed.controls.primary.value) return;
    const type = changed.controls.contactType.value;
    this.contactPoints.controls.forEach((row, i) => {
      if (i !== index && row.controls.contactType.value === type) {
        row.controls.primary.setValue(false);
      }
    });
  }

  save(): void {
    // Also refuses a second submit (e.g. Enter) while a non-atomic write chain is in flight.
    if (!this.editable()) return;
    const personId = this.personId();
    const current = this.profile();
    if (!personId || !current) return;

    this.form.markAllAsTouched();
    const address = this.addressPayload();
    this.addressIncomplete.set(address === 'incomplete');
    if (this.form.invalid || address === 'incomplete') return;

    const { firstName, lastName } = this.form.getRawValue();
    const contactPoints = this.contactPointsPayload();
    const emails = orderPrimaryFirst(contactPoints, ContactPointDtoContactTypeEnum.Email);

    // updatePerson rewrites the flat identity fields (and, server side, the EMAIL and
    // PHONE_WORK contact points), so it runs first; replaceContactPoints then lands the
    // full typed set, which is the authority for every contact channel.
    const identity: Person = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      primaryEmail: emails[0],
      secondaryEmail: emails[1],
      phoneNumbers: orderPrimaryFirst(contactPoints, ContactPointDtoContactTypeEnum.PhoneWork),
    };

    const seq = ++this.saveSeq;
    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveSub = this.peopleService.updatePerson(personId, identity).pipe(
      concatMap(() => this.peopleService.replaceContactPoints(personId, contactPoints)),
      concatMap(() => this.writeAddress(personId, address, current.address !== null)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        if (seq !== this.saveSeq) return;
        this.saving.set(false);
        this.saveSuccess.set(true);
        this.state.set('ready');
        this.errorKey.set(null);
        this.form.markAsPristine();
        this.reload();
      },
      error: () => {
        if (seq !== this.saveSeq) return;
        this.saving.set(false);
        this.state.set('error');
        this.errorKey.set('PEOPLE.PERSON_PROFILE.ERROR.SAVE');
      },
    });
  }

  private writeAddress(
    personId: string,
    address: PostalAddressDto | null,
    hadAddress: boolean,
  ): Observable<unknown> {
    if (address) return this.peopleService.putPersonPostalAddress(personId, address);
    if (hadAddress) return this.peopleService.deletePersonPostalAddress(personId);
    return of(null);
  }

  private addressPayload(): PostalAddressDto | null | 'incomplete' {
    const raw = this.form.controls.address.getRawValue();
    const line1 = raw.line1.trim();
    const countryCode = raw.countryCode.trim().toUpperCase();
    const optional = {
      line2: raw.line2.trim() || undefined,
      city: raw.city.trim() || undefined,
      region: raw.region.trim() || undefined,
      postalCode: raw.postalCode.trim() || undefined,
    };
    const anyEntered = !!(line1 || countryCode || Object.values(optional).some(Boolean));
    if (!anyEntered) return null;
    if (!line1 || !countryCode) return 'incomplete';
    return { line1, countryCode, ...optional };
  }

  private contactPointsPayload(): ContactPointDto[] {
    return this.contactPoints.getRawValue()
      .map(cp => ({ ...cp, value: cp.value.trim() }))
      .filter(cp => cp.value !== '');
  }

  private patchForm(person: Person, address: PostalAddressDto | null): void {
    this.contactPoints.clear({ emitEvent: false });
    for (const cp of person.contactPoints ?? []) {
      this.contactPoints.push(this.buildContactPoint(cp), { emitEvent: false });
    }
    this.form.patchValue({
      firstName: person.firstName ?? '',
      lastName: person.lastName ?? '',
      address: {
        line1: address?.line1 ?? '',
        line2: address?.line2 ?? '',
        city: address?.city ?? '',
        region: address?.region ?? '',
        postalCode: address?.postalCode ?? '',
        countryCode: address?.countryCode ?? '',
      },
    });
    this.addressIncomplete.set(false);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private buildContactPoint(cp: ContactPointDto): ContactPointForm {
    return new FormGroup({
      contactType: new FormControl(cp.contactType, { nonNullable: true }),
      value: new FormControl(cp.value, { nonNullable: true, validators: [Validators.required, NOT_BLANK] }),
      primary: new FormControl(cp.primary, { nonNullable: true }),
    });
  }
}

function orderPrimaryFirst(points: ContactPointDto[], type: ContactPointDtoContactTypeEnum): string[] {
  return points
    .filter(cp => cp.contactType === type)
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map(cp => cp.value);
}
