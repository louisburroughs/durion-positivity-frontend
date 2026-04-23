import { PriceBulkImportPageComponent } from './price-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: PriceBulkImportPageComponent,
  componentName: 'PriceBulkImportPageComponent',
  domainType: 'PRICE',
});
