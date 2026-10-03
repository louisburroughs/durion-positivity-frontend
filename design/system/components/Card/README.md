# Card

A container on `--cardBackground` that groups one subject: `.card`, with `--radius-md` and `--space-4` padding.

**Use** a plain card on `--themeBackground` (no shadow needed); add `.card--outlined` (a `--border-color` edge) when cards sit on another surface or touch each other, and `.dur-elevation-2` (`--shadow-card`) only when it must read as lifted, such as a dashboard tile. Elevation utilities `.dur-elevation-1` to `.dur-elevation-4` cover resting tiles up to floating panels.

**Inside a card**, an `.inset` well on `--surface-inset` holds a filter bar, a toolbar or a summary strip. Title with an h3 in the display face (`card-title`), put metadata in `--text-muted`, and keep actions at the bottom or top-right.

**The consumer provides** the heading, content and actions. Don't nest cards more than one level, and don't give every block the same border, shadow and radius: set off the one that needs it.
