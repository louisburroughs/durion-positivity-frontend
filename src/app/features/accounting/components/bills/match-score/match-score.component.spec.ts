import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { MatchScoreComponent } from './match-score.component';

describe('MatchScoreComponent (§5.2, P3, P7)', () => {
  let fixture: ComponentFixture<MatchScoreComponent>;
  const q = (selector: string): HTMLElement | null => (fixture.nativeElement as HTMLElement).querySelector(selector);
  const all = (selector: string): HTMLElement[] => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MatchScoreComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(MatchScoreComponent);
  });

  it('shows the served score and one meter per criterion with the served points (AC 6)', () => {
    fixture.componentRef.setInput('score', 82);
    fixture.componentRef.setInput('points', { amount: 40, products: 30, date: 10, purchaseOrder: 2 });
    fixture.detectChanges();

    expect(q('[data-testid="match-total"]')?.textContent).toContain('ACCOUNTING.BILLS.MATCH.SCORE');
    const meters = all('meter');
    expect(meters.map(meter => [meter.getAttribute('value'), meter.getAttribute('max')])).toEqual([
      ['40', '40'],
      ['30', '30'],
      ['10', '20'],
      ['2', '5'],
    ]);
    // Each meter is labelled by its criterion, so the text and the bar agree.
    for (const meter of meters) expect(q(`label[for="${meter.id}"]`)).not.toBeNull();
    expect(q('[data-testid="match-none"]')).toBeNull();
  });

  it('computes nothing: a served score that differs from the points total is shown as served', () => {
    fixture.componentRef.setInput('score', 50);
    fixture.componentRef.setInput('points', { amount: 40, products: 30, date: 20, purchaseOrder: 5 });
    fixture.detectChanges();

    expect(fixture.componentInstance.rows().map(row => row.points)).toEqual([40, 30, 20, 5]);
    expect(fixture.componentInstance.score()).toBe(50);
  });

  it('says "Not matched to a delivery" without a served match (AC 6)', () => {
    fixture.detectChanges();

    expect(q('[data-testid="match-none"]')?.textContent).toContain('ACCOUNTING.BILLS.MATCH.NONE');
    expect(all('meter')).toEqual([]);
    expect(q('app-help-disclosure')).not.toBeNull();
  });

  it('drops the heading and help in compact mode (candidate rows)', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.componentRef.setInput('score', 74);
    fixture.detectChanges();

    expect(q('h3')).toBeNull();
    expect(q('app-help-disclosure')).toBeNull();
  });
});
