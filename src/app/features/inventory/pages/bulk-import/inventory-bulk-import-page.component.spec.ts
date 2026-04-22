import { InventoryBulkImportPageComponent } from './inventory-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: InventoryBulkImportPageComponent,
  componentName: 'InventoryBulkImportPageComponent',
  domainType: 'INVENTORY',
});
