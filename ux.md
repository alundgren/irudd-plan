# Plan review interface

The browser application is a read-only review tool. It has no controls for editing stored plan content or publishing a plan. Local feedback drafts do not change that content.

## Layout and navigation

The first page lists plans owned by the signed-in person. Opening a plan shows its epic overview and work items as document cards on a React Flow canvas. Pan or zoom to compare cards. The header reports the current committed revision and whether live updates are connected.

The URL identifies current content, not a historical revision:

```text
/plans/{planId}
/plans/{planId}/items/{itemId}
/public/plans/{ownerId}/{planId}
/public/plans/{ownerId}/{planId}/items/{itemId}
```

A direct item URL centers that card. The overview button returns to the epic card, and related-item buttons move between explicitly related work items. Selecting another card changes the stable URL without reloading the application.

The selected card puts the goal, required decisions, requirements, checks, and visual references first. Prior art, deferrals, and completion detail are in the collapsed technical-detail section. Text and controls inside cards do not pan the canvas.

On narrow screens, the selected card fits the viewport and remains vertically scrollable. The surrounding canvas still exists for navigation, but the interface does not claim to be a mobile authoring tool.

## Live revisions

An accepted MCP write publishes a revision notification only after its SQLite transaction commits. The browser then fetches the complete current plan. Reconnection does the same, so several missed notifications cannot produce duplicate or partially updated cards.

Existing cards retain their stable React Flow node IDs. A refresh does not run automatic zoom when the selected ID is unchanged, and the card scroll container remains mounted so its reading position and unchanged text selection can survive the update. Changed sections use a short warm paper "Updated" treatment that clears after five seconds.

The header status shows `connecting`, `reconnecting`, or `Live`. An unavailable plan gets a dedicated recovery page. If the selected work item disappears in a revision, the application keeps the URL, explains that the item was deleted, and offers the overview.

Plan details shows `Private` or `Published` and repository verification status. The signed-in plan list also
shows whether the repository still needs verification or cannot be published
because it is private. Published routes omit the private plan list and return to
the published overview. Publication remains an explicit authenticated MCP action,
not a browser control.

## Local feedback

Each text section and visual reference has a small feedback control outside the plan content. Selecting text alone does nothing. The reader can use the control to save the selected excerpt, or the complete section when nothing is selected. A separate mode adds a numbered pin to a blank canvas location.

The pending-feedback panel edits and removes browser-local notes, then copies described notes as one self-contained MCP revision prompt. It records the plan, work item and section or asset digest, canvas location, original reference and observed internal revision. Copying the prompt is not submission, approval or agreement. The application never sends feedback text to the server.

Feedback storage is partitioned by an opaque scope derived from the authenticated application owner and by plan ID. A different private owner cannot see the first owner's pending notes in the same browser profile. Public views use a separate browser-local scope from the authenticated owner view.

Live revisions retain pending notes. The panel compares their saved section content or asset digest with the current plan and labels changed or missing targets without moving feedback to new content. When this happens, the panel locally records whether preserving the original reference helped or got in the way. Storage and clipboard failures keep the current draft in memory and show a selectable prompt for manual copy.

## Text and visual content

Plan text uses a small display format: paragraphs separated by blank lines, lines beginning with `-` or `*` as lists, and `#` through `###` as small headings. The renderer creates React text nodes and never interprets plan text as HTML.

Raster images are owner-authenticated reads. Uploaded SVG and HTML never execute in the parent document. SVG uses a script-disabled iframe. HTML markup uses a script-disabled iframe, while its scripts run in a hardened SES compartment inside a dedicated Worker. The compartment receives only a small virtual document API for text, dataset, timer, and click updates; it receives no navigation, storage, messaging, or network capability. The Worker response also blocks network connections with Content Security Policy. Upload validation rejects external and relative markup dependencies and JavaScript module imports before storage.

## Retention status

The private plan list and open-plan view distinguish retained open work,
scheduled expiry and unknown GitHub status in plain text. In the open-plan header,
"Scheduled expiry" and "Retention unknown" remain visible beside the connection
status. One Plan details disclosure holds retention, repository verification
and check timestamps. It opens with Enter or Space and pushes the canvas down.
Scheduled expiry inside the disclosure shows the UTC date and explains that deleted content is lost. Unknown status includes
the verification failure reason; completed checks show last and next check
dates. The header occupies its own row above the canvas so status text does not
cover plan content on narrow screens. Public views omit these owner details. When a live document becomes
unavailable, the browser removes its cached document from the view and shows the
unavailable page at the same URL.

## Visual reference and compact header

The binding reference is `docs/plan-feedback-canvas` in `alundgren/irudd-skills`
at commit `754f9f4a08d8b6ba26ebde77531d028d30bed14e`. Its `canvas.html`,
`canvas.css`, `canvas.js` and `ux.md` govern colours, typography and header
presentation. The previous serif titles, cool cards and floating header no
longer govern these properties.

Use the prototype's warm paper CSS values: background `#F2EADE`, canvas/panel
`#EADFCD`, raised controls `#E0D2BD`, borders/grid `#C1AF9A`, sheets/fields
`#F9F6F0`, text `#604939`, secondary text `#66574D`, accent `#784F26`, links
`#3D5D71` and errors `#8F3A2D`. Text uses `system-ui, sans-serif` with weights
400, 500 and 600. Sheets have 10px corners and the prototype's light
`0 4px 16px #60493912` shadow. The canvas is flat with a 20px dotted grid and 0.8px dot radius at 100% canvas
zoom. Spacing and dots scale with the canvas, as in the prototype.
Existing section labels, order and organization remain in place. Sheet sizing,
navigation and relationship-line behavior are separate work.

The full-width desktop header is 68px high when Plan details is closed. It shows
`plan.epicGoal` on one ellipsized line, the revision and connection status, Plan
details, and Feedback with its count including zero. The complete goal remains
in the overview; the header also exposes it as a native title tooltip. Existing
private Plans and public Overview navigation remain available. Connection
failures stay visible in the error colour even with details closed. Normal live
status uses secondary text. Public routes omit owner retention details.

At widths up to 640px the header deliberately uses two rows totalling 95px,
instead of the prototype's 58px phone bar. This keeps the title, navigation,
connection/retention status, details and Feedback reachable without overlap.
Opening details grows the header in document flow, capped at 60% of the viewport
with scrolling for long reasons. The canvas and feedback panel remain below it.
There is no auto-hide or fullscreen behavior and no prototype sidebar.
