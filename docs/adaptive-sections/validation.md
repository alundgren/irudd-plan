# Adaptive sections validation

Issue #43 replaces the always-horizontal canvas with a readable overview, grouped sections and a centered reading view. The stored plan and feedback formats are unchanged.

## Visual comparison

`revised-c.html` is the self-contained reference from issue #42, formatted by the repository formatter. It was rendered before implementation. `adaptive-visual.spec.ts` captures both the reference and application at 1440×1000 using the same four titles, short goals, descriptions, requirements and SVG bytes.

| Mode     | Reference                           | Application                             | Requested zoom                                                   |
| -------- | ----------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Overview | [Reference](reference-overview.png) | [Application](application-overview.png) | Reference 25%; application minimum-readable overview             |
| Sections | [Reference](reference-sections.png) | [Application](application-sections.png) | Reference 60%; application 36%, both within the section interval |
| Reading  | [Reference](reference-reading.png)  | [Application](application-reading.png)  | 100%                                                             |

The inspected renders have matching frame widths, full-width title bars, warm paper colours, overview summaries with thumbnails, and a centered reading column. The section grid uses 60px gaps, and the overview grid uses 36px gaps. Narrow screens use one column. Headers wrap and frame heights follow their complete content.

Intentional differences:

- The real goal and a Work item index disclosure remain available above the grid. The prototype's study banner and sample status badges are omitted.
- The application retains its header, feedback dock, Comment/Pan controls, keyboard shortcuts and Fit. Overview displays a fixed label instead of a changing percentage.
- Actual comment and reference counts replace illustrative labels. Reference captions, ownership and named return actions remain visible.
- Existing complete technical detail and feedback actions remain available. The application does not manufacture the prototype's sample decisions or discard content to match its shorter document.
- Section text retains the application's readable base size. Reading text grows to 22px; changing the requested zoom never translates the description out of its column.

`adaptive-sections.spec.ts` also captures 1440×1000 and 390×1000 overviews, sections and maximum reading size with 50 long-titled items. The test checks exact header/frame alignment, pairwise non-overlap, no horizontal text overflow, dock resize, and repeated layout restoration. Mixed-reference tests cover multiple tall visuals, shared visuals, failed and unsupported assets, and the isolated HTML scroll exception.

## Behavioral checks

The browser suite covers direct item URLs, Back/Forward, title and summary navigation, nearest-visible-item zoom selection, explicit section selection, reference return, live reorder/removal, selection and touch movement, dirty-dialog retention, and copied prompts. Legacy section notes and negative free-canvas coordinates are exercised without rewriting stored targets. Free-canvas pins appear in sections; selecting their feedback-list entries returns to those coordinates.

Validation commands are `vp run check`, `vp run check:ci`, `vp run test`, `vp run build`, and `vp run test:browser`. Final results are recorded in the implementing pull request.

The repository's file/function length and complexity warnings remain advisory. Canvas navigation keeps its URL, selected-item, reference and scroll restoration decisions together because each transition updates those values as one user action. The existing stylesheet retains the application's other views and controls. No new persistence, feature flag, deployment gate or production operation is introduced.
