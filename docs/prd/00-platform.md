# Platform: labs, shell and home

## What Projects Lab is

One installable web app, used by one owner on a phone and an iPad, that hosts **labs**: modules that each run one kind of productive workflow and share data. The app contains **no LLM**: every course, grade, document or job match is made by a Claude session and delivered over MCP (architecture §1). The app's job is to store, show, track and help copy; reading and tracking beat typing.

| Lab | Accent (tokens) | Workflow |
|---|---|---|
| Platform | `--color-platform` (neutral) | Home, Connections, Settings, Login, Allow Claude |
| Study Lab | `--color-study` (steel navy) | Backlog → course → final exam → grade |
| Career Lab | `--color-career` (sage and slate) | Profile, skills and readiness, documents, job search |
| Spare | `--color-spare` (ember) | Reserved for a third lab |

## What a lab is

A lab is a module that contributes exactly these, registered with the shell at mount time (architecture §4):

- **Routes** under `/<lab>/…` and API routes under `/api/<lab>/…`; MCP tools named `<lab>_*`.
- **Navigation:** its tabs, in order (name, icon, path, optional count).
- **A Home card** and its `GET /api/<lab>/summary`, computed at read time.
- **An accent:** the shell sets `data-lab="<lab>"` on `<html>`; components read `--color-lab-*` only and never branch on the lab.

The shell and Home iterate the registry; core code never imports a lab. A lab with no data still renders its card and tabs, in their empty state.

## Routes

| Path | Lab | Screen |
|---|---|---|
| `/` | platform | Home |
| `/connections`, `/settings` | platform | Connections (`01-identity`), Settings |
| `/login`, `/oauth/authorize` | platform | Login, Allow Claude (no shell) |
| `/study`, `/study/courses`, `/study/grades` | study | Backlog (first tab), Courses, Grades |
| `/career`, `/career/skills`, `/career/profile`, `/career/documents`, `/career/interviews` | career | Jobs (first tab), Skills, Profile, Documents, Interviews (CA-13); `/career/jobs/:jobId` is a page under Jobs (CA-11a) |

The current lab comes from the first path segment, so a deep link opens in the right lab with the right accent.

## The shell

- **Phone (< 768 px):** a `PageHeader` per screen and `BottomTabs` with the current lab's tabs. Platform's tabs are Home, Connections and Settings. Content scrolls under the frosted tab bar.
- **Tablet (768–1279 px, either orientation):** a `SideRail` with the lab's name, its tabs with counts, and Settings at the bottom. Labels show from 1024 px; below that the rail is compact (icons only).
- **Wide (≥ 1280 px):** the tablet layout, centred at `--size-app-max`.
- **LabSwitcher** in the header: Home, Study Lab, Career Lab, each with a one-line description. A `Sheet` on phone, a popover menu on tablet.
- **Switching lab** navigates client-side (no reload), sets `data-lab`, and crossfades every accent-painted surface over `--duration-lab-switch`; reduced motion swaps instantly. It opens the lab's first tab.
- **No horizontal scroll** at any width; touch targets are at least `--size-touch`.

## Home

- **Title** "Home", subtitle "Your two labs" (from the registry's count). One **LabCard per lab**, tinted with that lab's accent, linking to the lab.
- **Study card:** in progress, not started, average grade (one decimal, from integer tenths), and a "Continue" row for the course in progress.
- **Career card:** tracked jobs, best readiness %, gaps at the best match, and its title.
- Each card loads its own summary, so one lab failing never blanks the other. Per card:
  - **Loading:** skeleton card.
  - **Empty** (a lab with no data): the lab's empty state with what to do next, never an error.
  - **Error:** `ErrorState` inside the card with Retry.
  - **Offline:** the last saved summary plus a page `Banner` "Offline. Showing what was saved {time} ago."

## Settings

Change passphrase (`01-identity`: current, new, confirm; on success a toast "Passphrase changed. Use it next time you sign in.") and Log out ("Signed in on this device") with a danger-confirm dialog.

## System states (every screen)

Loading is a skeleton of the screen's own layout. Empty, error and offline are distinct (`EmptyState` vs `ErrorState`); a failed read is never shown as "nothing here yet". Route errors render inside the shell with Retry (D-10). An expired session goes to `/login` with its banner (`01-identity`).

## Decisions

Settled by the owner on 2026-10-15.

1. **Switching to a lab** opens its first tab. Remembering the last screen per lab can come later.
2. **Home order** follows the registry: Study, then Career.
3. **The spare accent** stays unused until a third lab exists.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
