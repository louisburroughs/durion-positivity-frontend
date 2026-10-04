# StatePanel

The empty, error or loading state that replaces a page's content: `.state-panel`, with skeleton rows while loading.

**Every routed page has four states**: idle, loading, ready and error. While loading, show `.skeleton` bars on `--skeleton-bg` in the shape of the content. When ready but empty, show a `.state-panel` with a 32px icon, an h2 that names what is missing ("No workorders match your filters") and one sentence on what to do, plus the action if there is one. On failure, `.state-panel--error` paints the `status-error` pair and offers a retry.

**The consumer provides** the icon (`aria-hidden`), the heading, the message from i18n and the action. Set the page's state before its error key, so an error panel never renders without a message.
