import { LocationBulkImportPageComponent } from './location-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: LocationBulkImportPageComponent,
  componentName: 'LocationBulkImportPageComponent',
  domainType: 'LOCATION',
});
