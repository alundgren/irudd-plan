# Continuous canvas zoom investigation

This draft preserves two prototypes for refining a later application fix. It changes no application behavior. On 2026-09-08 the owner tried the continuous C trial and said it was more like the expected behavior. That is agreement on the interaction direction, not acceptance of a complete production implementation.

## Try the prototypes

Serve this directory with the local-preview skill, or open the HTML files locally. Both use the adjacent `reference.svg`; keep it beside them.

- [Original options](original-options.html): recovered original A/B/C study. Select **C · Zoom summaries** to try the continuous zoom interaction the owner initially liked. A and B are retained to preserve the original artifact.
- [Continuous C trial](continuous-c.html): this session's modification of the original study, with C selected and the alternative tabs hidden.
- [Previously implemented revised C](../adaptive-sections/revised-c.html): the later fixed-layout reference used by issue #43 and PR #46. Retained in its existing location for comparison.

The temporary preview was stopped at the owner's request. No preview URL is required to resume this work.

## How the direction changed

The original request was for a Figma-like canvas: readable section headings at a distance, each item grouped with its visuals, and more space between items. The owner selected original C, then asked for full-width headers, no overlapping headers at extreme zoom-out, and a description that does not disappear to one side at close zoom.

The agent addressed those requests by replacing continuous canvas scaling with three discrete layouts. Its explanation explicitly described that tradeoff, but the owner understood the controls as examples at several zoom levels. Issue #43 made those layouts binding, and PR #46 replaced the previous React Flow canvas with native overview, section and reading layouts.

The recovered original confirms that it used a continuous exponential wheel delta and pointer-centered translation. The initial diagnosis that the owner might remember a different prototype was resolved by recovering this earlier version.

## Reproduced application problems

- A single zoom-out click from 100% reaches 83% and replaces the selected reading document with the entire section grid. `layoutMode` in `src/web/plan-canvas.tsx` uses boundaries at 35% and 85%. Within the section interval, the percentage changes without scaling the content. Crossing a boundary also restores a different layout's scroll position.
- `src/web/canvas-comments.tsx` applies a fixed factor of 1.2 per Ctrl/Cmd-wheel event, ignoring gesture magnitude. The new layout has no continuous camera transform or pointer anchoring.
- Feedback pin 1 belongs to the epic goal, but appears detached above it. In the inspected browser it used `left: 95%; top: 10%` and `translate(-6px, -100%)`. The 32px pin extended about 23px above its 92px target section. `feedback-pins.tsx` also uses that location as its fallback for notes without a saved position; the inspected DOM alone does not establish whether this particular note had a saved position. The target association exists, but placement communicates it poorly.
- Prior visual validation compared endpoint screenshots. Those screenshots do not establish continuity, gesture sensitivity or preservation of the content under the pointer.

## What the continuous trial changes

The trial starts from original C, keeping its continuous canvas transform, exponential wheel delta, pointer-centered zoom and drag-to-pan interaction.

- Title buttons move from an independent overlay into their item frames and span the full width.
- Header text and padding adjust with scale to remain readable. Body padding follows the measured header height so it does not cover summary text.
- Minimum scale is 22% instead of 8%. This is a provisional way to keep this four-item example readable.
- Distant items keep their spatial positions and show summaries. Their frames retain a minimum height instead of collapsing to the original 430px height.
- Clicking a title centers the description column, at up to 110%, while references remain alongside it in the same canvas.
- The explanatory copy describes continuous zoom. The A/B/C selector is hidden in this separate trial.

## Limits and next implementation work

This is an interaction experiment, not code ready to transplant into React. It keeps sample content, fixed section positions, inherited example badges and simplified controls. It has no application feedback integration, persistence, routing, live updates or isolated asset support.

The 22% minimum can prevent Fit all from fitting every item, especially on a phone or a large plan. Resolve far-out behavior with realistic data rather than treating that number as a requirement. Summary/detail still switches at 45%; wheel scaling is continuous, but the content change is not animated. Title clicks also move immediately. Frame heights and spacing need measured-content layout for real documents and multiple tall references. Text selection, touch, keyboard navigation and reading long documents need deliberate treatment.

For the full fix, retain continuous, gesture-sized zoom and preserve the content under the pointer. Decide how summary/detail transitions and close-up reading work without losing the selected item or its position. Avoid turning zoom back into a three-way page selector. Keep headers attached and legible without overlaps. Give unpositioned comments an explicit section-heading location, and ensure positioned pins visibly belong to their targets without rewriting saved target identities.

Preserve real plan content, asset isolation, local feedback and drafts, stable IDs, URLs/history, and live-update behavior. Dependency navigation and completion tracking remain separate work.

Validate continuous wheel/pinch input, small deltas, transitions in both directions, pointer anchoring, click-to-read, panning, long text, many items, narrow screens and feedback pins. Compare the interaction in Chrome as well as endpoint screenshots.

## Recovery and validation

The original worktree was `t3code/plan-ui-section-mockups`. The complete 50-message conversation, raw Codex log and original files were recovered locally. Private transcripts, local paths, session metadata and model settings are intentionally excluded from this PR.

Chrome checks in this session verified that the trial opens, a wheel gesture changes zoom from 22% to 28%, titles enter the selected description view, and corrected header padding keeps summary text below the header. These checks are limited prototype evidence, not production regression validation.

Repository validation for this documentation draft: `vp run check:ci` passed; `vp run check` passed with 40 existing advisories in unchanged source and tests; `vp run test` passed all 61 tests across 14 files. Existing advisories are left alone because this draft changes only prototype artifacts and handoff notes.
