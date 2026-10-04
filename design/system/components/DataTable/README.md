# DataTable

The list view for records: a `.table-wrap` (scrolls sideways on its own, `--radius-lg`, `--border-color` edge) around a `table.data-table`.

**Headers** are `table-header` style: 0.8125rem semibold uppercase with 0.04em tracking in `--text-muted`, Cells pad `--space-3` by `--space-4` with a `--border-color` rule between rows; a row hover adds `--surface-hover`. Amounts and counts are right-aligned with `.num` (tabular numerals).

**Long lists**: add `.table-wrap--scroll`. The wrapper then scrolls both ways inside a region 60vh tall at most, and the header row stays in view while the rows move. A plain `.table-wrap` only scrolls sideways, so its header scrolls away with the page.

**The consumer provides** a `<caption>` (visible or `.sr-only`), `scope="col"` headers, and for a sortable column `aria-sort` (`ascending`, `descending` or `none`) on its `<th>` with a `<button>` inside it that changes the sort, as `crm/pages/customer-list` does; and per row a `.row-name` (the record's name; when it opens a detail page, a `routerLink` in `--link-color` that keeps its underline, because `--link-color` is only 2.2:1 against body text in light and 1.5:1 in dark) with an optional `.row-sub` line, identifiers in mono, and status as a Badge. Paginate below the table, right-aligned.
