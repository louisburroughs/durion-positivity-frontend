# DataTable

The list view for records: a `.table-wrap` (scrolls sideways on its own, `--radius-lg`, `--border-color` edge) around a `table.data-table`.

**Headers** are `table-header` style: 0.8125rem semibold uppercase with 0.04em tracking in `--text-muted`, sticky at the top. Cells pad `--space-3` by `--space-4` with a `--border-color` rule between rows; a row hover adds `--surface-hover`. Amounts and counts are right-aligned with `.num` (tabular numerals).

**The consumer provides** a `<caption>` (visible or `.sr-only`), `scope="col"` headers, sortable headers as buttons with `aria-sort`, and per row a `.row-name` (the record's name, linked in `--link-color` when it opens a detail page) with an optional `.row-sub` line, identifiers in mono, and status as a Badge. Paginate below the table, right-aligned.
