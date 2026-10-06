import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AccountingHomePageComponent } from './accounting-home-page.component';
import { configureHome, createHomeMocks } from './accounting-home-page.spec-helper';

/**
 * AC 12 at a real 390px viewport (Vitest browser mode): the media query, not
 * a mocked `matchMedia`, decides the layout. The detail panel stacks below the
 * list, takes focus when an item is chosen, and list rows and primary actions
 * stay at least 44px tall (§5.7).
 */
describe('Accounting home at 390px (AC 12, §5.7)', () => {
  let host: HTMLElement | null = null;

  beforeEach(async () => {
    localStorage.clear();
    await page.viewport(390, 844);
  });

  afterEach(async () => {
    host?.remove();
    localStorage.clear();
    await page.viewport(1280, 800);
  });

  it('stacks the panel below the list, focuses it, and keeps 44px targets', () => {
    configureHome(createHomeMocks(), { tenantId: signal<string | null>(null) });
    // Real copy: echoed key paths are single unbreakable words and would overflow on their own.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    const fixture = TestBed.createComponent(AccountingHomePageComponent);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();

    expect(window.matchMedia('(width <= 767px)').matches).toBe(true);
    (host.querySelector('.todo-item[data-kind="APPROVAL"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const list = host.querySelector('.todo__list-column')!.getBoundingClientRect();
    const panel = host.querySelector('[data-testid="todo-panel"]')!.getBoundingClientRect();
    expect(panel.top).toBeGreaterThanOrEqual(list.bottom);
    expect(document.activeElement?.id).toBe('todo-panel-heading');

    const targets = [
      ...Array.from(host.querySelectorAll<HTMLElement>('.todo-item')),
      ...Array.from(host.querySelectorAll<HTMLElement>('.filter-button')),
      host.querySelector<HTMLElement>('[data-testid="approve-month"]')!,
    ];
    for (const target of targets) expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    // No horizontal page scroll at phone width.
    const wide = Array.from(host.querySelectorAll<HTMLElement>('*'))
      .filter(el => el.getBoundingClientRect().right > 392)
      .map(el => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().right)}`)
      .slice(0, 12);
    expect(wide).toEqual([]);
    expect(host.scrollWidth).toBeLessThanOrEqual(390);
  });
});
