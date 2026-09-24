/** CON-03 self-test fixture: one method referenced by the spec, one not. */
export class FxconCon03Service {
  covered(): string {
    return 'ok';
  }

  notCovered(): string {
    return 'ok';
  }

  private helper(): void {
    // private members are out of scope for CON-03
  }
}
