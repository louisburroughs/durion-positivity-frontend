import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkLoadColumnMapping, ColumnMappingOverride } from '../../models/bulk-import.models';

@Component({
  selector: 'app-bulk-import-column-mapping-table',
  templateUrl: './bulk-import-column-mapping-table.component.html',
  styleUrl: './bulk-import-column-mapping-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class BulkImportColumnMappingTableComponent {
  @Input() mappings: BulkLoadColumnMapping[] = [];
  @Output() readonly approve = new EventEmitter<ColumnMappingOverride[]>();

  private readonly overrides: Map<string, string> = new Map();

  overrideMapping(mappingId: string, targetField: string): void {
    this.overrides.set(mappingId, targetField);
  }

  getOverrideOrDefault(mapping: BulkLoadColumnMapping): string {
    return this.overrides.get(mapping.mappingId) ?? mapping.targetField;
  }

  onApprove(): void {
    const overrideList: ColumnMappingOverride[] = Array.from(this.overrides.entries())
      .map(([mappingId, targetField]) => ({ mappingId, targetField }));
    this.approve.emit(overrideList);
  }

  confidenceClass(confidence: number): string {
    if (confidence >= 0.8) { return 'confidence--high'; }
    if (confidence >= 0.5) { return 'confidence--medium'; }
    return 'confidence--low';
  }

  confidenceLabel(confidence: number): string {
    if (confidence >= 0.8) { return 'BULK_IMPORT.MAPPING.CONFIDENCE.HIGH'; }
    if (confidence >= 0.5) { return 'BULK_IMPORT.MAPPING.CONFIDENCE.MEDIUM'; }
    return 'BULK_IMPORT.MAPPING.CONFIDENCE.LOW';
  }
}
