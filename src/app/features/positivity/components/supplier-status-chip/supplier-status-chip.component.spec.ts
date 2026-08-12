import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from './supplier-status-chip.component';

describe('SupplierStatusChipComponent', () => {
  let fixture: ComponentFixture<SupplierStatusChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierStatusChipComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierStatusChipComponent);
  });

  function render(inputs: {
    labelKey: string;
    tone?: SupplierStatusTone;
    icon?: string | null;
    descriptionKey?: string | null;
  }): HTMLElement {
    fixture.componentRef.setInput('labelKey', inputs.labelKey);
    if (inputs.tone) {
      fixture.componentRef.setInput('tone', inputs.tone);
    }
    if (inputs.icon !== undefined) {
      fixture.componentRef.setInput('icon', inputs.icon);
    }
    if (inputs.descriptionKey !== undefined) {
      fixture.componentRef.setInput('descriptionKey', inputs.descriptionKey);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the translated label as visible text, so status never rests on colour alone', () => {
    const el = render({ labelKey: 'POSITIVITY.HEALTH.STATUS.HEALTHY', tone: 'success' });
    const label = el.querySelector('.supplier-chip__label');

    expect(label?.textContent?.trim()).toBe('POSITIVITY.HEALTH.STATUS.HEALTHY');
  });

  it('renders a glyph alongside the text and hides it from assistive tech', () => {
    const el = render({ labelKey: 'POSITIVITY.HEALTH.STATUS.FAILING', tone: 'danger' });
    const icon = el.querySelector('.supplier-chip__icon');

    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.textContent?.trim().length).toBe(1);
  });

  it('resolves a distinct glyph per tone so tones differ without colour', () => {
    const pipe = new MaterialSymbolPipe();
    const tones: SupplierStatusTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
    const glyphs = new Set<string>();

    for (const tone of tones) {
      const local = TestBed.createComponent(SupplierStatusChipComponent);
      local.componentRef.setInput('labelKey', 'K');
      local.componentRef.setInput('tone', tone);
      local.detectChanges();
      const name = local.componentInstance.resolvedIcon();
      expect(pipe.transform(name), `icon "${name}" is not in the msIcon glyph table`).not.toBe('');
      glyphs.add(pipe.transform(name));
    }

    expect(glyphs.size).toBe(tones.length);
  });

  it('applies the tone class', () => {
    const el = render({ labelKey: 'K', tone: 'warning' });

    expect(el.querySelector('.supplier-chip--warning')).not.toBeNull();
  });

  it('defaults to the neutral tone', () => {
    const el = render({ labelKey: 'K' });

    expect(el.querySelector('.supplier-chip--neutral')).not.toBeNull();
  });

  it('honours an explicit icon override', () => {
    const el = render({ labelKey: 'K', tone: 'info', icon: 'schedule' });

    expect(fixture.componentInstance.resolvedIcon()).toBe('schedule');
    expect(el.querySelector('.supplier-chip__icon')?.textContent?.trim().length).toBe(1);
  });

  it('renders a screen-reader-only prefix when a description key is supplied', () => {
    const el = render({
      labelKey: 'POSITIVITY.HEALTH.BREAKER.CLOSED',
      descriptionKey: 'POSITIVITY.HEALTH.BREAKER_LABEL',
    });
    const srOnly = el.querySelector('.sr-only');

    expect(srOnly?.textContent?.trim()).toBe('POSITIVITY.HEALTH.BREAKER_LABEL');
  });

  it('omits the screen-reader prefix when no description key is supplied', () => {
    const el = render({ labelKey: 'K' });

    expect(el.querySelector('.sr-only')).toBeNull();
  });
});
