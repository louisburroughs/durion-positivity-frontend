import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-bulk-import-upload-progress',
  templateUrl: './bulk-import-upload-progress.component.html',
  styleUrl: './bulk-import-upload-progress.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class BulkImportUploadProgressComponent {
  @Input() progress = 0;
  @Input() fileName = '';
  @Output() readonly cancelUpload = new EventEmitter<void>();
}
