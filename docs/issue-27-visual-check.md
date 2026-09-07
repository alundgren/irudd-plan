# Compact header and warm paper comparison

Local visual acceptance passed for the properties below on September 7, 2026.
Production acceptance is incomplete. This branch has not been merged or deployed,
so there is no merged commit or deployment evidence to report. The authenticated
check of `https://plan.irudd.net/plans/irudd-skills-229-text-test-cleanup` remains
for after deployment. These local fixtures do not substitute for that check.

## Capture conditions

Reference: `alundgren/irudd-skills` commit
`754f9f4a08d8b6ba26ebde77531d028d30bed14e`, files under
`docs/plan-feedback-canvas`. The rendered reference was inspected with Feedback
open and closed before implementation. Its CSS and zoom behavior in `canvas.js`
were compared with the result.

Both reference and result captures use Chromium 151.0.7922.34, browser zoom 100%,
device pixel ratio 1 and canvas zoom 92%. Desktop is 1440×900 CSS pixels; phone
is 390×844. The reference contains its illustrative draft-3. App captures use
`makeBrowserPlan` from `tests/browser-fixture.ts`, local revision 1, with no
changes to stored data. The capture server runs separately from the browser
suite so revision updates cannot change a capture midway through comparison.

## Findings

| Acceptance point           | Result and evidence                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colours                    | Pass. Header `#F2EADE`, canvas `#EADFCD`, sheet `#F9F6F0`, text `#604939`, grid/borders `#C1AF9A` match the pinned reference. Controls and status text use its remaining CSS roles.                                                                                                                                                                                    |
| Typography                 | Pass. System sans-serif throughout; weights 400, 500 and 600. Existing section labels, capitalization, hierarchy and organization remain. Their typography is still smaller than the prototype's restructured document sections, which are deferred.                                                                                                                   |
| Header                     | Pass. Full width and 68px on desktop with details closed. The phone layout deliberately uses two rows, 95px total, to keep navigation, title, status, details and Feedback reachable.                                                                                                                                                                                  |
| Long title access          | Pass. Header titles stay on one ellipsized line. The full goal remains in the overview. Browser coverage also uses a 415-character title on both owner and public routes.                                                                                                                                                                                              |
| Grid                       | Pass. Flat background, 20px spacing and 0.8px dot radius at 100% canvas zoom. At the matching 92% zoom, spacing is 18.4px in both implementations. Dots scale with pan/zoom through the existing React Flow background.                                                                                                                                                |
| Sheet edges and shadows    | Pass. 10px corners and `0 4px 16px #60493912` shadow match the reference. The selected sheet retains a thin warm border to identify the current item. Card dimensions and inner scrolling are unchanged, as sheet sizing is separate work.                                                                                                                             |
| Feedback and navigation    | Pass. Feedback shows zero and nonzero counts and opens the existing panel. Private Plans, public Overview and direct item links remain accessible. The existing floating feedback panel differs from the prototype's column; that delivery is explicitly deferred.                                                                                                     |
| Connection failure         | Pass. Reconnecting remains visible in the header with details closed on desktop and phone, including public routes. Tests also verify recovery after missed revisions and unavailable plans.                                                                                                                                                                           |
| Plan details and retention | Pass. Enter and Space open/close the disclosure. Scheduled expiry and unknown retention remain concise header statuses. Full expiry dates, deletion consequence, verification reasons and completed check timestamps are available inside. Public views omit owner retention. Opening details pushes the canvas down; the phone capture's header grows to about 214px. |
| Data and safeguards        | Pass. Changes affect browser presentation and tests. No plan contract, MCP, database, retention policy or production configuration changed. Feedback owner isolation and storage/clipboard recovery remain covered.                                                                                                                                                    |

The retained work-item layout and section hierarchy make the result visibly
different from the prototype. This comparison accepts the named colour, font,
header, grid and shadow properties only. It does not claim completion of the
separate document-sheet, navigation or feedback-column deliveries.

## Captures

- [Pinned prototype, desktop](captures/issue-27/prototype-desktop.png)
- [App overview, desktop](captures/issue-27/desktop-overview.png)
- [Work item with Feedback, desktop](captures/issue-27/desktop-item-feedback.png)
- [App overview, phone](captures/issue-27/phone-overview.png)
- [Plan details, phone](captures/issue-27/phone-details.png)
- [Work item with Feedback, phone](captures/issue-27/phone-item-feedback.png)

## Validation setup

The normal browser port 4173 was occupied by another worktree. Browser tests ran
through `vp run test:browser` in a temporary copy of this branch with only test
URLs and the fixture listener changed to port 4273. App source was identical.
The independent capture fixture used port 4274. Neither server used production
credentials or production data.

`plan-header.spec.ts` covers both viewport sizes and route types, title access,
header/control bounds, colours, grid scale, shadows, keyboard details and offline
status. `retention.spec.ts` covers retained, scheduled and unknown fixtures,
disclosure content and geometry, unavailable-plan recovery, and stale selection.
The full browser suite also exercises direct links, revisions, feedback, public
assets, and local draft isolation/recovery.

Final checks passed: `vp run check`, `vp run test` with 57 tests in 12 files,
`vp run build`, and all 18 tests through `vp run test:browser`. The check command
reported 31 advisory length/complexity warnings and no errors. The new header
scenario stays in one test so its setup, navigation and assertions can be read
in order; splitting it only to meet the advisory function length would make
that flow harder to follow.
