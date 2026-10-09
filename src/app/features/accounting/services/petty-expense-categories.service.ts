import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import {
  AccountingInputTaxRecoveryService,
  AccountingPettyExpenseCategoriesService,
  GLAccountResponse,
  GLAccountResponseAccountTypeEnum,
  GLAccountsService,
  InputTaxRecoveryCategory,
  InputTaxRecoveryCountryEvidenceRules,
  InputTaxRecoveryHistoryItem,
  InputTaxRecoveryRegime,
  InputTaxRecoveryResponse,
  PettyExpenseCategoryAccount,
  PettyExpenseCategoryHistoryItem,
  PettyExpenseCategoryResponse,
  PettyExpenseCategoryTaxRecoveryResponse,
} from '@durion-sdk/accounting';
import {
  InputTaxRecovery,
  RecoveryCategory,
  RecoveryChange,
  RecoveryCountryEvidence,
  RecoveryRegime,
  TaxShareCommand,
  TaxShareResult,
} from '../models/input-tax-recovery.models';
import {
  ExpenseAccountOption,
  PettyExpenseAccount,
  PettyExpenseCategory,
  PettyExpenseCategoryChange,
  PettyExpenseCategoryCreate,
  PettyExpenseCategoryDeactivate,
  PettyExpenseCategoryRelabel,
  PettyExpenseCategoryRemap,
  PettyExpenseChangeType,
} from '../models/petty-expense-categories.models';

const CHANGE_TYPES: readonly PettyExpenseChangeType[] = ['CREATE', 'RELABEL', 'DEACTIVATE', 'REMAP'];
const ACCOUNT_PAGE_SIZE = 200;
const MAX_ACCOUNT_PAGES = 10;

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * Petty-expense categories (CAP:550 S15 / S21, SPEC-accounting-workspace §4.6,
 * §5.5) through `@durion-sdk/accounting` `AccountingPettyExpenseCategoriesService`
 * (ADR-0041), the dedicated `/v1/accounting/petty-expense-categories` endpoints;
 * the generic mapping-key writes refuse petty keys (422
 * `PETTY_EXPENSE_CATEGORY_MANAGED`) and are never used. The account picker reads
 * `GLAccountsService.listGLAccounts`.
 *
 * Every command carries the "Why?" as `justification` and the intent's
 * `requestId`, and never an actor (ADR-0018). Gates (ADR-0040 §6a):
 * `list` `accounting:mapping-key:view`; `create` `accounting:mapping-key:create`
 * and `accounting:gl-mapping:create`; `relabel` `accounting:mapping-key:edit`;
 * `deactivate` `accounting:mapping-key:deactivate`; `remap`
 * `accounting:gl-mapping:create`; `listExpenseAccounts` `accounting:coa:view`.
 *
 * S33 (#470): `recovery` reads `AccountingInputTaxRecoveryService.getInputTaxRecovery`
 * (`accounting:mapping-key:view`) and `setTaxShare` writes
 * `setPettyExpenseCategoryTaxRecovery` (`accounting:mapping-key:edit`).
 */
@Injectable({ providedIn: 'root' })
export class PettyExpenseCategoriesService {
  private readonly sdk = inject(AccountingPettyExpenseCategoriesService);
  private readonly accountsSdk = inject(GLAccountsService);
  private readonly recoverySdk = inject(AccountingInputTaxRecoveryService);

  /** Every category, active and inactive, in the served (code) order, with its accounts and history. */
  list(): Observable<PettyExpenseCategory[]> {
    return this.sdk.listPettyExpenseCategories().pipe(map(view => (view.categories ?? []).map(toCategory)));
  }

  /** Creates a category and its account in one call (S15). */
  create(command: PettyExpenseCategoryCreate): Observable<PettyExpenseCategory> {
    const base = {
      code: command.code,
      label: command.label,
      glAccountId: command.glAccountId,
      justification: command.justification,
      requestId: command.requestId,
    };
    return this.sdk
      .createPettyExpenseCategory(command.examples === null ? base : { ...base, examples: command.examples })
      .pipe(map(toCategory));
  }

  /** Changes the label and examples; the code is the path and never changes. */
  relabel(code: string, command: PettyExpenseCategoryRelabel): Observable<PettyExpenseCategory> {
    const body = { label: command.label, justification: command.justification, requestId: command.requestId };
    const withExamples = command.examples === null ? body : { ...body, examples: command.examples };
    return this.sdk
      .updatePettyExpenseCategory(code, command.version === null ? withExamples : { ...withExamples, version: command.version })
      .pipe(map(toCategory));
  }

  /** Turns a category off; recorded payouts keep it. There is no reactivation. */
  deactivate(code: string, command: PettyExpenseCategoryDeactivate): Observable<PettyExpenseCategory> {
    return this.sdk
      .deactivatePettyExpenseCategory(code, { justification: command.justification, requestId: command.requestId })
      .pipe(map(toCategory));
  }

  /** Moves the category to another expense account from a local day; earlier payouts stay where they are. */
  remap(code: string, command: PettyExpenseCategoryRemap): Observable<PettyExpenseCategory> {
    return this.sdk
      .remapPettyExpenseCategory(code, {
        glAccountId: command.glAccountId,
        effectiveFrom: command.effectiveFrom,
        justification: command.justification,
        requestId: command.requestId,
      })
      .pipe(map(toCategory));
  }

  /**
   * The shop's input-tax recovery (S32d): registered regimes and whether each recovers today, the
   * evidence rules, every category's share and the change history. A missing list is read as
   * empty only where the contract says so (`categories`, `history`, `regimes`); `evidenceRules`
   * stays null when the tax service did not answer.
   */
  recovery(): Observable<InputTaxRecovery> {
    return this.recoverySdk.getInputTaxRecovery().pipe(map(toRecovery));
  }

  /**
   * Sets a category's share of stated tax claimed back, from now on (S32d item 4). The share is
   * sent only when recoverable; the version is the one read (0 for a category never set).
   */
  setTaxShare(code: string, command: TaxShareCommand): Observable<TaxShareResult> {
    const body = {
      taxRecoverable: command.taxRecoverable,
      version: command.version,
      justification: command.justification,
      requestId: command.requestId,
    };
    return this.sdk
      .setPettyExpenseCategoryTaxRecovery(
        code,
        command.taxRecoverable && command.recoverablePercent !== null ? { ...body, recoverablePercent: command.recoverablePercent } : body,
      )
      .pipe(map(toShareResult));
  }

  /**
   * The picker's active expense accounts, by account number: page 0, then each
   * further page (bounded). The server's eligibility answer stays authoritative
   * (422 `PETTY_EXPENSE_ACCOUNT_NOT_ELIGIBLE`).
   */
  listExpenseAccounts(): Observable<ExpenseAccountOption[]> {
    const readPage = (page: number) =>
      this.accountsSdk.listGLAccounts('accountCode,asc', page, ACCOUNT_PAGE_SIZE, 'ACTIVE').pipe(
        map(response => ({
          rows: (response?.glAccounts ?? []).filter(isExpenseOption).map(toAccountOption),
          totalPages: response?.totalPages ?? 1,
        })),
      );
    return readPage(0).pipe(
      switchMap(first => {
        const pages = Math.min(MAX_ACCOUNT_PAGES, Math.max(1, first.totalPages));
        if (pages === 1) return of(first.rows);
        const rest = Array.from({ length: pages - 1 }, (_, i) => readPage(i + 1).pipe(map(result => result.rows)));
        return forkJoin(rest).pipe(map(later => [...first.rows, ...later.flat()]));
      }),
    );
  }
}

function isExpenseOption(row: GLAccountResponse | null | undefined): row is GLAccountResponse {
  return !!row?.glAccountId && row.accountType === GLAccountResponseAccountTypeEnum.Expense && !!text(row.accountCode);
}

function toAccountOption(row: GLAccountResponse): ExpenseAccountOption {
  return { glAccountId: row.glAccountId, accountCode: row.accountCode?.trim() ?? '', accountName: row.accountName?.trim() ?? '' };
}

function toAccount(account: PettyExpenseCategoryAccount | null | undefined): PettyExpenseAccount | null {
  if (!account) return null;
  return {
    glAccountId: text(account.glAccountId),
    accountCode: text(account.accountCode),
    accountName: text(account.accountName),
    effectiveFrom: text(account.effectiveFrom),
  };
}

function toChange(item: PettyExpenseCategoryHistoryItem): PettyExpenseCategoryChange {
  const changeType = (CHANGE_TYPES as readonly string[]).includes(item.changeType ?? '')
    ? (item.changeType as PettyExpenseChangeType)
    : 'UNKNOWN';
  return {
    changedAt: item.changedAt ?? '',
    changeType,
    oldValue: item.oldValue ?? null,
    newValue: item.newValue ?? null,
    justification: item.justification ?? '',
  };
}

function toCategory(view: PettyExpenseCategoryResponse): PettyExpenseCategory {
  const status = view.status === 'ACTIVE' || view.status === 'INACTIVE' ? view.status : 'UNKNOWN';
  return {
    code: view.code ?? '',
    label: view.label ?? '',
    examples: text(view.examples),
    status,
    currentAccount: toAccount(view.currentAccount),
    laterAccount: toAccount(view.laterAccount),
    version: view.version ?? null,
    history: (view.history ?? []).map(toChange),
  };
}

function toRegime(regime: InputTaxRecoveryRegime): RecoveryRegime {
  return {
    countryCode: regime.countryCode,
    regime: regime.regime,
    enabled: typeof regime.enabled === 'boolean' ? regime.enabled : null,
    registrationNumber: text(regime.registration?.number),
    since: text(regime.registration?.since),
    accountName: text(regime.account?.name),
    accountCode: text(regime.account?.code),
  };
}

function toEvidence(country: InputTaxRecoveryCountryEvidenceRules): RecoveryCountryEvidence {
  return {
    countryCode: country.countryCode,
    currencyCode: text(country.currencyCode),
    rules: (country.rules ?? [])
      .filter(rule => typeof rule.threshold === 'number')
      .map(rule => ({ appliesTo: rule.appliesTo ?? [], rule: rule.rule, threshold: rule.threshold })),
  };
}

function toRecoveryCategory(category: InputTaxRecoveryCategory): RecoveryCategory {
  return {
    code: category.code,
    label: category.label,
    taxRecoverable: category.taxRecoverable === true,
    recoverablePercent: typeof category.recoverablePercent === 'number' ? category.recoverablePercent : null,
    version: category.version,
  };
}

function toRecoveryChange(item: InputTaxRecoveryHistoryItem): RecoveryChange {
  return {
    code: item.code,
    effectiveFrom: item.effectiveFrom,
    actorRole: text(item.actorRole),
    oldTaxRecoverable: typeof item.oldTaxRecoverable === 'boolean' ? item.oldTaxRecoverable : null,
    oldRecoverablePercent: typeof item.oldRecoverablePercent === 'number' ? item.oldRecoverablePercent : null,
    newTaxRecoverable: item.newTaxRecoverable === true,
    newRecoverablePercent: typeof item.newRecoverablePercent === 'number' ? item.newRecoverablePercent : null,
    reason: item.reason ?? '',
  };
}

function toRecovery(view: InputTaxRecoveryResponse): InputTaxRecovery {
  return {
    asOf: view.asOf,
    regimes: (view.regimes ?? []).map(toRegime),
    evidence: Array.isArray(view.evidenceRules) ? view.evidenceRules.map(toEvidence) : null,
    categories: (view.categories ?? []).map(toRecoveryCategory),
    history: (view.history ?? []).map(toRecoveryChange),
  };
}

function toShareResult(view: PettyExpenseCategoryTaxRecoveryResponse): TaxShareResult {
  return {
    code: view.code,
    taxRecoverable: view.taxRecoverable === true,
    recoverablePercent: typeof view.recoverablePercent === 'number' ? view.recoverablePercent : null,
    version: view.version,
    replayed: view.replayed === true,
  };
}
