import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PeopleAPIService, Person } from '@durion-sdk/people';
import { PersonLookupComponent } from './person-lookup.component';

const PEOPLE: Person[] = [
  { id: 'p1', firstName: 'Jane', lastName: 'Doe', username: 'jdoe', primaryEmail: 'jane.doe@acme.com' },
  { id: 'p2', firstName: 'Jane', lastName: 'Doe', username: 'jdoe2', primaryEmail: 'j.doe2@gmail.com' },
];

describe('PersonLookupComponent', () => {
  let fixture: ComponentFixture<PersonLookupComponent>;
  let component: PersonLookupComponent;
  let getAllPeople: ReturnType<typeof vi.fn>;
  let getPersonById: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getAllPeople = vi.fn().mockReturnValue(of(PEOPLE));
    getPersonById = vi.fn().mockReturnValue(of(PEOPLE[1]));

    await TestBed.configureTestingModule({
      imports: [PersonLookupComponent, TranslateModule.forRoot()],
      providers: [{ provide: PeopleAPIService, useValue: { getAllPeople, getPersonById } }],
    }).compileComponents();

    fixture = TestBed.createComponent(PersonLookupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('searches server-side (debounced), scoped to the configured type', fakeAsync(() => {
    component.type = 'EMPLOYEE';
    component.onInput('jane');
    expect(getAllPeople).not.toHaveBeenCalled(); // debounced
    tick(250);
    expect(getAllPeople).toHaveBeenCalledWith('EMPLOYEE', 'jane');
    expect(component.suggestions().map(p => p.id)).toEqual(['p1', 'p2']);
  }));

  it('keeps the raw text as the value so a pasted id still resolves', fakeAsync(() => {
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.onInput('  person-77  ');
    expect(component.value()).toBe('person-77');
    expect(seen).toEqual(['person-77']);
    tick(250);
  }));

  it('emits the selected person id and shows the person name', () => {
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.select(PEOPLE[0]);

    expect(seen).toEqual(['p1']);
    expect(component.value()).toBe('p1');
    expect(component.query()).toBe('Jane Doe');
  });

  it('writeValue resolves a readable name via getPersonById', () => {
    component.writeValue('p2');
    expect(component.value()).toBe('p2');
    expect(getPersonById).toHaveBeenCalledWith('p2');
    expect(component.query()).toBe('Jane Doe');
  });

  it('writeValue with empty id clears the field and does not fetch', () => {
    component.writeValue('');
    expect(component.value()).toBe('');
    expect(component.query()).toBe('');
    expect(getPersonById).not.toHaveBeenCalled();
  });

  it('Enter selects the active suggestion', fakeAsync(() => {
    component.onInput('jane');
    tick(250);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const expected = component.suggestions()[0].id;
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.value()).toBe(expected);
  }));
});
