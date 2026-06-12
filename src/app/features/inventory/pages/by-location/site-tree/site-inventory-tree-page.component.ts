import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { InventoryRollupApiService } from '../../../services/inventory-rollup.service';
import {
  RollupError,
  SiteInventoryRollupResponse,
  StorageLocationRollupNode,
  isRollupError,
} from '../../../models/inventory-rollup.models';
import { SkuFilterComponent } from '../../../components/sku-filter/sku-filter.component';

/** Page state following the repo's two-signal pattern. */
type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

/** Set of expanded storageLocationIds. Preserved across SKU re-query. */
type ExpandSet = Set<string>;

/**
 * A flattened row used for rendering and CDK virtual scroll.
 * Carries the node plus display metadata derived at flatten time.
 */
export interface TreeRow {
  node: StorageLocationRollupNode;
  /** 1-based depth. Root nodes = 1. */
  depth: number;
  /** Whether this row is currently visible (all ancestors expanded). */
  visible: boolean;
  /** Parent storageLocationId, or null for roots. */
  parentId: string | null;
  /** Whether the node has children. */
  hasChildren: boolean;
  /** Whether the node is currently expanded. */
  expanded: boolean;
  /** Whether available is negative on this node's own quantities. */
  hasNegativeAvailable: boolean;
  /** Whether node is non-ACTIVE and has rolledUp.onHand > 0. */
  hasStockInInactiveLocation: boolean;
}

@Component({
  selector: 'app-site-inventory-tree-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    TranslatePipe,
    FormsModule,
    SkuFilterComponent,
  ],
  templateUrl: './site-inventory-tree-page.component.html',
  styleUrl: './site-inventory-tree-page.component.css',
})
export class SiteInventoryTreePageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rollupService = inject(InventoryRollupApiService);
  // DestroyRef unused directly — we manage querySub manually in ngOnDestroy
  private readonly _destroyRef = inject(DestroyRef);

  // ── State signals ──────────────────────────────────────────────────────────

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly rollupError = signal<RollupError | null>(null);

  readonly siteName = signal<string>('');
  readonly siteId = signal<string>('');

  readonly response = signal<SiteInventoryRollupResponse | null>(null);

  readonly currentSku = signal<string | undefined>(undefined);
  readonly includeEmpty = signal(false);

  /**
   * Expand state: set of expanded storageLocationIds.
   * Preserved across SKU re-query.
   */
  readonly expandedIds = signal<ExpandSet>(new Set<string>());

  /** Non-destructive banner: true when upstream is down but data is stale-available. */
  readonly showUpstreamBanner = signal(false);

  // ── Query pipeline ─────────────────────────────────────────────────────────

  private readonly queryTrigger = new Subject<{ sku: string | undefined; includeEmpty: boolean }>();
  private querySub: Subscription | null = null;

  // ── Derived signals ────────────────────────────────────────────────────────

  /**
   * All rows (visible and hidden) flattened from the response tree.
   * Recomputes whenever response or expandedIds changes.
   */
  readonly allRows = computed<TreeRow[]>(() => {
    const resp = this.response();
    if (!resp) return [];
    const expanded = this.expandedIds();
    const rows: TreeRow[] = [];
    flattenNodes(resp.nodes ?? [], 1, null, expanded, rows, true);
    return rows;
  });

  /** Visible rows only — what the user sees. */
  readonly visibleRows = computed<TreeRow[]>(() => this.allRows().filter(r => r.visible));

  /** Count of over-allocated nodes across the whole tree (not just visible). */
  readonly overAllocatedCount = computed(() => this.allRows().filter(r => r.hasNegativeAvailable).length);

  /** Whether to use CDK virtual scroll (> 200 visible rows). */
  readonly useVirtualScroll = computed(() => this.visibleRows().length > 200);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
    this.siteId.set(siteId);

    // Pull site name from router navigation state (passed by overview page)
    const nav = this.router.getCurrentNavigation();
    const navState = nav?.extras?.state as { siteName?: string } | undefined;
    const siteName = navState?.siteName ?? siteId.slice(0, 12);
    this.siteName.set(siteName);

    // Wire up the switchMap query pipeline — inflight cancellation on re-query
    this.querySub = this.queryTrigger
      .pipe(
        switchMap(({ sku, includeEmpty }) => {
          // Only show full loading skeleton on first load (no data yet)
          if (this.response() === null) {
            this.state.set('loading');
          }
          this.errorKey.set(null);

          return this.rollupService.getSiteRollup(siteId, { sku, includeEmpty });
        }),
      )
      .subscribe({
        next: resp => {
          this.showUpstreamBanner.set(false);
          this.rollupError.set(null);
          this.response.set(resp);

          // Auto-expand paths to negative-available nodes
          const negativePathIds = collectNegativeAvailablePaths(resp.nodes ?? []);
          // Auto-expand depth ≤ 2 on first load and on filter change
          const depth2Ids = collectDepth2Ids(resp.nodes ?? []);

          this.expandedIds.update(current => {
            const next = new Set(current);
            negativePathIds.forEach(id => next.add(id));
            depth2Ids.forEach(id => next.add(id));
            return next;
          });

          this.state.set((resp.nodes ?? []).length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const rollupErr: RollupError = isRollupError(err)
            ? err
            : { kind: 'unknown', message: String(err) };
          this.rollupError.set(rollupErr);

          if (rollupErr.kind === 'upstream-down') {
            // Non-destructive: show banner, keep existing data visible
            this.showUpstreamBanner.set(true);
            if (this.response() === null) {
              // No prior data to show — full error state
              this.state.set('error');
              this.errorKey.set('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.UPSTREAM_DOWN');
            }
            // If data exists, state stays 'ready' — banner overlays it
          } else if (rollupErr.kind === 'not-found') {
            this.state.set('error');
            this.errorKey.set('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.NOT_FOUND');
          } else if (rollupErr.kind === 'forbidden') {
            this.state.set('error');
            this.errorKey.set('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.FORBIDDEN');
          } else {
            this.state.set('error');
            this.errorKey.set('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.UNKNOWN');
            console.error('[SiteInventoryTreePage] Unexpected rollup error', err);
          }
        },
      });

    this.triggerQuery();
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }

  // ── User interactions ──────────────────────────────────────────────────────

  onSkuChange(sku: string | undefined): void {
    this.currentSku.set(sku);
    this.triggerQuery();
  }

  onIncludeEmptyChange(value: boolean): void {
    this.includeEmpty.set(value);
    this.triggerQuery();
  }

  refresh(): void {
    this.triggerQuery();
  }

  dismissBanner(): void {
    this.showUpstreamBanner.set(false);
  }

  toggleRow(nodeId: string): void {
    this.expandedIds.update(current => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  /**
   * Keyboard handler for treegrid rows.
   * Enter/Space: toggle expand/collapse.
   * ArrowRight: expand if collapsed and has children.
   * ArrowLeft: collapse if expanded.
   */
  onRowKeydown(event: KeyboardEvent, row: TreeRow): void {
    switch (event.key) {
      case 'Enter':
      case ' ':
        if (row.hasChildren) {
          event.preventDefault();
          this.toggleRow(row.node.storageLocationId);
        }
        break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) {
          event.preventDefault();
          this.expandedIds.update(s => new Set([...s, row.node.storageLocationId]));
        }
        break;
      case 'ArrowLeft':
        if (row.expanded) {
          event.preventDefault();
          this.expandedIds.update(s => {
            const n = new Set(s);
            n.delete(row.node.storageLocationId);
            return n;
          });
        }
        break;
      default:
        break;
    }
  }

  isExpanded(nodeId: string): boolean {
    return this.expandedIds().has(nodeId);
  }

  isNonActive(status: string | undefined): boolean {
    return status !== undefined && status !== 'ACTIVE';
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private triggerQuery(): void {
    this.queryTrigger.next({
      sku: this.currentSku(),
      includeEmpty: this.includeEmpty(),
    });
  }
}

// ── Pure tree helpers (exported for testing) ──────────────────────────────────

/**
 * Recursively flatten the node tree into {@link TreeRow} objects.
 *
 * @param nodes - nodes to flatten
 * @param depth - current depth (1-based)
 * @param parentId - parent storageLocationId, null for roots
 * @param expanded - set of expanded node IDs
 * @param out - accumulator array
 * @param parentVisible - whether the parent is visible
 */
export function flattenNodes(
  nodes: StorageLocationRollupNode[],
  depth: number,
  parentId: string | null,
  expanded: ExpandSet,
  out: TreeRow[],
  parentVisible: boolean,
): void {
  for (const node of nodes) {
    const hasChildren = (node.children ?? []).length > 0;
    const isExpanded = expanded.has(node.storageLocationId);
    const hasNegativeAvailable = node.own.available < 0;
    const isInactive = node.status !== undefined && node.status !== 'ACTIVE';
    const hasStockInInactiveLocation = isInactive && (node.rolledUp?.onHand ?? 0) > 0;

    out.push({
      node,
      depth,
      visible: parentVisible,
      parentId,
      hasChildren,
      expanded: isExpanded,
      hasNegativeAvailable,
      hasStockInInactiveLocation,
    });

    if (hasChildren) {
      flattenNodes(
        node.children!,
        depth + 1,
        node.storageLocationId,
        expanded,
        out,
        parentVisible && isExpanded,
      );
    }
  }
}

/**
 * Collect the storageLocationIds on the path from the root down to any
 * negative-available node, so auto-expand can reveal it.
 * Returns the set of ancestor IDs that need to be expanded.
 */
export function collectNegativeAvailablePaths(
  nodes: StorageLocationRollupNode[],
  ancestors: string[] = [],
): ExpandSet {
  const toExpand = new Set<string>();
  for (const node of nodes) {
    const currentPath = [...ancestors, node.storageLocationId];
    const hasNeg = node.own.available < 0;
    const childSet = collectNegativeAvailablePaths(node.children ?? [], currentPath);

    if (hasNeg || childSet.size > 0) {
      // Expand all ancestor nodes so this one becomes visible
      ancestors.forEach(id => toExpand.add(id));
      childSet.forEach(id => toExpand.add(id));
    }
  }
  return toExpand;
}

/**
 * Collect storageLocationIds for nodes at depth ≤ 2 that have children,
 * for default-expand on load.
 */
export function collectDepth2Ids(
  nodes: StorageLocationRollupNode[],
  depth = 1,
): string[] {
  const ids: string[] = [];
  if (depth > 2) return ids;
  for (const node of nodes) {
    if ((node.children ?? []).length > 0) {
      ids.push(node.storageLocationId);
      ids.push(...collectDepth2Ids(node.children ?? [], depth + 1));
    }
  }
  return ids;
}
