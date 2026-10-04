# StatusChip

A small pill showing a record's state in a list or header: `.dur-status` plus a tone.

**Use** `.valid` for a good or complete state, `.warn` for one that needs attention, `.error` for a failed or blocked state, `.primary` for an in-progress or selected state. Each tone reads on `--cardBackground` in both themes.

**The consumer provides** one to three words in sentence case ("In progress", "Awaiting parts") and, optionally, a leading 14px icon with `aria-hidden="true"`. The word carries the meaning; never show colour alone.

Chips are full pills (`999px`) at 0.75rem semibold. For six-way status (ready, neutral, info) or a square tag in a dense row, use Badge.
