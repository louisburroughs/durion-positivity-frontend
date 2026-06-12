import type {
  LocationInventoryRollupResponse,
  RollupQuantities,
  SiteInventoryRollupResponse,
  SiteRollupSummary,
  StorageLocationRollupNode,
} from '@durion-sdk/inventory';

/**
 * Inventory-by-location rollup models (CAP-218 frontend story F1).
 *
 * Payload types come from the generated SDK and are re-exported here so
 * feature code never imports `@durion-sdk/inventory` directly (spec
 * SPEC-inventory-location-rollup-frontend.md §4.1). Hand-written parallels
 * of these payloads are prohibited.
 */
export type {
  LocationInventoryRollupResponse,
  RollupQuantities,
  SiteInventoryRollupResponse,
  SiteRollupSummary,
  StorageLocationRollupNode,
};

/** Options for the site rollup query. */
export interface SiteRollupOptions {
  /** Optional stock item (SKU) filter; blank treated as absent. */
  sku?: string;
  /** Maximum tree depth to return (1 = root storage locations only). */
  depth?: number;
  /** Include storage locations with zero on-hand and zero allocations. */
  includeEmpty?: boolean;
}

/** Options for the parent-location rollup query. v1 never sends expand=tree. */
export interface LocationRollupOptions {
  /** Typed parent chain to walk; backend defaults to PHYSICAL. */
  parentType?: string;
  /** Optional stock item (SKU) filter; blank treated as absent. */
  sku?: string;
}

/**
 * Discriminated error union surfaced by the rollup facade so views can
 * render contract-driven states (spec §5) without inspecting HTTP details.
 */
export type RollupError =
  | { kind: 'not-found'; message: string }
  | { kind: 'upstream-down'; message: string; retryable: true }
  | { kind: 'forbidden'; message: string }
  | { kind: 'validation'; message: string }
  | { kind: 'unknown'; message: string };

export function isRollupError(value: unknown): value is RollupError {
  return (
    typeof value === 'object'
    && value !== null
    && 'kind' in value
    && typeof (value as { kind: unknown }).kind === 'string'
  );
}
