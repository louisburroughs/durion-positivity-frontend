import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { sec01, sec02, sec03, sec04, sec05, sec06, sec07, sec08, sec09 } from './security.rules';

describe('security and navigation (plan §5.4)', () => {
  archTest(sec01(APP));
  archTest(sec02(APP));
  archTest(sec03(APP));
  archTest(sec04(APP));
  archTest(sec05(APP));
  archTest(sec06(APP));
  archTest(sec07(APP));
  archTest(sec08(APP));
  archTest(sec09(APP));
});
