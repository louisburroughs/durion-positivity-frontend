import { ChangeDetectionStrategy, Component, EventEmitter, Output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-bulk-import-file-drop',
  standalone: true,
  templateUrl: './bulk-import-file-drop.component.html',
  styleUrl: './bulk-import-file-drop.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class BulkImportFileDropComponent {
  @Output() readonly fileSelected = new EventEmitter<File>();

  readonly isDragOver = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly acceptedFormats = '.csv,.xlsx';
  readonly maxFileSizeMb = 100;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(): void {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) { this.validateAndEmit(file); }
  }

  onFileInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) { this.validateAndEmit(file); }
  }

  private validateAndEmit(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xlsx'].includes(ext)) {
      this.errorKey.set('BULK_IMPORT.FILE_DROP.ERROR.INVALID_FORMAT');
      return;
    }
    if (file.size > this.maxFileSizeMb * 1024 * 1024) {
      this.errorKey.set('BULK_IMPORT.FILE_DROP.ERROR.TOO_LARGE');
      return;
    }
    this.errorKey.set(null);
    this.fileSelected.emit(file);
  }
}
