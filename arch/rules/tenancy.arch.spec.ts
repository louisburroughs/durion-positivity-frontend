import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { ten01, ten02, ten03, ten04, ten05, ten06, ten07, ten08 } from './tenancy.rules';

describe('tenancy (plan §5.3)', () => {
  archTest(ten01(APP));
  archTest(ten02(APP));
  archTest(ten03(APP));
  archTest(ten04(APP));
  archTest(ten05(APP));
  archTest(ten06(APP));
  archTest(ten07(APP));
  archTest(ten08(APP));
});
