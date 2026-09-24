import { Component, PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalDialogDirective } from './modal-dialog.directive';

@Component({
  standalone: true,
  imports: [ModalDialogDirective],
  template: `
    @if (open()) {
      <dialog
        class="modal"
        appModalDialog
        [closeOnBackdrop]="closeOnBackdrop()"
        (modalCancel)="cancelCount = cancelCount + 1"
      >
        <div class="panel">
          <h2 id="heading">Title</h2>
          <button type="button" id="inner-btn">Inner</button>
        </div>
      </dialog>
    }
  `,
})
class HostComponent {
  readonly open = signal(true);
  readonly closeOnBackdrop = signal(false);
  cancelCount = 0;
}

describe('ModalDialogDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  async function setup(platform: 'browser' | 'server' = 'browser'): Promise<ComponentFixture<HostComponent>> {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: PLATFORM_ID, useValue: platform }],
    }).compileComponents();

    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    return f;
  }

  afterEach(() => {
    // A native <dialog> opened via showModal() stays open until close() runs
    // in ngOnDestroy; destroying the fixture (rather than relying only on
    // TestBed.resetTestingModule()) ensures the next test's dialog isn't
    // fighting a still-open modal left over from this one.
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  function dialogEl(f: ComponentFixture<HostComponent>): HTMLDialogElement {
    return f.nativeElement.querySelector('dialog.modal') as HTMLDialogElement;
  }

  it('does not emit modalCancel on a backdrop click when closeOnBackdrop is unset (default false)', async () => {
    fixture = await setup();
    const dialog = dialogEl(fixture);

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelCount).toBe(0);
  });

  it('emits modalCancel on a click that lands on the dialog element itself when closeOnBackdrop is true', async () => {
    fixture = await setup();
    fixture.componentInstance.closeOnBackdrop.set(true);
    fixture.detectChanges();
    const dialog = dialogEl(fixture);

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelCount).toBe(1);
  });

  it('does not emit modalCancel on a click inside the panel content when closeOnBackdrop is true', async () => {
    fixture = await setup();
    fixture.componentInstance.closeOnBackdrop.set(true);
    fixture.detectChanges();

    const innerBtn = fixture.nativeElement.querySelector('#inner-btn') as HTMLElement;
    innerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelCount).toBe(0);
  });

  it('still emits modalCancel on Esc (native cancel event) regardless of closeOnBackdrop', async () => {
    fixture = await setup();
    const dialog = dialogEl(fixture);

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelCount).toBe(1);
  });

  it('does nothing on SSR (no browser platform) and never throws', async () => {
    expect(async () => {
      fixture = await setup('server');
      fixture.detectChanges();
    }).not.toThrow();
  });
});
