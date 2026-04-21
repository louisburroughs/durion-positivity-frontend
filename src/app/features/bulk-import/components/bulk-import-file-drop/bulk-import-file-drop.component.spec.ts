import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportFileDropComponent } from './bulk-import-file-drop.component';

describe('BulkImportFileDropComponent', () => {
  let component: BulkImportFileDropComponent;
  let fixture: ComponentFixture<BulkImportFileDropComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkImportFileDropComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportFileDropComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('emits fileSelected for a valid .csv file', () => {
    const emittedFiles: File[] = [];
    component.fileSelected.subscribe(f => emittedFiles.push(f));

    const file = new File(['a,b,c'], 'data.csv', { type: 'text/csv' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    component.onFileInput({ target: input } as unknown as Event);

    expect(emittedFiles.length).toBe(1);
    expect(emittedFiles[0].name).toBe('data.csv');
    expect(component.errorKey()).toBeNull();
  });

  it('emits fileSelected for a valid .xlsx file', () => {
    const emittedFiles: File[] = [];
    component.fileSelected.subscribe(f => emittedFiles.push(f));

    const file = new File(['xlsx-content'], 'data.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    component.onFileInput({ target: input } as unknown as Event);

    expect(emittedFiles.length).toBe(1);
    expect(component.errorKey()).toBeNull();
  });

  it('sets errorKey for invalid file extension', () => {
    const emittedFiles: File[] = [];
    component.fileSelected.subscribe(f => emittedFiles.push(f));

    const file = new File(['content'], 'data.txt', { type: 'text/plain' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    component.onFileInput({ target: input } as unknown as Event);

    expect(emittedFiles.length).toBe(0);
    expect(component.errorKey()).toBe('BULK_IMPORT.FILE_DROP.ERROR.INVALID_FORMAT');
  });

  it('sets errorKey for oversized file', () => {
    const emittedFiles: File[] = [];
    component.fileSelected.subscribe(f => emittedFiles.push(f));

    const oversizeBytes = (component.maxFileSizeMb + 1) * 1024 * 1024;
    const file = new File([''], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: oversizeBytes });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    component.onFileInput({ target: input } as unknown as Event);

    expect(emittedFiles.length).toBe(0);
    expect(component.errorKey()).toBe('BULK_IMPORT.FILE_DROP.ERROR.TOO_LARGE');
  });

  it('onDragOver sets isDragOver to true and prevents default', () => {
    const mockEvent = { preventDefault: vi.fn() } as unknown as DragEvent;
    component.onDragOver(mockEvent);
    expect(component.isDragOver()).toBe(true);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('onDragLeave sets isDragOver to false', () => {
    component.onDragOver({ preventDefault: vi.fn() } as unknown as DragEvent);
    expect(component.isDragOver()).toBe(true);
    component.onDragLeave();
    expect(component.isDragOver()).toBe(false);
  });

  it('onDrop emits fileSelected and clears isDragOver for valid file', () => {
    let callCount = 0;
    let emittedFileName: string | null = null;
    component.fileSelected.subscribe(f => { callCount++; emittedFileName = f.name; });

    const file = new File(['a,b'], 'drop.csv', { type: 'text/csv' });
    const mockDrop = {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;

    component.onDragOver({ preventDefault: vi.fn() } as unknown as DragEvent);
    component.onDrop(mockDrop);

    expect(component.isDragOver()).toBe(false);
    expect(callCount).toBe(1);
    expect(emittedFileName).toBe('drop.csv');
  });
});
