import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { WorkexecSearchTypeaheadComponent } from './workexec-search-typeahead.component';
import { SearchResultItem } from '../../models/workexec.models';

const HITS: SearchResultItem[] = [
  { id: 'e1', primary: 'Acme', secondary: 'EST-1 · DRAFT' },
  { id: 'e2', primary: 'Globex', secondary: 'EST-2 · OPEN' },
];

describe('WorkexecSearchTypeaheadComponent', () => {
  let component: WorkexecSearchTypeaheadComponent;
  let fixture: ComponentFixture<WorkexecSearchTypeaheadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkexecSearchTypeaheadComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkexecSearchTypeaheadComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.search = () => of([]);
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('calls search and renders options after debounce when >= minChars', fakeAsync(() => {
    const search = vi.fn().mockReturnValue(of(HITS));
    component.search = search;
    fixture.detectChanges();

    component.onInput('ac');
    expect(search).not.toHaveBeenCalled(); // debounced
    tick(250);
    fixture.detectChanges();

    expect(search).toHaveBeenCalledWith('ac');
    expect(component.results()).toEqual(HITS);
    expect(component.state()).toBe('loaded');
    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
  }));

  it('does not call search for < minChars', fakeAsync(() => {
    const search = vi.fn().mockReturnValue(of(HITS));
    component.search = search;
    fixture.detectChanges();

    component.onInput('a');
    tick(250);

    expect(search).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  }));

  it('shows empty state when search returns no hits', fakeAsync(() => {
    component.search = vi.fn().mockReturnValue(of([] as SearchResultItem[]));
    fixture.detectChanges();

    component.onInput('zzz');
    tick(250);
    fixture.detectChanges();

    expect(component.state()).toBe('empty');
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(0);
  }));

  it('shows error state when search errors', fakeAsync(() => {
    component.search = vi.fn().mockReturnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();

    component.onInput('ac');
    tick(250);
    fixture.detectChanges();

    expect(component.state()).toBe('error');
  }));

  it('emits the active id on ArrowDown + Enter', fakeAsync(() => {
    component.search = vi.fn().mockReturnValue(of(HITS));
    fixture.detectChanges();
    const emit = vi.spyOn(component.selected, 'emit');

    component.onInput('ac');
    tick(250);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(emit).toHaveBeenCalledWith('e1');
    expect(component.state()).toBe('idle');
  }));

  it('emits the id on option click', fakeAsync(() => {
    component.search = vi.fn().mockReturnValue(of(HITS));
    fixture.detectChanges();
    const emit = vi.spyOn(component.selected, 'emit');

    component.onInput('ac');
    tick(250);

    component.choose(HITS[1]);
    expect(emit).toHaveBeenCalledWith('e2');
  }));
});
