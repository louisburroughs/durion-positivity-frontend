import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LandingRecordFinderComponent } from './landing-record-finder.component';
import { RecordHit } from '../landing.models';

const HITS: RecordHit[] = [
  { id: 'EST-1', primary: 'Acme Co', secondary: 'EST-1 · DRAFT' },
  { id: 'EST-2', primary: 'Beta LLC', secondary: 'EST-2 · SENT' },
];

describe('LandingRecordFinderComponent', () => {
  let fixture: ComponentFixture<LandingRecordFinderComponent>;
  let component: LandingRecordFinderComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [LandingRecordFinderComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(LandingRecordFinderComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('search mode', () => {
    beforeEach(() => {
      component.mode = 'search';
      fixture.detectChanges();
    });

    it('does not search below minChars', () => {
      const search = vi.fn<(q: string) => Observable<RecordHit[]>>(() => of(HITS));
      component.search = search;
      component.onInput('a');
      vi.advanceTimersByTime(300);
      expect(search).not.toHaveBeenCalled();
      expect(component.state()).toBe('idle');
    });

    it('debounces then loads results', () => {
      component.search = () => of(HITS);
      component.onInput('ac');
      expect(component.state()).toBe('loading');
      vi.advanceTimersByTime(250);
      expect(component.results().length).toBe(2);
      expect(component.state()).toBe('loaded');
      expect(component.expanded).toBe(true);
    });

    it('enters empty state when no matches', () => {
      component.search = () => of<RecordHit[]>([]);
      component.onInput('zz');
      vi.advanceTimersByTime(250);
      expect(component.state()).toBe('empty');
    });

    it('enters error state on failure and recovers on the next query', () => {
      let fail = true;
      component.search = () => (fail ? throwError(() => new Error('boom')) : of(HITS));
      component.onInput('ac');
      vi.advanceTimersByTime(250);
      expect(component.state()).toBe('error');

      fail = false;
      component.onInput('acm');
      vi.advanceTimersByTime(250);
      expect(component.state()).toBe('loaded');
    });

    it('choose() emits the id and closes the list', () => {
      component.search = () => of(HITS);
      const emitted: string[] = [];
      component.selected.subscribe(id => emitted.push(id));
      component.onInput('ac');
      vi.advanceTimersByTime(250);
      component.choose(HITS[1]);
      expect(emitted).toEqual(['EST-2']);
      expect(component.value()).toBe('EST-2');
      expect(component.filled).toBe(true);
      expect(component.expanded).toBe(false);
    });

    it('clears a committed selection when the query is edited (re-locks cards)', () => {
      component.search = () => of(HITS);
      let cleared = 0;
      component.cleared.subscribe(() => cleared++);
      component.onInput('ac');
      vi.advanceTimersByTime(250);
      component.choose(HITS[0]);
      expect(component.filled).toBe(true);

      component.onInput('acme');
      expect(component.value()).toBe('');
      expect(cleared).toBe(1);
    });

    it('Escape clears the selection', () => {
      component.value.set('EST-1');
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.value()).toBe('');
    });
  });

  describe('id mode', () => {
    beforeEach(() => {
      component.mode = 'id';
      fixture.detectChanges();
    });

    it('does not call search and commits on Enter', () => {
      const search = vi.fn();
      component.search = search as never;
      const emitted: string[] = [];
      component.selected.subscribe(id => emitted.push(id));
      const ev = new KeyboardEvent('keydown', { key: 'Enter' });
      Object.defineProperty(ev, 'target', { value: { value: ' PO-9 ' } });
      component.onKeydown(ev);
      expect(search).not.toHaveBeenCalled();
      expect(emitted).toEqual(['PO-9']);
      expect(component.value()).toBe('PO-9');
    });

    it('commits on blur and clears when emptied', () => {
      const emitted: string[] = [];
      component.selected.subscribe(id => emitted.push(id));
      component.onBlur('PT-1');
      expect(emitted).toEqual(['PT-1']);
      component.onBlur('   ');
      expect(component.value()).toBe('');
    });
  });
});
