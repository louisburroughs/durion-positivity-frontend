import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { lay01, lay02, lay03, lay03d, lay04, lay05, lay06, lay07, lay08 } from './layers.rules';

describe('layers and feature isolation (plan §5.1)', () => {
  archTest(lay01(APP));
  archTest(lay02(APP));
  archTest(lay03(APP));
  archTest(lay03d(APP));
  archTest(lay04(APP));
  archTest(lay05(APP));
  archTest(lay06(APP));
  archTest(lay07(APP));
  archTest(lay08(APP));
});
