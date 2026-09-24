import { type Project, selectors } from '../support/projects';
import { type ArchRule, dependencyRule } from '../support/rule';

export const lay01 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-01', title: 'core/** must not depend on features/** (ADR-0010 §2)', mode: 'enforce' },
    p,
    { subject: selectors.core(p), target: selectors.features(p) },
  );
