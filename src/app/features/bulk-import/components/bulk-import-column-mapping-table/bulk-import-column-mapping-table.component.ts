import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  BulkLoadColumnMapping,
  ColumnMappingOverride,
  DO_NOT_IMPORT_TARGET_FIELD,
} from '../../models/bulk-import.models';

@Component({
  selector: 'app-bulk-import-column-mapping-table',
  standalone: true,
  templateUrl: './bulk-import-column-mapping-table.component.html',
  styleUrl: './bulk-import-column-mapping-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class BulkImportColumnMappingTableComponent {
  @Input() mappings: BulkLoadColumnMapping[] = [];
  @Output() readonly approve = new EventEmitter<ColumnMappingOverride[]>();

  readonly doNotImportValue = DO_NOT_IMPORT_TARGET_FIELD;

  private readonly overrides: Map<string, string> = new Map();

  overrideMapping(mappingId: string, targetField: string): void {
    if (targetField !== DO_NOT_IMPORT_TARGET_FIELD && !this.sortedTargetFields().includes(targetField)) {
      return;
    }

    this.overrides.set(mappingId, targetField);
  }

  getOverrideOrDefault(mapping: BulkLoadColumnMapping): string {
    return this.overrides.get(mapping.mappingId) ?? mapping.targetField;
  }

  onApprove(): void {
    const overrideList: ColumnMappingOverride[] = Array.from(this.overrides.entries())
      .flatMap(([mappingId, targetField]) => {
        const mapping = this.mappings.find(candidate => candidate.mappingId === mappingId);
        if (!mapping) {
          return [];
        }

        return [{
          mappingId,
          sourceColumn: mapping.sourceColumn,
          targetField,
        }];
      });
    this.approve.emit(overrideList);
  }

  targetFieldOptions(): string[] {
    return [this.doNotImportValue, ...this.sortedTargetFields()];
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

  private sortedTargetFields(): string[] {
    return Array.from(new Set(this.mappings.map(mapping => mapping.targetField)))
      .filter(targetField => targetField.length > 0)
      .sort((left, right) => left.localeCompare(right));
  }
}
