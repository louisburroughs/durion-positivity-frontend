import { CustomerBulkImportPageComponent } from './customer-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: CustomerBulkImportPageComponent,
  componentName: 'CustomerBulkImportPageComponent',
  domainType: 'CUSTOMER',
});
