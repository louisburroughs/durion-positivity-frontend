import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { sdk01, sdk02, sdk03, sdk04, sdk05, sdk06, sdk07, sdk08, sdk09, sdk10, sdk11 } from './transport.rules';

describe('SDK transport and hardcoded paths (plan §5.2)', () => {
  archTest(sdk01(APP));
  archTest(sdk02(APP));
  archTest(sdk03(APP));
  archTest(sdk04(APP));
  archTest(sdk05(APP));
  archTest(sdk06(APP));
  archTest(sdk07(APP));
  archTest(sdk08(APP));
  archTest(sdk09(APP));
  archTest(sdk10(APP));
  archTest(sdk11(APP));
});
