import { archTest } from '../support/baseline';
import { APP, SPEC } from '../support/projects';
import { pat01, pat02, pat03, pat04, pat05, pat06, pat07, pat08 } from './patterns.rules';

describe('reactive-state and date patterns (plan §5.6)', () => {
  archTest(pat01(APP));
  archTest(pat02(APP));
  archTest(pat03(APP));
  archTest(pat04(APP));
  archTest(pat05(APP));
  archTest(pat06(SPEC));
  archTest(pat07(APP));
  archTest(pat08(APP));
});
