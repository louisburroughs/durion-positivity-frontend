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
import { CommonModule, Location } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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
 * Result union emitted by the inner query observable so that errors never
 * propagate to (and terminate) the outer switchMap subscription.
 */
type QueryResult =
  | { ok: true; response: SiteInventoryRollupResponse }
  | { ok: false; error: RollupError };

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
  private readonly location = inject(Location);
  private readonly rollupService = inject(InventoryRollupApiService);
  // DestroyRef unused directly — we manage querySub manually in ngOnDestroy
  private readonly _destroyRef = inject(DestroyRef);

  constructor() {
    const siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
    this.siteId.set(siteId);

    // Router.getCurrentNavigation() is only non-null while a navigation is in
    // flight, so it must be read in the constructor (Angular-documented
    // pattern). On refresh/direct load it is null; fall back to the persisted
    // history state, then to a short form of the siteId.
    const nav = this.router.getCurrentNavigation();
    const navState = nav?.extras?.state as { siteName?: string } | undefined;
    const historyState = this.location.getState() as { siteName?: string } | null | undefined;
    this.siteName.set(navState?.siteName ?? historyState?.siteName ?? siteId.slice(0, 12));
  }

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

  /** Roving tabindex: storageLocationId of the row that currently holds focus. */
  readonly activeRowId = signal<string | null>(null);

  /**
   * Depth ≤ 2 default expansion is applied on first load only; subsequent
   * re-queries (SKU/includeEmpty/refresh) preserve the user's expand AND
   * collapse choices.
   */
  private depth2DefaultsApplied = false;

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

  /**
   * The row that should carry tabindex=0 (roving tabindex). Falls back to the
   * first visible row when no row has been focused yet, or when the active
   * row has been hidden by a collapse.
   */
  readonly tabbableRowId = computed<string | null>(() => {
    const rows = this.visibleRows();
    const active = this.activeRowId();
    if (active !== null && rows.some(r => r.node.storageLocationId === active)) {
      return active;
    }
    return rows.length > 0 ? rows[0].node.storageLocationId : null;
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Wire up the switchMap query pipeline — inflight cancellation on re-query.
    // Errors are caught INSIDE the switchMap projection and mapped to a result
    // union, so the outer subscription never terminates: retry/refresh/SKU/
    // includeEmpty keep working after any failure.
    this.querySub = this.queryTrigger
      .pipe(
        switchMap(({ sku, includeEmpty }) => {
          // Only show full loading skeleton on first load (no data yet)
          if (this.response() === null) {
            this.state.set('loading');
          }
          this.errorKey.set(null);

          return this.rollupService.getSiteRollup(this.siteId(), { sku, includeEmpty }).pipe(
            map((response): QueryResult => ({ ok: true, response })),
            catchError((err: unknown) => {
              const error: RollupError = isRollupError(err)
                ? err
                : { kind: 'unknown', message: String(err) };
              return of<QueryResult>({ ok: false, error });
            }),
          );
        }),
      )
      .subscribe(result => {
        if (result.ok) {
          this.handleQuerySuccess(result.response);
        } else {
          this.handleQueryError(result.error);
        }
      });

    this.triggerQuery();
  }

  private handleQuerySuccess(resp: SiteInventoryRollupResponse): void {
    this.showUpstreamBanner.set(false);
    this.rollupError.set(null);
    this.response.set(resp);

    const nodes = resp.nodes ?? [];
    // Auto-expand paths to negative-available nodes — re-applied each response
    const negativePathIds = collectNegativeAvailablePaths(nodes);
    // Auto-expand depth ≤ 2 on first load only; later re-queries must not
    // override the user's collapse choices.
    const depth2Ids = this.depth2DefaultsApplied ? [] : collectDepth2Ids(nodes);
    if (nodes.length > 0) {
      this.depth2DefaultsApplied = true;
    }

    this.expandedIds.update(current => {
      const next = new Set(current);
      negativePathIds.forEach(id => next.add(id));
      depth2Ids.forEach(id => next.add(id));
      return next;
    });

    this.state.set(nodes.length === 0 ? 'empty' : 'ready');
  }

  private handleQueryError(rollupErr: RollupError): void {
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
      console.error('[SiteInventoryTreePage] Unexpected rollup error', rollupErr);
    }
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
   * Keyboard handler for treegrid rows (APG treegrid row pattern).
   * Enter/Space: toggle expand/collapse.
   * ArrowRight: expand if collapsed and has children.
   * ArrowLeft: collapse if expanded.
   * ArrowDown/ArrowUp: move focus to next/previous visible row.
   * Home/End: move focus to first/last visible row.
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
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const el = event.currentTarget;
        if (el instanceof HTMLElement) {
          this.focusRowElement(
            event.key === 'ArrowDown' ? el.nextElementSibling : el.previousElementSibling,
          );
        }
        break;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        const el = event.currentTarget;
        if (el instanceof HTMLElement && el.parentElement) {
          this.focusRowElement(
            event.key === 'Home'
              ? el.parentElement.firstElementChild
              : el.parentElement.lastElementChild,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  /** Focus handler keeps the roving tabindex on the most recently focused row. */
  onRowFocus(row: TreeRow): void {
    this.activeRowId.set(row.node.storageLocationId);
  }

  /** Roving tabindex: only the tabbable row participates in the tab order. */
  rowTabindex(row: TreeRow): number {
    return this.tabbableRowId() === row.node.storageLocationId ? 0 : -1;
  }

  /** Move DOM focus to a sibling treegrid row, if it is one. */
  private focusRowElement(el: Element | null): void {
    if (el instanceof HTMLElement && el.classList.contains('tree-row')) {
      el.focus();
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
