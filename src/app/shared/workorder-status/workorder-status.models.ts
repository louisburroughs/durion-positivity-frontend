/**
 * Workorder status enum shared between `workexec` (source of truth — mirrors
 * the backend `WorkorderStatus` / SDK `WorkorderDetailResponseStatusEnum`,
 * pos-workorder/openapi.yaml) and `shopmgmt` (the shop dashboard, which
 * aggregates workorder statuses across bays and mobile units).
 *
 * Kept in `shared/` — types only, no dependency on `features/**` — so
 * `shopmgmt` never has to import `workexec`'s Estimate/Workorder DTOs for the
 * one status union it actually needs (ADR-0036 §2). `workexec.models.ts`
 * re-exports this type so its own many internal usages are unaffected.
 */
export type WorkorderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'ASSIGNED'
  | 'WORK_IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'AWAITING_APPROVAL'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'CANCELLED';
