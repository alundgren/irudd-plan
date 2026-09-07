# Plan review interface

The browser application is a read-only review tool. It has no controls for editing stored plan content or publishing a plan. Local feedback drafts do not change that content.

## Layout and navigation

The first page lists plans owned by the signed-in person. Opening a plan shows its epic overview and work items as document sheets on a React Flow canvas. Pan or zoom to compare sheets. The desktop documents are 600px wide with 40px padding and 72px gaps, arranged left to right. Each document grows with its content, so revisions cannot make rows overlap. The overview title uses the epic goal; its body and index remain available. The header reports the current committed revision and whether live updates are connected.

The URL identifies current content, not a historical revision:

```text
/plans/{planId}
/plans/{planId}/items/{itemId}
/public/plans/{ownerId}/{planId}
/public/plans/{ownerId}/{planId}/items/{itemId}
```

A direct item URL focuses the top of its document at reading size, independently of document height. The compact Overview action above the canvas returns to the epic document. Its work-item index, direct URLs and browser history provide item navigation. Solid overview arrows remain; related-item edges and button strips are omitted without changing stored relationships. Fit is available in the bottom canvas toolbar from every sheet. Selecting another item changes the stable URL without reloading the application.

Each item sheet presents the goal, required decisions, requirements, checks, links to visual references and Technical detail as one continuous document. Required context, prior art, deferrals and completion retain their existing labels and are always expanded. Wheel movement and touch swipes pan the canvas through the document bottom. Text selection and control clicks inside sheets do not pan the canvas or create feedback.

At 390px width, documents reflow to the viewport with 24px inner padding and retain reading-size text. Canvas movement reaches all content without a nested document scrollbar. This differs from the reference prototype, which scales desktop paragraphs down on phones. The narrower paragraphs keep the text readable.

## Reference sheets

Each required item/asset association has its own reference sheet immediately after the item. Required assets inherited through decisions and context use the same rule. Shared assets appear beside each item that requires them, using the existing bytes and identities. No plan format or stored data changes are needed.

The sheet title names its originating item because the asset format has a caption but no separate title. The exact caption sits above the drawing. "Acceptance reference" or "Illustration" explains the asset's role in plain text. A short link in the item focuses its reference at reading zoom; Return to the named item restores the item's top without adding a browser-history entry. Reference selection stays within the item's existing URL. Overview, item history and Fit all retain their existing behavior, and Fit all includes every reference sheet.

Reference sheets use the prototype's 600px width, 40px padding and 72px gaps. Drawings extend 20px into the inner margins, giving them 560px at desktop reading zoom. Raster and SVG proportions determine their height without cropping. Captions wrap and sheets grow downward without overlapping neighbors. Missing assets, failed requests and unsupported previews keep their caption, feedback control and return action visible.

HTML keeps its isolated Worker interactions. Its frame grows with its document, up to 4096px, with internal scrolling beyond that limit. The limit prevents viewport-relative HTML from enlarging its own viewport indefinitely. Wheel movement over an HTML drawing pans the canvas unless a nested scroll area or the capped document can consume that movement. Static SVG frames let wheel and pointer movement reach the canvas. HTML head styles remain available inside the isolated frame.

Asset feedback records the originating item, asset ID and exact digest. A replacement marks only its affected reference sheets as updated and remounts that visual, while saved feedback continues to describe the original digest and reports a changed target. Removing an association removes its sheet and reports missing feedback targets; a selected removed reference returns to its item. Reference node IDs encode the item and asset separately so arbitrary stored IDs cannot collide with item nodes.

## Live revisions

An accepted MCP write publishes a revision notification only after its SQLite transaction commits. The browser then fetches the complete current plan. Reconnection does the same, so several missed notifications cannot produce duplicate or partially updated documents.

Existing sheets retain their stable React Flow node IDs. A refresh retains the viewport when the selected ID is unchanged. If other items are reordered or removed, the viewport compensates for the selected sheet's new horizontal position. Resizing the window keeps its horizontal reading offset and vertical canvas position. Unchanged text stays mounted so selection can survive the update. Update highlighting does not alter section spacing. Changed sections use a short warm paper "Updated" treatment that clears after five seconds.

The header status shows `connecting`, `reconnecting`, or `Live`. An unavailable plan gets a dedicated recovery page. If the selected work item disappears in a revision, the application keeps the URL, explains that the item was deleted, and offers the overview.

Plan details shows `Private` or `Published` and repository verification status. The signed-in plan list also
shows whether the repository still needs verification or cannot be published
because it is private. Published routes omit the private plan list and return to
the published overview. Publication remains an explicit authenticated MCP action,
not a browser control.

## Local feedback

The bottom-centred toolbar follows the pinned prototype: Comment and Pan, C/V shortcuts, zoom out/in, a percentage button that resets to 100%, and Fit. Comment is the default and a mode-specific hint explains the pointer action. Shortcuts ignore controls, dialogs and editable content. Comment clicks on text, drawings or blank canvas open a focused dialog with editable About and Your feedback fields. Only Add comment saves a new note. Cancel and Escape leave notes and counts untouched and restore focus. Edit uses the same dialog; Save comment changes wording while keeping the original target and revision.

Selecting text alone does nothing. Each section and visual has a keyboard comment action that appears on focus, so repeated buttons do not occupy the reading layout. The section action captures the selected excerpt and its occurrence, or the complete section when nothing is selected. A focus-only toolbar action comments on the canvas centre. Pointer movement beyond five pixels suppresses comment creation. Text selection remains available in Comment mode. Pan mode, middle-button dragging and touch swipes move the canvas; wheel movement remains usable throughout long documents.

An app-owned overlay captures visual points in Comment mode. Pan removes it so supported isolated HTML interactions work. The iframe sandbox, Worker and CSP restrictions remain in force. Section and visual notes store optional normalized positions; blank notes use canvas coordinates. Numbered pins follow their original targets through zoom and unchanged-content relayout. Changed or missing targets lose their pins and retain warnings in the list; selecting them does not focus replacement content. Old unpositioned notes remain readable, editable and copyable. Optional subject and position fields extend browser storage only; the server plan contract is unchanged.

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
navigation and relationship lines follow the layout rules above.

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
