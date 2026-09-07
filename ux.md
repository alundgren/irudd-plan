# Plan review interface

The browser application is a read-only review tool. It has no controls for editing stored plan content or publishing a plan. Local feedback drafts do not change that content.

## Layout and navigation

The first page lists plans owned by the signed-in person. Opening a plan shows a readable overview. Requested zoom chooses one of three layouts, replacing the old always-horizontal React Flow canvas. Below 35%, a stable plan-order grid shows each item's title, shortGoal, reference thumbnails, count and captions, and comment count. The overview has a minimum readable size and reports "Overview" instead of a shrinking percentage. Larger plans scroll vertically. The epic goal and a Work item index disclosure remain accessible above the grid.

From 35% to below 85%, each item owns a frame containing its complete description and every required reference. Description and references appear alongside each other when the available width permits. CSS grid measures actual text and image heights before placing the next row. Frames and titles grow together; every title bar occupies the entire top edge. At narrow widths, both the item grid and each frame's contents use one column.

At 85% and above, the selected item occupies a centered reading column, capped at 860px with a 740px inner column. Text grows to a maximum of 22px. Complete references follow the description. The reading view has one native scroll area. Its Jump to reference action and named return links keep the full description within reach.
The URL identifies current content, not a historical revision:

```text
/plans/{planId}
/plans/{planId}/items/{itemId}
/public/plans/{ownerId}/{planId}
/public/plans/{ownerId}/{planId}/items/{itemId}
```

A direct item URL opens its reading view. Clicking a title or summary opens complete content before any comment can be created. Ctrl-wheel zoom over a frame selects that item; toolbar zoom keeps the selected item. If nothing is selected, entering reading view uses the visible item nearest the viewport center, with plan order resolving equal distances. Threshold decisions use requested zoom alone, so resizing or content measurement cannot change the mode.

Each layout remembers its scroll position, with reading positions stored per item. Browser Back/Forward restores the route's layout. Overview navigates to the plan URL; Fit shows the complete overview and scrolls to its start while retaining the selected item for subsequent zoom. References use the same item URL. Opening or closing Feedback and resizing center the document in the remaining width and preserve the native vertical scroll offset.

Each item presents its goal, required decisions, requirements, checks, visual-reference links and Technical detail as one continuous document. Required context, prior art, deferrals and completion are always expanded. Text selection and control clicks do not create feedback. At 390px, paragraphs wrap without horizontal text scrolling.

## References

Each required item/asset association appears inside its owning frame, including assets inherited through decisions and context. Shared assets appear for every owning item, retaining the original IDs and digests. Each reference names its item and shows the original caption and role. Raster and SVG proportions determine height without cropping. Missing assets, failed requests and unsupported previews keep their caption, feedback action and return link.

HTML keeps its isolated Worker interactions. Its frame grows with its document up to 4096px, with internal scrolling beyond that limit. Wheel movement over an HTML document scrolls the review area unless a nested area or the capped document can consume it. SVG frames remain script-disabled. The asset sandbox, CSP and Worker contracts are unchanged.

Replacing an asset remounts only its visual, while saved feedback retains the original digest and reports a changed target. Removing an association removes its reference and reports missing feedback targets; a selected removed reference returns to its item.

## Live revisions

An accepted MCP write publishes a revision notification only after its SQLite transaction commits. The browser then fetches the complete current plan. Reconnection does the same, so several missed notifications cannot produce duplicate or partially updated documents.

Items and references retain their stable React keys during live updates. Reading renders only the selected item, so reordering other items cannot move that document. The viewport retains its scroll offset across updates and width changes. Unchanged text stays mounted so selection can survive. Update highlighting does not alter section spacing and clears after five seconds.
The header status shows `connecting`, `reconnecting`, or `Live`. An unavailable plan gets a dedicated recovery page. If the selected work item disappears in a revision, the application keeps the URL, explains that the item was deleted, and offers the overview.

Plan details shows `Private` or `Published` and repository verification status. The signed-in plan list also
shows whether the repository still needs verification or cannot be published
because it is private. Published routes omit the private plan list and return to
the published overview. Publication remains an explicit authenticated MCP action,
not a browser control.

## Local feedback

The bottom toolbar retains Comment and Pan, C/V shortcuts, zoom out/in, a mode-aware zoom button that resets to 100%, and Fit. Comment is the default and summaries navigate to full content. Shortcuts ignore controls, dialogs and editable content. Comment clicks on full text, drawings or blank section-layout space open a focused dialog with editable About and Your feedback fields. Only Add comment saves a new note. Cancel and Escape leave notes and counts untouched and restore focus. A browser unload warning protects typed new feedback and unsaved edits from accidental reload or tab close. Clean dialogs do not warn. Edit uses the same dialog; Save comment changes wording while keeping the original target and revision.

Selecting text alone does nothing. Each section and visual has a keyboard comment action that appears on focus, so repeated buttons do not occupy the reading layout. The section action captures the selected excerpt and its occurrence, or the complete section when nothing is selected. A focus-only toolbar action comments on the canvas centre. Pointer movement beyond five pixels suppresses comment creation. Text selection remains available in Comment mode. Pan mode, middle-button dragging and touch swipes move the canvas; wheel movement remains usable throughout long documents.

An app-owned overlay captures visual points in Comment mode. Pan removes it so supported isolated HTML interactions work. The iframe sandbox, Worker and CSP restrictions remain in force. Section and visual notes store optional normalized positions; blank notes use canvas coordinates. Numbered pins follow their original full targets through zoom and unchanged-content relayout. Summarized targets are revealed by selecting their note in Feedback. Free-canvas notes retain their original coordinates in the section layout, including negative coordinates; other layouts show them in Feedback, and selecting one returns to its section-layout position. Changed or missing targets lose their pins and retain warnings in the list; selecting them does not focus replacement content. Old unpositioned notes remain readable, editable and copyable. Optional subject and position fields extend browser storage only; the server plan contract is unchanged.

The Feedback control toggles a 330px right-hand column below the header on desktop. The canvas uses the remaining width, including for Fit. The column follows the pinned prototype: Next refinement, Pending feedback with a count, readable locations and comment text, and Edit/Remove actions. Its heading and Copy feedback footer stay visible while the list scrolls. Comments remain text until Edit is chosen. Unsaved dialog text stays separate from saved notes; cancelling an edit restores the saved wording.

At widths up to 760px, the column becomes a toggleable 330px panel over the canvas, bounded by the available width and positioned below the actual header. Close feedback remains available in its heading. This follows the prototype phone panel while keeping the existing two-row phone header and plan navigation.

Selecting a listed location or numbered pin selects its note and reveals its unchanged target. Changed and missing targets retain their warnings without focusing replacement content. The ordinary list hides internal IDs, revision numbers, coordinate values and asset digests. Changed/missing warnings retain the original-reference explanation. The panel copies described notes as one self-contained MCP revision prompt. It records the plan, work item and section or asset digest, subject, section/visual position or canvas location, original reference and observed internal revision. Changing About does not change this reference. Copying the prompt is not submission, approval or agreement. The application never sends feedback text to the server.

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

The adaptive layout reference is revised C from issue #42, saved in
`docs/adaptive-sections/revised-c.html`. The existing header reference is `docs/plan-feedback-canvas` in `alundgren/irudd-skills`
at commit `754f9f4a08d8b6ba26ebde77531d028d30bed14e`. Its `canvas.html`,
`canvas.css`, `canvas.js` and `ux.md` govern colours, typography and header
presentation. The previous serif titles, cool cards and floating header no
longer govern these properties.

Use the prototype's warm paper CSS values: background `#F2EADE`, canvas/panel
`#EADFCD`, raised controls `#E0D2BD`, borders/grid `#C1AF9A`, sheets/fields
`#F9F6F0`, text `#604939`, secondary text `#66574D`, accent `#784F26`, links
`#3D5D71` and errors `#8F3A2D`. Text uses `system-ui, sans-serif` with weights
400, 500 and 600. Item frames have 10px corners and a single warm border. The
review area is flat with a 20px dotted grid. Spacing and dots remain readable across the adaptive layouts.
Existing section labels, order and organization remain in place. Sheet sizing
and navigation follow the adaptive layout rules above. Relationship arrows from the previous canvas are no longer drawn.

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
