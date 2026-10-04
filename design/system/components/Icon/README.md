# Icon

Material Symbols Rounded, self-hosted, written as a ligature name inside `<span class="material-symbols-rounded" aria-hidden="true">`.

**Sizes**: 24px default, 22px in the nav rail, 18px inside a button, 14px inside a status chip, 32px in a state panel. One static instance (optical size 24, weight 400, unfilled).

**Colour** follows the text; accent icons use `--accentA400`, gold icons `--goldA400`, status icons the matching `--status-<kind>-fg`.

**The consumer provides** the ligature name and a visible word beside it. Icons are decoration, so they stay `aria-hidden`; an icon-only control carries its own `aria-label`. Don't use emoji as icons, and don't depend on the font for navigation: the rail shows a letter until it loads.
