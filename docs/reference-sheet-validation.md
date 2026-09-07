# Reference sheet validation

The local implementation moves required visuals into separately titled sheets beside their work item. Stored plans, assets and feedback identities retain their existing format.

## Checks

- `vp run check`: passed with advisory warnings, no errors.
- `vp run check:ci`: passed formatting, lint and type checks.
- `vp run test`: 57 tests passed across 12 files.
- `vp run build`: server and browser builds passed.
- `vp run test:browser`: all 36 tests passed after integrating the docked feedback column from main. The shared-reference regression checks that selecting each note opens the correct item and asset and scrolls its figure into view.

`CanvasContents` keeps reference selection and viewport compensation together because they share the same state owner. Its length warning remains. The longer browser test exercises one complete reading path through several media types; its sequential steps remain together. Other advisory warnings predate this change.

The browser tests cover desktop and phone focus/return, Fit all, inherited and shared assets, tall and wide SVGs, raster images, interactive HTML, unavailable and unsupported previews, long captions, live replacement, removed associations, and copied feedback with the exact original item and digest. Existing tests continue to cover HTML isolation, public access, document navigation, text selection, browser history, live revision ordering and retention behavior.

## Local visual comparison

Before implementation, the binding prototype at irudd-skills commit `754f9f4a08d8b6ba26ebde77531d028d30bed14e` was rendered in Chromium at 1440×900, browser zoom 100%, device scale 1 and canvas zoom 100%. Its reference navigation, Fit and return to an item were exercised, with feedback open and closed.

The implementation captures use Chromium, browser zoom 100%, device scale 1 and canvas zoom 100%. Desktop captures use 1440×900; the phone capture uses 390×900. The fixture document begins at its current server revision so earlier tests cannot make it appear stale.

| Acceptance point                                | Local result                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate title, caption, role and large drawing | Pass. The reference identifies its work item, keeps the exact caption above the drawing and displays the role in plain text.                                                        |
| Prototype spacing and readable focus            | Pass. Desktop sheets retain 600px width, 40px padding and 72px gaps. The drawing extends into the inner margins. Links restore reading zoom and the return action reaches the item. |
| Uncropped proportions and no overlap            | Pass. Tall and wide drawings preserve their ratios; long captions stay above the drawing. All sheets remain horizontally separated after updates.                                   |
| Feedback open and closed                        | Pass. Existing feedback controls remain available. The desktop feedback column leaves the reference visible beside it; phone feedback uses an overlay.                              |
| Shared asset feedback                           | Pass. Each association keeps its own item ID; replacement and removal preserve the original digest in copied notes and mark changed or missing targets.                             |
| Interactive HTML and isolation                  | Pass. Existing credential, navigation, storage and network isolation checks pass. HTML scrolls within its document when needed and otherwise forwards wheel movement to the canvas. |
| Recovery states                                 | Pass. Missing, failed and unsupported previews retain their caption, feedback control and return action.                                                                            |

Material differences from the prototype are intentional: existing plan navigation replaces its left sidebar, titles name the originating item because assets have no separate title field, and phone feedback overlays the canvas. Desktop feedback is docked beside the canvas. Tall drawings extend below the viewport and remain reachable by panning. Direct comment pins and Comment/Pan modes remain deferred.

Captures: [desktop reference](captures/reference-sheet-1440.png), [phone reference](captures/reference-sheet-390.png), [feedback open](captures/reference-sheet-feedback.png), [item document](captures/plan-canvas-desktop.png).

## Production acceptance

Incomplete. This branch has not been merged or deployed, and the session has no authenticated Chrome connection to [the named real plan](https://plan.irudd.net/plans/irudd-skills-229-text-test-cleanup). No production plan or existing feedback was changed. These local fixtures do not establish acceptance of the real plan's repeated decision guide.

After deployment, record the merged commit, evidence of deployment completion, real plan revision, viewport, browser zoom and canvas zoom. Compare the real guide, its item links and return actions at matching desktop settings, with feedback open and closed. Record each material difference and a pass/fail for each acceptance point above.
