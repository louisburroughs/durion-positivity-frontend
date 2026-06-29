import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

import { WorkexecLandingPageComponent } from './workexec-landing-page.component';
import { WorkexecService } from '../../services/workexec.service';

describe('WorkexecLandingPageComponent', () => {
  let component: WorkexecLandingPageComponent;
  let fixture: ComponentFixture<WorkexecLandingPageComponent>;

  const workexecStub = {
    searchEstimates: vi.fn().mockReturnValue(of([])),
    searchWorkorders: vi.fn().mockReturnValue(of([])),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkexecLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: WorkexecService, useValue: workexecStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkexecLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('supplies the workexec landing config', () => {
    expect(component.config.titleKey).toBe('WORKEXEC.LANDING.TITLE');
    expect(component.config.sections.length).toBe(4);
  });

  it('wires name-search functions for estimate and workorder kinds', () => {
    expect(component.searchFns.estimate).toBeDefined();
    expect(component.searchFns.workorder).toBeDefined();

    component.searchFns.estimate!('abc');
    expect(workexecStub.searchEstimates).toHaveBeenCalledWith('abc');
    component.searchFns.workorder!('xyz');
    expect(workexecStub.searchWorkorders).toHaveBeenCalledWith('xyz');
  });

  it('renders the hero title through the shared landing page', () => {
    const title = fixture.nativeElement.querySelector('#landing-title');
    expect(title).toBeTruthy();
  });

  it('Approval Detail builds the full estimate+approval route (regression: 6 segments)', () => {
    const card = component.config.sections
      .flatMap(s => s.cards)
      .find(c => c.titleKey === 'WORKEXEC.LANDING.CARD.APPROVAL_DETAIL.TITLE');
    expect(card?.kind).toBe('guided');
    if (card?.kind !== 'guided') throw new Error('expected guided card');
    expect(card.secondary?.labelKey).toBe('WORKEXEC.LANDING.FIELD.APPROVAL_ID');
    expect(card.buildCommands('EST-1', 'APR-5')).toEqual([
      '/app',
      'workexec',
      'estimates',
      'EST-1',
      'approval',
      'APR-5',
    ]);
  });
});
