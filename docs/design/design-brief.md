# Projects Lab — Design brief for Claude Design

**What to make:** a design system and a small set of screens for **Projects Lab**, a personal web app (installable PWA) that hosts **labs**: modules for productive work. The first two are **Study Lab** (a study backlog, generated courses and exam grades) and **Career Lab** (profile, skills, job readiness, application documents). One owner uses it on a **phone and an iPad**, mostly to read, track and copy, not to type long text.

**Attached for reference:**
- `tokens.css` from a previous project (Sticker Collector). **Copy its structure, not its look**: token naming, the `@theme static` block, the categories it covers. Its palette, fonts and gradients belong to a 90s trading-card game and must not carry over.
- `design-system.md` from the same project: the component inventory. Keep the component set, props and states it lists, except those named under "Drop" below.

---

## 1. Look and feel

- **Calm and focused.** A tool for studying and job applications, read in long sessions. Quiet neutral surfaces, generous line height, one accent colour at a time. No gamification, no neon, no holographic effects.
- **Long-form reading is a first-class use.** Course pages run to 400+ lines of Markdown with tables, code blocks and callouts. Reading comfort beats density.
- **Theme modes:** dark and light, following the device setting. _(Owner: delete one if you want a single mode.)_
- **Fonts:** open-licence families available on Fontsource, because the app self-hosts its fonts for offline use. One sans for UI and reading, one monospace for code, IDs and numbers. A separate display face is optional.
- **Contrast:** WCAG AA for all text and interactive states, in both modes.

## 2. Per-lab accent

Every lab has **one accent colour**. The shell sets the current lab, and every component reads a single token, `--color-lab-accent`. No component has lab-specific variants.

| Context | Accent |
|---|---|
| Platform (home, settings, login) | Neutral or brand accent |
| Study Lab | Propose one |
| Career Lab | Propose one, clearly distinct from Study |
| Spare (future lab) | Propose one more |

Each accent needs: base, hover/pressed, a subtle tinted background, and a readable foreground on the accent, in both modes.

## 3. Tokens required

Everything below must be a named token. The code's CI fails on any literal colour or pixel size outside the token file.

- **Colour roles:** background, surfaces (3–4 elevation steps), border, border-strong, text (primary, secondary, muted, inverse), focus ring, scrim; status: success, warning, danger, info. Each status has a background, border and foreground.
- **Readiness statuses** (Career Lab), as status tokens: **Verified** (proved by a passed exam), **Declared** (claimed in the profile), **Gap** (missing).
- **Study statuses:** Not started, In progress, Done. **Priorities:** P1, P2, P3.
- **Type scale:** including reading sizes for long-form prose and a code size.
- **Spacing** on a 4 px grid · **radii** · **border widths** · **shadows** (few and soft) · **z-index** none (modals use the native top layer).
- **Breakpoints:** phone below 768 px; tablet 768–1279 px, portrait and landscape; at 1280 px and wider, the tablet layout is centred with a max width.
- **Motion as numbers:** each duration in ms and each easing as a `cubic-bezier`. Cover at least: sheet in, dialog in, scrim in, toast in and out, skeleton pulse, and the lab-switch transition. Also say what changes under `prefers-reduced-motion`.

## 4. Components

**Keep from the reference inventory:** Button, Input, Textarea, Field, Chip, Checkbox, Badge, Tabs, Sheet, Dialog, OptionsMenu, Toast, ProgressBar, EmptyState, Skeleton, ImageTile (profile photo), ErrorState.

**Add:**

| Component | Purpose |
|---|---|
| **Prose** | Renders course Markdown: H1–H4, paragraphs, lists, tables, inline code, fenced code blocks with a language label, blockquote callouts labelled Note, Tip, Warning, Frontend bridge and In the real world, links, images, and a quiz question with A–E options |
| **Select** | Single choice from a list |
| **SearchField** | Filter lists |
| **ListRow** | Dense row: leading ID in mono, title, trailing badges or value, chevron |
| **StatCard** | A number with a label and an optional progress bar, for summaries |
| **CopyField** | Read-only label and value with a one-tap Copy button and a "Copied" confirmation |
| **ReadinessMeter** | Verified / declared / gap counts for one job, as a segmented bar plus a legend |
| **LabSwitcher** | Switch between Study Lab, Career Lab and Home |
| **BottomTabs** (phone) and **SideRail** (tablet) | Primary navigation |
| **PageHeader** | Screen title, optional back button, trailing actions |
| **Banner** | Inline notice: offline, session expired, or info |

**Drop from the reference:** Coin, envelopes, holographic and CTA gradients, the "lip" button shadow, and anything else specific to the sticker game.

**Every component needs every state drawn:** default, hover, pressed, focus-visible, disabled, loading where it applies, error where it applies. Then for every data view: **loading (skeleton), empty, error and offline.** Anything the screens use but the bundle doesn't contain gets invented in code with no design review, so nothing should be left implied.

## 5. Screens

Design each one at **phone (390 × 844)** and **tablet (1024 × 768 landscape)**. Use the sample data below so the screens look real.

**Platform (needed first):**
1. **Login:** passphrase field, Sign in button, error "Wrong passphrase", rate-limited "Too many attempts, try again in 12 minutes", and a session-expired banner.
2. **Allow Claude** (OAuth consent, shown after login): "Claude wants to read and write your Projects Lab", with Allow and Cancel.
3. **Home:** a summary card per lab, each tinted with its lab accent. Study: 1 in progress, 6 not started, average grade 8.5. Career: 2 tracked jobs, best readiness 62%.
4. **Shell:** BottomTabs on the phone, SideRail on the tablet, LabSwitcher, and the accent changing per lab.
5. **Settings:** change passphrase (current, new, confirm), log out.
6. **Connections:** the list of Claude connections (client name, last used "2 hours ago") with Revoke and a danger-confirm dialog.
7. **System states:** a full-screen error, offline, a toast in each tone, and an empty list.

**Representative lab screens** (they test the system, and the final lab screens come later):
8. **Study backlog:** grouped by area, with ListRows.
   - `FE-01` Next.js · Essential · P1 · In progress
   - `CS-01` Big-O notation · Fast track · P2 · Not started
   - `DB-01` PostgreSQL indexing · Specialized · P2 · Done · 8.5
   - Plus a filter by status and a search.
9. **Course reader:** a Prose page for "Big-O Notation · Lesson 1 of 3 · 12 min", with a callout, a comparison table, a TypeScript code block and a quick-check question. On the tablet, add a lesson outline beside the text.
10. **Job readiness:** "Senior Full-Stack Engineer · Acme". A ReadinessMeter for required skills at 5/8, then a requirement list where each row shows a skill and its Verified, Declared or Gap badge, and gaps show an "Add to Study backlog" action.
11. **Profile copy panel:** CopyFields for name, email, LinkedIn URL, notice period ("30 days") and "Why this company?" (a short paragraph).

## 6. Before handoff

- Annotate the motion values on the canvas, next to the components that use them.
- Remove any default or sample theme the tool attached that isn't this design system.
- Check that every component in section 4, and every state, appears at least once.
