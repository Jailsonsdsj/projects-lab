---
description: Build a UI component from the design system only
---

Read docs/design-system.md and packages/web/src/styles/tokens.css. Read nothing else.

Build or modify the component: $ARGUMENTS

Constraints:
- Every colour, space, radius, border width, breakpoint, shadow and duration
  comes from a token. No literal hex, rgb() or px values — CI fails on them.
- A lab's colour is `--color-lab-accent` only; never a lab-specific token.
- Lay it out for phone and tablet widths.
- Add the component to the /dev/ui kitchen-sink route in every state.
- Add a row to the inventory table in docs/design-system.md.