import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { i18n01, i18n02, i18n03, i18n04, i18n05, i18n06, i18n07, i18n08, i18n09 } from './i18n.rules';

describe('i18n (plan §5.7)', () => {
  archTest(i18n01());
  archTest(i18n02());
  archTest(i18n03());
  archTest(i18n04());
  archTest(i18n05(APP));
  archTest(i18n06(APP));
  archTest(i18n07(APP));
  archTest(i18n08(APP));
  archTest(i18n09(APP));
});
