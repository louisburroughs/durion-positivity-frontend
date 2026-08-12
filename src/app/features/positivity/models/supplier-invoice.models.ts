/**
 * Ingested vendor invoice (accounts-payable) domain model (issue #192, CAP-321).
 *
 * Interfaces only.
 *
 * ── Money is a string, and that is a decision ───────────────────────────────
 * Every monetary field here is a `string` carrying the backend's decimal text.
 * A `number` would be an IEEE-754 double: `0.1 + 0.2` money, silent rounding at
 * the 17th digit, and a rendering path that re-derives a value #192 §5 forbids
 * this client from re-deriving. Keeping the text means the AP user sees exactly
 * the figure the vendor sent and the platform booked — including its sign.
 * `supplier-amount.util` reads the sign without arithmetic.
 *
 * ── Currency is a code, not a symbol ────────────────────────────────────────
 * `currency` is displayed as delivered. It is never mapped to a glyph, and
 * Angular's `CurrencyPipe` is never applied to these values: the pipe would
 * localise both the symbol and the digit grouping, producing a figure the
 * backend never sent for a document that will be paid at its face value.
 *
 * ── A credit note is not a negated invoice ──────────────────────────────────
 * `type` distinguishes the document; `amount` carries whatever sign the backend
 * assigned. The UI never derives one from the other, never flips a sign to make
 * the two agree, and never coerces a credit to a positive figure.
 *
 * ── Flags are backend state ─────────────────────────────────────────────────
 * `flags` is the backend's current exception assessment for the invoice. There
 * is no client-side dismissal shape anywhere in this file: a flagged row leaves
 * the worklist when the backend stops reporting the flag, and at no other time.
 *
 * ── Voucher linkage ─────────────────────────────────────────────────────────
 * One voucher per vendor-invoice identity. `voucherStatus: 'PENDING'` is the
 * backend saying the voucher does not exist yet — a state to display, not a task
 * for the user (#192 §5). `voucherReference` is an identifier the AP user can
 * search for in the accounting system of record; this frontend has no
 * voucher/AP-bill screen, so it is rendered as text and never as a link.
 *
 * Issue dates are date-only `YYYY-MM-DD` values (ADR-0038) and are never handed
 * to `DatePipe` raw. `fetchedAt` and `receivedAt` are instants.
 */

/** Document kind as classified by the backend. Never inferred from the amount. */
export type SupplierInvoiceType = 'INVOICE' | 'CREDIT_NOTE';

/**
 * Backend-reported exception on an ingested invoice.
 *
 * `UNMATCHED`   — no purchase order could be resolved for the document.
 * `DISCREPANCY` — a re-issued invoice arrived whose amounts differ from the
 *                 version already on file. Both versions are delivered and both
 *                 are shown; the UI never merges them or hides the earlier one.
 */
export type SupplierInvoiceFlag = 'UNMATCHED' | 'DISCREPANCY';

/**
 * Voucher linkage state for one invoice.
 *
 * `PENDING` is a backend-reported waiting state, not an error and not an action.
 */
export type SupplierVoucherStatus = 'LINKED' | 'PENDING';

/** One line of an ingested invoice, exactly as the vendor sent it. */
export interface SupplierInvoiceLine {
  /** Platform line UUID. The `@for` tracking key. */
  lineId: string;
  /** Vendor's own line reference, when it sends one. Display only. */
  vendorLineReference?: string | null;
  /** Vendor part number. Display only — never resolved against the catalogue here. */
  sku?: string | null;
  description?: string | null;
  /** Delivered as text; quantities can carry vendor-specific precision. */
  quantity?: string | null;
  unitOfMeasure?: string | null;
  /** Decimal text. Rendered verbatim. */
  unitAmount?: string | null;
  /** Decimal text. Rendered verbatim — never `quantity * unitAmount`. */
  lineAmount: string;
  /** ISO-4217 code as delivered. Never localised into a symbol. */
  currency: string;
}

/**
 * One identified version of an invoice as delivered in a `DISCREPANCY`.
 *
 * Both the version already on file and the re-issued one arrive as entries of
 * this shape, each carrying its **own** identity and amounts. Nothing here is a
 * delta: computing one would be exactly the recomputation #192 §5 forbids, and
 * an AP user resolving a discrepancy needs to see the two documents, not the
 * frontend's opinion of the difference between them.
 */
export interface SupplierInvoiceVersion {
  /** Backend reference for this specific version of the document. */
  versionRef: string;
  /** The invoice number carried by *this* version. */
  invoiceNumber: string;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  issueDate?: string | null;
  /** Decimal text for this version's total. Rendered verbatim. */
  amount: string;
  currency: string;
  /** Instant the platform received this version. */
  readonly receivedAt: string;
  /**
   * True for the version the backend currently treats as authoritative.
   *
   * Presentation only: both versions render either way. This exists so the list
   * can label which one is current without the UI inferring it from dates.
   */
  current: boolean;
}

/** One ingested vendor invoice as it appears in a list. */
export interface SupplierInvoiceSummary {
  /** Platform invoice UUID — the navigation key. */
  invoiceId: string;
  vendorProfileId: string;
  vendorDisplayName: string;
  /** Vendor-assigned invoice number. An attribute, never a navigation key. */
  invoiceNumber: string;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  issueDate?: string | null;
  type: SupplierInvoiceType;
  /** Decimal text. Rendered verbatim, sign included. */
  amount: string;
  /** ISO-4217 code as delivered. */
  currency: string;
  /** Accounting voucher reference, when one exists. Text, never a link. */
  voucherReference?: string | null;
  voucherStatus: SupplierVoucherStatus;
  /** Backend's current exception assessment. Empty when nothing is flagged. */
  flags: SupplierInvoiceFlag[];
  /** Instant the platform fetched this document from the vendor exchange. */
  readonly fetchedAt: string;
}

/** Full detail for one ingested vendor invoice. */
export interface SupplierInvoiceDetail extends SupplierInvoiceSummary {
  /** Line data exactly as delivered. Empty when the vendor sent a header only. */
  lines: SupplierInvoiceLine[];
  /**
   * Platform purchase-order UUID, when the backend resolved one.
   *
   * Null on an `UNMATCHED` invoice. This is the only identifier the detail page
   * navigates on — `poNumber` beside it is display text.
   */
  purchaseOrderId?: string | null;
  poNumber?: string | null;
  /**
   * Every delivered version of this invoice identity.
   *
   * Populated when `DISCREPANCY` is flagged; otherwise empty or single-entry.
   * Rendered in the order delivered.
   */
  versions: SupplierInvoiceVersion[];
  /** Backend text explaining the exception, when it supplies one. Verbatim. */
  exceptionDetail?: string | null;
  /** Vendor effective time for this record; may be null. */
  asOf?: string | null;
  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  stalenessThresholdMinutes?: number;
}

/** Filter inputs for the invoice list. Dates are `YYYY-MM-DD` (ADR-0038). */
export interface SupplierInvoiceFilter {
  vendorProfileId?: string;
  /** Free-text match over invoice number, voucher reference and PO number. */
  search?: string;
  type?: SupplierInvoiceType;
  /** Restrict to one exception flag. Omitted on the exception worklist, which
   *  asks the backend for every flagged row regardless of which flag it carries. */
  flag?: SupplierInvoiceFlag;
  dateFrom?: string;
  dateTo?: string;
}

/** Paged invoice list response. */
export interface SupplierInvoicePage {
  items: SupplierInvoiceSummary[];
  totalCount: number;
  nextPageToken?: string | null;
}
