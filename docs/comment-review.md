# Direct commenting review

The reference is `docs/plan-feedback-canvas` in `alundgren/irudd-skills` at
`754f9f4a08d8b6ba26ebde77531d028d30bed14e`. Its desktop rendering and add, edit,
cancel and remove interactions were inspected before implementation.

Local visual checks use Chromium 151.0.7922.34, browser zoom 100%, a desktop
viewport of 1440 × 1000 and a phone viewport of 390 × 844. Desktop reading zoom
is 100%; the phone blank-note capture uses 83% canvas zoom. The fixture is
`browser-plan`, internal revision 1. Prototype content is not stored in the app.

| Acceptance point          | Local result and evidence                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comment/Pan toolbar       | Pass. Bottom-centred tools, selected mode, hint, C/V, zoom buttons, 100% reset and Fit. Existing navigation stays available.                                                                                                                                |
| Click → dialog            | Pass. Text, isolated visual overlay and blank-canvas clicks open About and focused Your feedback. Cancel/Escape leave saved notes untouched and return focus. Dirty dialogs warn before reload or tab close; clean dialogs do not.                          |
| Dialog → pin/list         | Pass. Add saves one note and opens the dock without moving the reading position vertically. Numbered pins select their listed note.                                                                                                                         |
| Edit/remove/copy          | Pass. Edit uses the same dialog, preserves its original target and saves wording explicitly. Remove deletes only the chosen note. Copy retains notes and includes the subject, position and existing MCP context.                                           |
| Keyboard and gestures     | Pass. Focus-only section/visual actions stay beside their targets and capture excerpts, including repeated text. Dragging and double-click selection do not add notes. Touch movement stops when selection starts. Pan permits isolated mockup interaction. |
| Zoom and relayout         | Pass. Section pins stay at normalized coordinates under zoom and target resizing; markers remain 32px at every canvas zoom. Blank pins use canvas coordinates. Fit uses the canvas beside the desktop dock.                                                 |
| Persistence and revisions | Pass. Old unpositioned notes and new notes reload together. Changed/missing text and asset targets retain their original references and warnings. Pins do not attach to replacement content.                                                                |
| Failures and isolation    | Pass. Blocked/full storage retains in-memory feedback. Clipboard failure exposes manual copy. Owner/public separation and iframe/Worker restrictions remain covered. Feedback text is absent from observed requests.                                        |

[Desktop comment](captures/comment-desktop.png),
[comment dialog](captures/comment-dialog.png), and
[phone feedback](captures/comment-narrow.png) record the local result.

Material differences from the prototype are intentional: there is no left
sidebar, existing work-item navigation remains, the hint sits to the right to keep Overview clear, and the phone header and
readable reflow follow the app's recorded UX decisions. The prototype uses
scaled desktop paragraphs on phones. The app retains its isolated HTML
interaction model and its existing manual-copy recovery in the feedback
column. The shared add/edit dialog now replaces the previous inline editor.

Validation: `vp run check`, `vp run check:ci`, `vp exec tsc --noEmit`,
`vp run test`, `vp run build`, and the feedback, canvas-comment, feedback-column,
document-reading, reference-sheet and plan-review browser suites. The unit and
integration suite has 58 passing tests; the combined relevant browser run has
29 passing tests. After review fixes, all 12 canvas-comment and reference-sheet
tests passed, including dirty-dialog reload protection and focused visual-action
placement. Function-length advisories remain in the workspace/canvas
components. Their event state and UI wiring stay together; touch handling,
rendered pins, the toolbar and the modal have separate responsibilities.

## Production acceptance remains incomplete

The named production plan redirected the available browser to Cloudflare
Access sign-in. No authenticated Chrome connection was available. No production
notes or stored plans were changed. The temporary real-plan text, visual and
blank-note trial therefore remains outstanding.

This PR has not been merged or deployed during this review. The merged commit,
deployment completion, production revision and matching production captures
remain to be recorded after deployment. Local fixtures do not substitute for
that acceptance. The owner explicitly requested automatic issue closure by
this PR despite the issue's original manual-closure instruction.
