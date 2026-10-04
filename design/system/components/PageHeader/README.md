# PageHeader

The top of every routed page: `.page-header` with an optional `.overline`, the h1, an optional `.standfirst` and the page's `.header-actions`.

**The h1** is `page-title` (Barlow Semi Condensed 700, 1.5rem) in `--currentTextColor`, one per page, in sentence case. The overline (0.75rem, 600, uppercase, 0.08em, `--text-muted`) names the area or parent record. The standfirst is one sentence in `--text-muted`, 60ch at most. Actions sit on the right and wrap under the title on narrow screens; at most one primary button among them.

**The consumer provides** the title and overline from i18n, the standfirst if the page needs explaining, and its actions. Leave `--space-6` below the header before the first content.
