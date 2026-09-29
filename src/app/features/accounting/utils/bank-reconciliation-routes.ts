/**
 * Router commands for the bank-reconciliation pages, in one place so the
 * pages link to each other by the same paths `accounting.routes.ts` declares.
 */
export const bankAccountsCommands = (): string[] => ['/app', 'accounting', 'bank-accounts'];

export const newBankImportCommands = (glAccountId: string): string[] => [
  '/app',
  'accounting',
  'bank-accounts',
  glAccountId,
  'import',
];

export const bankImportCommands = (importId: string): string[] => ['/app', 'accounting', 'bank-imports', importId];

export const bankStatementEntryCommands = (glAccountId: string): string[] => [
  '/app',
  'accounting',
  'bank-accounts',
  glAccountId,
  'statements',
  'new',
];

export const reconciliationWorkspaceCommands = (reconciliationId: string): string[] => [
  '/app',
  'accounting',
  'reconciliations',
  reconciliationId,
];
