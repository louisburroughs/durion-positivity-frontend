import { PeopleBulkImportPageComponent } from './people-bulk-import-page.component';
import { describeBulkImportWizardPage } from '../../../bulk-import/testing/bulk-import-wizard-page.component.spec-helper';

describeBulkImportWizardPage({
  component: PeopleBulkImportPageComponent,
  componentName: 'PeopleBulkImportPageComponent',
  domainType: 'PEOPLE',
});
