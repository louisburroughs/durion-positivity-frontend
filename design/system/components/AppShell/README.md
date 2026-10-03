# AppShell

The authenticated frame: a 56px `.shell-header` on `--navBackground` above a 220px `.shell-nav` rail on `--menuBackground`, with the page on `--themeBackground`.

**Header**: the emblem (26px; the header uses the JPG emblem, which carries its own white ground) and "Positivity" in Barlow Semi Condensed 700 at 1.125rem with 0.03em tracking; on the right the tenant chip, locale select, theme toggle and sign-out. Header controls are white, hover with a 10% white wash and focus with a 2px outline.

**Nav rail**: items are 0.9rem medium text at 75% white with a 22px icon; hover raises the text to `--contrastTextColor` over an 8% white wash; the current page (`.nav-item--active`, `aria-current="page"`) gets a 12% wash and a 3px white left edge. Focus is a white 2px outline inside the item. The rail collapses to 56px (icons only, labels as tooltips) and becomes an overlay below 768px.

The classes live in the shell's own stylesheets, `src/app/features/shell/components/header/header.component.css` and `nav/nav.component.css`; the preview links them directly.

**The consumer provides** the nav items (label key, icon name, route) and the content outlet. Keep the active edge white: teal on blue-700 is 2.2:1.
