import { VehicleFitmentBulkImportPageComponent } from './vehicle-fitment-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: VehicleFitmentBulkImportPageComponent,
  componentName: 'VehicleFitmentBulkImportPageComponent',
  domainType: 'VEHICLE_FITMENT',
});
