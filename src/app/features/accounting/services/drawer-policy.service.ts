import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Change,
  RegisterSessionsService,
  SessionPolicyResponse,
  TypePolicy,
  TypeSetting,
  UpdateSessionPolicyRequest,
} from '@durion-sdk/order';
import {
  DrawerMovementType,
  DrawerPolicyHistoryRow,
  DrawerPolicyRead,
  DrawerPolicySetting,
  DrawerPolicyUpdate,
  DrawerTypePolicy,
  DrawerTypeSetting,
} from '../models/drawer-policy.models';

const TYPES: readonly DrawerMovementType[] = ['PETTY_EXPENSE', 'VENDOR_COD', 'BANK_DROP', 'FLOAT_CHANGE'];
const SETTINGS: readonly DrawerPolicySetting[] = [
  'PETTY_EXPENSE_ALLOWED',
  'PETTY_EXPENSE_LIMIT',
  'VENDOR_COD_ALLOWED',
  'VENDOR_COD_LIMIT',
  'OVER_SHORT_TOLERANCE',
];

/**
 * The drawer policy (CAP:550 S16 / S21, SPEC-accounting-workspace §4.6, §5.5):
 * pos-order's `getSessionPolicy` / `updateSessionPolicy` through
 * `@durion-sdk/order` `RegisterSessionsService` (ADR-0041), wrapped inside the
 * accounting feature so it never imports `features/order` (arch rule LAY-03).
 * Both calls need `order:session_policy:manage`; the Drawer cash section, its
 * Save leg and their handlers gate on it (`ACCOUNTING_SECTION.drawerPolicy`).
 * Order owns these settings (AW19): nothing here is copied into pos-accounting.
 */
@Injectable({ providedIn: 'root' })
export class DrawerPolicyService {
  private readonly sdk = inject(RegisterSessionsService);

  /** The tenant's policy (the defaults until one is stored) and its history, newest first. */
  getPolicy(): Observable<DrawerPolicyRead> {
    return this.sdk.getSessionPolicy().pipe(map(toRead));
  }

  /**
   * Replaces the two configurable types and the tolerance with the reason. It
   * writes nothing when nothing changed, and the version read makes a racing
   * change answer 409 `SESSION_POLICY_CONFLICT` rather than overwrite it (S16).
   * No actor is sent (ADR-0018).
   */
  updatePolicy(update: DrawerPolicyUpdate): Observable<DrawerPolicyRead> {
    const request: UpdateSessionPolicyRequest = {
      currencyCode: update.currencyCode,
      justification: update.justification,
      overShortTolerance: update.overShortTolerance,
      pettyExpense: toTypeSetting(update.pettyExpense),
      vendorCod: toTypeSetting(update.vendorCod),
    };
    return this.sdk
      .updateSessionPolicy(update.version === null ? request : { ...request, version: update.version })
      .pipe(map(toRead));
  }
}

function toTypeSetting(setting: DrawerTypeSetting): TypeSetting {
  return setting.cashierLimit === null ? { allowed: setting.allowed } : { allowed: setting.allowed, cashierLimit: setting.cashierLimit };
}

function toRead(view: SessionPolicyResponse): DrawerPolicyRead {
  return {
    policy: {
      version: view.version ?? null,
      currencyCode: view.currencyCode ?? '',
      types: (view.types ?? []).map(toType),
      overShortTolerance: view.overShortTolerance ?? null,
    },
    history: (view.history ?? []).map(toHistoryRow),
  };
}

function toType(row: TypePolicy): DrawerTypePolicy {
  const type = (TYPES as readonly string[]).includes(row.type ?? '') ? (row.type as DrawerMovementType) : 'UNKNOWN';
  return {
    type,
    allowed: row.allowed === true,
    cashierLimit: row.cashierLimit ?? null,
    alwaysNeedsManager: row.alwaysNeedsManager === true,
    // An unknown type is never editable here, whatever is served (§8.2).
    editable: type !== 'UNKNOWN' && row.editable === true,
  };
}

function toHistoryRow(row: Change): DrawerPolicyHistoryRow {
  const setting = (SETTINGS as readonly string[]).includes(row.setting ?? '') ? (row.setting as DrawerPolicySetting) : 'UNKNOWN';
  return {
    changedAt: row.changedAt ?? '',
    setting,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue ?? null,
    justification: row.justification ?? '',
  };
}
