import { CatalogBulkImportPageComponent } from './catalog-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: CatalogBulkImportPageComponent,
  componentName: 'CatalogBulkImportPageComponent',
  domainType: 'CATALOG',
});
