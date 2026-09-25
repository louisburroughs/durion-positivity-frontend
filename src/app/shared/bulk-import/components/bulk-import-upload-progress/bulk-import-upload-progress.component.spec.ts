import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BulkImportUploadProgressComponent } from './bulk-import-upload-progress.component';

describe('BulkImportUploadProgressComponent', () => {
  let component: BulkImportUploadProgressComponent;
  let fixture: ComponentFixture<BulkImportUploadProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkImportUploadProgressComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportUploadProgressComponent);
    component = fixture.componentInstance;
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('defaults progress to 0 and fileName to empty', () => {
    fixture.detectChanges();
    expect(component.progress).toBe(0);
    expect(component.fileName).toBe('');
  });

  it('renders the file name and percent text from inputs', () => {
    component.fileName = 'tires.csv';
    component.progress = 42;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.upload-progress__filename')?.textContent?.trim()).toBe('tires.csv');
    expect(el.querySelector('.upload-progress__percent')?.textContent?.trim()).toBe('42%');
  });

  it('binds the progress value to the native <progress> element', () => {
    component.progress = 75;
    fixture.detectChanges();

    const bar: HTMLProgressElement | null = fixture.nativeElement.querySelector('.upload-progress__bar-container');
    expect(bar?.value).toBe(75);
    expect(bar?.max).toBe(100);
  });

  it('reflects progress as a percentage width on the fill bar', () => {
    component.progress = 30;
    fixture.detectChanges();

    const fill: HTMLElement | null = fixture.nativeElement.querySelector('.upload-progress__bar');
    expect(fill?.style.width).toBe('30%');
  });

  it('emits cancelUpload when the cancel button is clicked', () => {
    fixture.detectChanges();
    let emitted = false;
    component.cancelUpload.subscribe(() => (emitted = true));

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.upload-progress__cancel');
    button.click();

    expect(emitted).toBe(true);
  });

  it('does not emit cancelUpload on its own', () => {
    fixture.detectChanges();
    let emitted = false;
    component.cancelUpload.subscribe(() => (emitted = true));

    expect(emitted).toBe(false);
  });
});
