/** CON-01 self-test fixture: violating — a *.service.ts directly under the feature root, not services/. */
export class FxconRootService {
  ping(): string {
    return 'pong';
  }
}
