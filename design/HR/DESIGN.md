# Design System Specification: The Architectural Ledger

## 1. Overview & Creative North Star: "The Architectural Ledger"
This design system moves beyond the standard "fintech" aesthetic to embrace the gravitas of heritage banking reimagined for a digital-first era. Our Creative North Star is **The Architectural Ledger**—a philosophy that treats the screen not as a flat canvas, but as a structured, multi-dimensional space defined by precision, spatial discipline, and tonal depth.

We reject the "template" look. Instead of relying on generic cards and heavy borders, we use intentional asymmetry, expansive white space, and editorial-grade typography scales to command authority. This is a system built on "Quiet Luxury"—where the quality of the layout communicates trust more effectively than any "Security" badge ever could.

---

## 2. Colors: Depth Through Tonality
The color palette is anchored by 'Blueprint Blues' (`primary_container`: #2b4c78) and accented by the surgical precision of 'Electric Teal' (`secondary`: #006a62 / #2bbbad).

### The "No-Line" Rule
To maintain a high-end editorial feel, **1px solid borders are strictly prohibited for sectioning elements.** We define boundaries through environmental shifts:
*   **Background Transitions:** Use `surface_container_low` against a `surface` background to define content zones.
*   **Tonal Definition:** Use a subtle shift from `surface` to `surface_variant` to denote a sidebar or utility area.

### Surface Hierarchy & Nesting
Think of the UI as a series of stacked, premium materials. 
*   **The Base:** `surface` (#f9f9fd) is your floor.
*   **The Plinth:** Use `surface_container_lowest` (#ffffff) for the highest-priority interactive cards.
*   **The Inset:** Use `surface_container_high` (#e7e8eb) for recessed areas like search bars or metadata wells.

### The Glass & Gradient Rule
For hero sections or primary CTAs, do not use flat colors. Apply a subtle linear gradient from `primary` (#0f3560) to `primary_container` (#2b4c78) at a 135-degree angle. For floating navigation or modal overlays, use **Glassmorphism**: a semi-transparent `surface_container_lowest` with a 20px backdrop-blur to allow the rich 'Blueprint Blues' to bleed through, creating a sense of layered physical space.

---

## 3. Typography: Editorial Authority
Our typography is a dialogue between the structural strength of Michelin Unit Titling (represented by the `publicSans` tokens) and the functional clarity of Noto Sans (represented by `inter`).

*   **Display & Headlines (`publicSans`):** These are your architectural beams. Use `display-lg` (3.5rem) with tight letter-spacing for landing moments. Headlines should feel "set" in stone—authoritative and immovable.
*   **Body & Labels (`inter`):** Use for all transactional data and long-form reading. The contrast between the wide, titling headers and the lean, geometric body text creates the "Editorial" signature.
*   **Hierarchy as Brand:** Use `label-md` in `on_surface_variant` (#43474f) for all-caps "Overlines" above headlines to provide a banking-ledger context.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to create "pop"; we use them to create "atmosphere."

### The Layering Principle
Depth is achieved by "stacking" the `surface-container` tiers. 
*   **Primary Layering:** A `surface_container_lowest` card sitting on a `surface_container_low` background provides a natural, soft lift.
*   **Ambient Shadows:** When a component must float (e.g., a dropdown or modal), use `mic-elevation-3`. The shadow must be extra-diffused (32px+ blur) and use the `on_surface` color at 5% opacity. It should look like a soft glow of occlusion, not a dark smudge.

### The "Ghost Border" Fallback
If a border is required for accessibility in complex data tables, use a **Ghost Border**: `outline_variant` (#c3c6d0) at 15% opacity. It should be felt, not seen.

---

## 5. Components: Precision Primitives

### Buttons (The Action Signature)
*   **Primary Action:** Use 'Electric Teal' (`secondary`). These are the only elements allowed to break the blue/grey tonal range.
*   **Secondary/Conservative:** Use `primary_container` (#2b4c78) with `on_primary` text.
*   **Shape:** Apply `rounded-sm` (0.125rem) to maintain a sharp, "blueprint" feel. Avoid "full" pill shapes unless used for status chips.

### Cards & Data Containers
*   **Rule:** Forbid divider lines.
*   **Separation:** Use the `Spacing Scale`. A `24` (5.5rem) gap between major sections or a `6` (1.3rem) gap between list items is our preferred separator.
*   **Interaction:** On hover, a card should shift from `surface_container_low` to `surface_container_lowest` rather than increasing shadow intensity.

### Input Fields
*   **Visual Style:** Use `surface_container_highest` for the input track. No border. 
*   **Focus State:** A 2px bottom-bar in `secondary` (Electric Teal). This mimics a signature line on a financial document.

### Transactional Lists
*   Use `surface_container_low` for the header and alternating subtle shifts for rows. 
*   **The "Blueprint" Detail:** Use `label-sm` for timestamps and metadata, ensuring they are always secondary to the primary currency or title.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical margins (e.g., 16 units on the left, 20 on the right) for hero layouts to create a bespoke, custom-built feel.
*   **Do** use `secondary_fixed_dim` for "Success" states to keep the teal accent consistent.
*   **Do** lean into the "Blueprint Blues" for dark mode, using `primary_fixed_dim` (#a8c8fb) for readability on dark surfaces.

### Don’t:
*   **Don’t** use pure black (#000000) for text. Always use `on_surface` (#191c1e) to keep the contrast sophisticated.
*   **Don’t** use standard "Drop Shadows." If it looks like a default Photoshop effect, it is wrong.
*   **Don’t** use dividers to separate content. Use the spacing scale (`8`, `12`, or `16`) to let the layout breathe.
*   **Don’t** use `Electric Teal` for anything other than the most critical user actions. It is a high-value currency; don't devalue it.