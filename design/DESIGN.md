# Design System Strategy: The Architectural Ledger

Implementation token source of truth:
- `design/source/theme-tokens.md`
- `design/source/durion-style-guide.md`
- `design/source/durion-theme.css`

## 1. Overview & Creative North Star: "The Architectural Ledger"

This design system moves beyond "Standard Banking" into the realm of **The Architectural Ledger**. The North Star for this system is the intersection of blueprint precision and editorial authority. We reject the "boxed-in" look of traditional fintech. Instead, we embrace a layout that feels like a premium financial broadsheet—utilizing intentional asymmetry, vast white space, and a sophisticated layering of Blueprint Blues.

By replacing 'Michelin Unit Titling' with **Public Sans**, we shift from rigid industrialism to a modern, humanist authority. The aesthetic is "Conservative Professional," but the execution is "High-End Editorial." We do not use borders to define containers; we use the weight of typography and the subtle shifts in surface tonality to guide the eye.

## 2. Colors & Tonal Depth

Our palette is anchored in **Blueprint Blue** (`primary`) and energized by **Electric Teal** (`secondary`). The goal is a monochromatic depth punctuated by precision accents.

### The "No-Line" Rule

**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or layout containment.

* **Boundaries:** Defined solely through background color shifts. A `surface-container-low` (`#f1f4f6`) section sitting on a `surface` (`#f7fafc`) background provides all the separation needed.
* **Intent:** This creates a seamless, fluid experience that feels "grown" rather than "assembled."

### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers—like stacked sheets of vellum.

* **Base:** `surface` (`#f7fafc`).
* **De-emphasized content:** `surface-container-lowest` (`#ffffff`).
* **Standard containers:** `surface-container` (`#ebeef0`).
* **High-priority sidebars/modals:** `surface-container-highest` (`#e0e3e5`).
* **Nesting Logic:** Always move "up" or "down" exactly one tier when nesting to maintain a soft, natural contrast.

### The "Glass & Gradient" Rule

To elevate the "Banking" feel into "Premium Wealth Management," use **Glassmorphism** for floating navigation or hovering action bars.

* **Formula:** `surface` color at 70% opacity + `backdrop-blur: 12px`.
* **Signature Textures:** For primary CTAs and Hero headers, use a subtle linear gradient from `primary` (`#00346f`) to `primary_container` (`#004a99`) at a 135-degree angle. This adds "soul" and dimension that flat hex codes lack.

## 3. Typography: The Editorial Voice

We utilize a dual-font system to balance institutional trust with modern clarity.

* **Display & Headlines (Public Sans):** This is our branding voice. Public Sans carries a neutral, yet authoritative weight. Use `display-lg` (3.5rem) with tighter letter-spacing (-0.02em) for hero statements to create an "Editorial" impact.
* **Body & Utility (Inter):** Inter is used for all functional data. Its high x-height ensures readability in complex financial tables (`body-md`).
* **The Hierarchy Strategy:** Use extreme scale contrast. Pair a `display-sm` headline in `on_surface` with a `label-md` sub-header in `secondary` (`#006a6a`). This "Big-Small" pairing mimics high-end architectural journals.

## 4. Elevation & Depth: Tonal Layering

Traditional shadows are often a crutch for poor layout. In this system, depth is earned through **Tonal Layering**.

* **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. The slight shift in hex value creates a "soft lift" that is felt rather than seen.
* **Ambient Shadows:** If a component *must* float (e.g., a dropdown), use a shadow with a blur radius of 32px and 4% opacity, using a tinted color (`on_surface` variant).
* **The "Ghost Border" Fallback:** If accessibility requires a stroke, use `outline-variant` (`#c2c6d3`) at **15% opacity**. Never use 100% opaque borders.
* **Glassmorphism:** Use semi-transparent `surface_variant` for overlays to allow the underlying Blueprint Blues to bleed through, maintaining the "Blueprint" aesthetic.

## 5. Components: Precision Primitives

### Buttons: The "Solid vs. Ghost" Pair

* **Primary:** Gradient-filled (`primary` to `primary_container`), `0.25rem` (sm) corner radius. No border.
* **Secondary:** No background. A "Ghost Border" (`outline_variant` @ 20%) with `on_secondary_container` text.
* **Tertiary:** Purely typographic. Use `label-md` in `primary` with `0.5rem` horizontal padding for hover states.

### Input Fields: The "Underlined" Legacy

* Avoid the "box" input. Use a `surface-container` background with a 2px bottom-weighted stroke in `outline`. This mimics a ledger entry line.
* **Error State:** Use `error` (`#ba1a1a`) for the bottom stroke and `on_error_container` for the helper text.

### Cards & Lists: The "No-Divider" Rule

* **Forbid the use of divider lines.**
* Separate list items using `spacing-4` (1rem) of vertical white space or by alternating background tints between `surface` and `surface-container-low`.
* **Content Grouping:** Use a `primary` color vertical accent bar (2px wide) to the left of a content group to denote importance instead of wrapping it in a box.

### Signature Component: The "Data Blueprint"

* A specialized card for financial figures: `surface-container-lowest` background, `secondary` (Electric Teal) typography for growth metrics, and a `primary_fixed` background for the header area.

## 6. Do’s and Don’ts

### Do

* **Do** use asymmetrical margins (e.g., a wider left gutter) to create an editorial feel.
* **Do** use `secondary_container` (`#90efef`) for subtle highlights behind key financial data points.
* **Do** leverage the full Spacing Scale (especially `spacing-16` and `20`) to let the design breathe.

### Don’t

* **Don’t** use `#000000` for text. Always use `on_surface` (`#181c1e`) for a softer, more premium look.
* **Don’t** use the `full` (9999px) roundedness for buttons; stick to `sm` (`0.125rem`) or `md` (`0.375rem`) to maintain the "Architectural" sharpness.
* **Don’t** stack more than three levels of surface containers. It muddies the visual hierarchy.
