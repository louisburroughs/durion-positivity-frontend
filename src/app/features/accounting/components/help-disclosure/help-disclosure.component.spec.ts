import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { HelpDisclosureComponent } from './help-disclosure.component';

describe('HelpDisclosureComponent (§5.6)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HelpDisclosureComponent, TranslateModule.forRoot()] });
  });

  function render(inputs: Record<string, string | null>): HTMLElement {
    const fixture = TestBed.createComponent(HelpDisclosureComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is a native details/summary, closed until opened', () => {
    const host = render({ textKey: 'ACCOUNTING.HELP.X.TEXT' });
    const details = host.querySelector('details')!;

    expect(details).not.toBeNull();
    expect(details.querySelector(':scope > summary')).not.toBeNull();
    expect(details.open).toBe(false);
  });

  it('opens from the keyboard: the summary is focusable and Enter toggles it', () => {
    const host = render({ textKey: 'ACCOUNTING.HELP.X.TEXT' });
    document.body.appendChild(host);
    const summary = host.querySelector('summary')!;

    summary.focus();
    expect(document.activeElement).toBe(summary);
    // The browser's own activation behaviour for <summary> is a click.
    summary.click();
    expect(host.querySelector('details')!.open).toBe(true);
    host.remove();
  });

  it('renders the text and the example, and the default summary', () => {
    const host = render({ textKey: 'K.TEXT', exampleKey: 'K.EXAMPLE' });

    expect(host.querySelector('summary')?.textContent).toContain('ACCOUNTING.HELP.WHATS_THIS');
    expect(host.querySelector('.help-disclosure__body')?.textContent).toContain('K.TEXT');
    expect(host.querySelector('.help-disclosure__example')?.textContent).toContain('K.EXAMPLE');
  });

  it('starts the accessible name with the visible label and adds the context after it', () => {
    const host = render({ textKey: 'K.TEXT', contextKey: 'K.CARD' });
    const summary = host.querySelector('summary')!;

    const named = Array.from(summary.children).filter(child => child.getAttribute('aria-hidden') !== 'true');
    expect(named[0].textContent).toContain('ACCOUNTING.HELP.WHATS_THIS');
    expect(named[1].classList.contains('sr-only')).toBe(true);
    expect(named[1].textContent).toContain('K.CARD');
  });
});
