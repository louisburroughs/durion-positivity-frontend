import { archTest } from '../support/baseline';
import { APP } from '../support/projects';
import { lay01 } from './layers.rules';

describe('layers and feature isolation (plan §5.1)', () => {
  archTest(lay01(APP));
});
