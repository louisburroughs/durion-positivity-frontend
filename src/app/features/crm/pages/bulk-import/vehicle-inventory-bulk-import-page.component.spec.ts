import { VehicleInventoryBulkImportPageComponent } from './vehicle-inventory-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: VehicleInventoryBulkImportPageComponent,
  componentName: 'VehicleInventoryBulkImportPageComponent',
  domainType: 'VEHICLE_INVENTORY',
});
