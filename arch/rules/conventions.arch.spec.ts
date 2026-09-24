import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { con01, con02, con03, con04, con05, con06, con07, con08, con09 } from './conventions.rules';

describe('conventions and placement (plan §5.5)', () => {
  archTest(con01(APP));
  archTest(con02(APP));
  archTest(con03(APP));
  archTest(con04(APP));
  archTest(con05(APP));
  archTest(con06(APP));
  archTest(con07(APP));
  archTest(con08(APP));
  archTest(con09(APP));
});
