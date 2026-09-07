# Pending feedback column comparison

Production acceptance is incomplete. The branch has not been merged or deployed,
so no merged commit or completed deployment can be recorded. On September 7,
2026, the available Chrome session reached Cloudflare Access sign-in at
`https://plan.irudd.net/plans/irudd-skills-229-text-test-cleanup`. Its plan revision,
canvas zoom and existing two notes could not be inspected. No production plan or
note was changed. Keep issue #30 open for the authenticated post-deployment check.

## Reference and capture conditions

The reference is `alundgren/irudd-skills` commit
`754f9f4a08d8b6ba26ebde77531d028d30bed14e`, under
`docs/plan-feedback-canvas`. The desktop HTML rendering, CSS, JavaScript and
`ux.md` were inspected before implementation. The reference interaction added a
local illustrative comment, selected its location, opened Edit, and cancelled.

Local app captures use the browser fixture, revision 1, and synthetic notes in
browser storage. They use Chromium 151.0.7922.34, browser zoom 100%, device pixel
ratio 1, and viewports 1440×900 and 390×844 CSS pixels. Desktop reference and app
reading captures use canvas zoom 100%. The reference phone canvas scales its
600px documents to fit; the app retains its existing phone paragraph reflow at
100%. This difference does not affect the panel comparison, which uses the same
330px width and browser zoom. The reference left sidebar is excluded.

## Local findings

| Acceptance point         | Finding                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop column           | Pass. A 330px column begins below the 68px header. React Flow ends at its left edge. Opening and closing resize the canvas without changing vertical reading position.                                                                                                                                    |
| Fit                      | Pass. Every document fits inside the reduced canvas bounds with feedback open. Selecting an overview location after Fit restores reading zoom and brings its section to the top reading area.                                                                                                             |
| Heading, list and footer | Pass. Next refinement and Pending feedback with its count remain visible above a scrolling list. Copy feedback stays at the bottom with 24 notes and a 3,000-character note.                                                                                                                              |
| Ordinary notes           | Pass. Locations use work-item titles and section labels or asset captions. Comment bodies are readable text until Edit. IDs, coordinates, revisions, digests and enum values are absent from the ordinary list.                                                                                           |
| Edit, remove and drafts  | Pass. Inline editing saves each keystroke locally. Selecting another location keeps unfinished edits. Closing/reopening and reload preserve notes; Remove deletes only its selected note. Edit focuses its field.                                                                                         |
| Location selection       | Pass. A listed section reveals the corresponding work item and section; numbered canvas pins select and scroll to their note. Repeated pin selection brings the note back into view. Missing locations show a warning and leave the canvas position unchanged.                                            |
| Warnings and recovery    | Pass. Changed and missing targets keep their original-reference explanation. Storage errors stay beside Copy. Denied clipboard access exposes a selectable prompt without discarding in-memory edits.                                                                                                     |
| Phone panel              | Pass. At 390×844, the 330px panel starts below the existing 95px header. Close, Copy, Edit and Remove remain reachable. The panel overlays the canvas as in the reference.                                                                                                                                |
| Copy and isolation       | Pass. Copied text equals the existing prompt builder output, including original references and MCP retrieval/write instructions. Copy leaves stored notes unchanged. Public and private scopes stay separate; existing coverage also checks different private owners and outgoing requests for note text. |
| Real plan and deployment | Incomplete. Authentication, merged commit, deployment evidence, production plan revision and preservation of the user's two notes still need the named post-deployment check. Local fixtures are not a substitute.                                                                                        |

The implementation keeps the existing Pin a canvas area control, inline editing,
and original-reference trial question. The shared composer and direct canvas
commenting remain separate work. The column uses the reference's wording,
colours and spacing while retaining the app's plan navigation and phone header.

## Captures

- [Reference desktop](captures/issue-30/reference-desktop.png)
- [Reference note selected](captures/issue-30/reference-note.png)
- [Reference Edit interaction](captures/issue-30/reference-edit.png)
- [Desktop long note](captures/issue-30/desktop-long-note.png)
- [Desktop list scrolled](captures/issue-30/desktop-many-notes.png)
- [Desktop selected location](captures/issue-30/desktop-selected-location.png)
- [Phone long note](captures/issue-30/phone-long-note.png)
- [Phone list scrolled](captures/issue-30/phone-many-notes.png)
- [Phone recovery](captures/issue-30/phone-recovery.png)
- [Phone empty public list](captures/issue-30/phone-empty-public.png)

## Validation

`vp run check` reports no errors and 36 advisory length/complexity warnings.
The workspace component still assembles its child controls in one place, and the
long browser test keeps its sequence of edits, navigation and persistence checks
together. Splitting those solely for the line limit would obscure that sequence.
`vp run check:ci`, `vp run test` with 57 tests, and `vp run build` pass.

The browser suite runs through `vp run test:browser` against the local fixture
server. An initial full run exceeded the 20-second limit in the long phone
scenario, then terminated with exit 143 before the remaining tests finished.
That scenario now has a 40-second limit. All 30 browser scenarios pass across
three completed runs: 14 feedback/document tests, 15 header/live-update/retention
tests, and the public-view test. The public test initially received HTTP 503 for
`/public/assets/mockup-worker-DP90vSwM.js` because a concurrent build replaced the
served output. Its isolated rerun passed after the build completed. No source
change was needed for that environment error.
