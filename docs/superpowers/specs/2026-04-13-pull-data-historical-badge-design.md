# Task 10 Design: Pull Data Button + Historical Badge in UI

Date: 2026-04-13
Status: Approved in conversation, documented for review

## Goal

Replace the current daily `Refresh` action in the dashboard header with the existing monthly `Pull Data` interaction, and make historical data views more clearly labeled in the header UI.

This task is intentionally limited to the button and badge experience. It does not introduce a new way to navigate to historical months.

## Scope

In scope:

- Replace the header's daily refresh form with the existing `PullDataButton` component
- Keep the existing monthly-pull status behavior and API flow
- Improve the presentation of the historical indicator in the header
- Keep live-data metadata visible for non-historical views
- Add or update tests for the new header behavior and button states

Out of scope:

- Adding historical month navigation or filters
- Changing the historical month detection rules
- Reworking the monthly pull backend or job-runner contract
- Replacing the current period toggle or weekends toggle behavior

## Current State

The dashboard page already contains the core pieces needed for this task:

- `app/page.tsx` imports `PullDataButton`, but the header still renders a server-side `Refresh` form that posts to `/api/refresh`
- `PullDataButton.tsx` already handles month selection, monthly pull initiation, status polling, and retry states via `/api/jobs/monthly-pull` and `/api/jobs/monthly-pull/status`
- `app/page.tsx` already detects when the selected range should use a historical monthly KPI snapshot and renders a simple text pill for that case

The main gap is UI integration and consistency. The header currently mixes an older daily-refresh action with newer monthly-pull logic, and the historical indicator does not stand out enough from ordinary metadata.

## Design

### Header Layout

The header keeps its current left-right split:

- Left side: title, selected period label, and data-status metadata
- Right side: period toggle, weekends toggle, and the monthly `Pull Data` control

The existing daily `Refresh` form is removed from the header and replaced by `PullDataButton`.

This keeps the interaction model simple:

- left side answers "what data am I looking at?"
- right side answers "what can I do from here?"

### Live vs Historical Metadata

The data-status line in the left metadata area follows two modes:

- Live mode: show `Last refreshed: ...` using the existing `getLastSuccessfulIngestAt()` value
- Historical mode: show a clear badge that communicates the current page is backed by a stored historical snapshot rather than live-calculated data

The underlying `isHistorical` decision remains unchanged. This task only updates presentation.

### Historical Badge

The badge should look intentional and different from helper text. It should be visually closer to a status badge than a muted paragraph.

Content requirements:

- explicitly state that the view is historical
- use the wording `Historical Snapshot`
- append the visible period context after a separator, for example `Historical Snapshot • This Month`
- remain in the left metadata stack beneath the period label

### Pull Data Control

The page reuses the existing `PullDataButton` component rather than introducing a new control.

Expected button behavior:

- default: button reads `Pull Mar 2026 Data`, using the selected month label in that format
- month selector remains visible beside the button
- in progress: button is disabled and shows elapsed time while polling
- completed or already pulled: show passive success status for the selected month
- failed: show retry affordance tied to the selected month

No new backend behavior is required for this task. The component continues to use the existing monthly-pull endpoints and polling approach.

## Data Flow

Server-rendered page responsibilities:

- resolve the active dashboard period
- determine whether the current range should use historical snapshot data
- render the correct left-side metadata state for live or historical views
- include the client-side `PullDataButton` in the header action area

Client-side button responsibilities:

- read the selected target month
- request monthly-pull status
- start a monthly pull when requested
- poll while the pull is in progress
- render status feedback for default, in-progress, completed, already-pulled, and failed states

This separation keeps the page responsible for "what data is shown" and the button responsible for "how monthly historical data gets pulled."

## Error Handling

Historical badge behavior:

- if historical detection fails or no snapshot is available, the page continues to fall back to live dashboard data as it does today

Pull button behavior:

- if the monthly-pull status request fails, the component falls back to a `not_pulled` state for the selected month
- if the pull request fails, the component shows a retry state
- no page-level blocking or redirect behavior is introduced

## Testing

Tests should cover the header integration rather than only the underlying API routes.

Required coverage:

- page renders `PullDataButton` in the header instead of the old `Refresh` button
- page shows live metadata when `isHistorical` is false
- page shows the historical badge when `isHistorical` is true
- `PullDataButton` renders the default state for a selectable month
- `PullDataButton` renders a completion state for already-pulled or completed months
- `PullDataButton` renders a retry state for failed pulls

If component-level tests are added, they should mock `fetch` and assert on rendered states rather than implementation details.

## Acceptance Criteria

- The header no longer contains the old daily `Refresh` form
- The header shows `PullDataButton` as the only pull-related action
- Historical views display a clearly styled historical badge
- Non-historical views still display last-refresh metadata
- Existing historical detection logic is preserved
- Tests cover the new header and button-state behavior

## Implementation Notes

- Prefer reusing `PullDataButton.tsx` with targeted styling/content refinements instead of rebuilding the control
- Keep changes focused on `app/page.tsx`, `app/components/PullDataButton.tsx`, and related tests
- Do not add historical navigation in this task, even if the month selector suggests future workflow extensions
