/**
 * Manual-review resolution controls (issue #191).
 *
 * The load-bearing assertions here are the two safety properties: no re-send
 * affordance exists, and no action reaches the backend without an explicit
 * confirmation that names the operational risk.
 *
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierManualReviewActionsComponent } from './supplier-manual-review-actions.component';
import { SupplierManualReviewAction } from '../../models/supplier-order-transmission.models';

const actions: SupplierManualReviewAction[] = [
  { action: 'CONFIRM_MATCHED', description: 'Vendor order MX-ORD-99182 matches this PO.' },
  { action: 'MARK_REJECTED' },
];

describe('SupplierManualReviewActionsComponent', () => {
  let fixture: ComponentFixture<SupplierManualReviewActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierManualReviewActionsComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierManualReviewActionsComponent);
  });

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('actions', actions);
    fixture.componentRef.setInput('contextLabel', 'PO-1042');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders exactly the actions the backend delivered — no more', () => {
    const el = render();

    const triggers = Array.from(el.querySelectorAll('.review-actions__trigger'));
    expect(triggers).toHaveLength(2);
    expect(triggers.map(t => t.textContent?.trim())).toEqual([
      expect.stringContaining('POSITIVITY.MANUAL_REVIEW.ACTION.CONFIRM_MATCHED'),
      expect.stringContaining('POSITIVITY.MANUAL_REVIEW.ACTION.MARK_REJECTED'),
    ]);
  });

  it('offers no re-send, retry or re-transmit affordance', () => {
    const el = render();

    const controlText = Array.from(el.querySelectorAll('button, a'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/resend|re-send|retransmit|re-transmit|transmit_again/);
  });

  it('renders nothing at all when the backend offers no action', () => {
    const el = render({ actions: [] });

    expect(el.querySelector('.review-actions')).toBeNull();
    expect(el.querySelectorAll('button')).toHaveLength(0);
  });

  it('emits nothing on the first click — the action only opens a confirmation', () => {
    const emitted: string[] = [];
    const el = render();
    fixture.componentInstance.resolve.subscribe((a: string) => emitted.push(a));

    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(el.querySelector('dialog.review-confirm')).not.toBeNull();
  });

  it('states the operational risk of a duplicate physical order in the dialog', () => {
    const el = render();
    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();

    expect(el.querySelector('.review-confirm__risk')?.textContent?.trim()).toBe(
      'POSITIVITY.MANUAL_REVIEW.CONFIRM.RISK_CONFIRM_MATCHED',
    );
    expect(el.querySelector('.review-confirm__no-resend')?.textContent?.trim()).toBe(
      'POSITIVITY.MANUAL_REVIEW.CONFIRM.NO_RESEND',
    );
  });

  it('names the row being resolved in the dialog', () => {
    const el = render();
    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();

    expect(el.querySelector('.review-confirm__context')?.textContent).toContain('PO-1042');
  });

  it('emits the backend action token verbatim once confirmed', () => {
    const emitted: string[] = [];
    const el = render();
    fixture.componentInstance.resolve.subscribe((a: string) => emitted.push(a));

    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();
    fixture.componentInstance.confirm();

    expect(emitted).toEqual(['CONFIRM_MATCHED']);
  });

  it('emits nothing when the confirmation is cancelled', () => {
    const emitted: string[] = [];
    const el = render();
    fixture.componentInstance.resolve.subscribe((a: string) => emitted.push(a));

    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();
    fixture.componentInstance.cancel();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(el.querySelector('dialog.review-confirm')).toBeNull();
  });

  it('renders an unrecognised backend action token verbatim rather than hiding it', () => {
    const el = render({ actions: [{ action: 'ESCALATE_TO_VENDOR' } as SupplierManualReviewAction] });

    expect(el.querySelector('.review-actions__trigger')?.textContent).toContain(
      'ESCALATE_TO_VENDOR',
    );

    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();
    expect(el.querySelector('.review-confirm__risk')?.textContent?.trim()).toBe(
      'POSITIVITY.MANUAL_REVIEW.CONFIRM.RISK_GENERIC',
    );
  });

  it('blocks a second request while a resolution is in flight', () => {
    const el = render({ busy: true });
    const trigger = el.querySelector<HTMLButtonElement>('.review-actions__trigger');

    expect(trigger?.disabled).toBe(true);
    fixture.componentInstance.request(actions[0]);
    expect(fixture.componentInstance.pending()).toBeNull();
  });

  it('exposes no method that could transmit an order', () => {
    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.componentInstance),
    );
    expect(methodNames.some(name => /send|transmit|retry/i.test(name))).toBe(false);
    expect(vi.isMockFunction(fixture.componentInstance.confirm)).toBe(false);
  });
});
