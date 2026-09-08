# Plan review interface

The browser application is a read-only review tool. It has no controls for editing stored plan content or publishing a plan. Local feedback drafts do not change that content.

## Layout and navigation

The first page lists plans owned by the signed-in person. Opening a plan fits a continuous canvas containing the epic goal and every work item. Each item keeps its complete description beside its required references. A measured grid places rows below actual text and asset heights. Adaptive headings can increase row heights as the camera zooms out. The selected item remains mounted.

Wheel movement zooms around the pointer using gesture magnitude. Ctrl/Cmd-wheel also zooms, including trackpad pinch events. Pan mode uses wheel movement to pan; Shift-wheel pans in either tool. Dragging with Pan or the middle mouse button moves the camera. Touch supports one-finger panning and two-finger zoom. Text selection remains available in Comment mode and cancels touch panning. Arrow keys move the focused canvas, plus/minus zoom, and Home fits all content.

Below 45%, summaries cover each item's complete content while keeping it mounted. Item titles and the epic goal enlarge as the camera zooms out, targeting 16px on screen up to an 80px canvas font limit. Titles wrap fully, and measured rows accommodate their height. Short goals remain secondary to item titles. Every required visual has a summary link and image thumbnail where supported; selecting it opens the full reference. Summary content contributes to frame height so multiple references cannot be clipped. Fit can shrink below a readable text size to include large plans and distant canvas comments. The searchable chooser provides readable navigation at any scale.

Clicking a title, summary or chooser option centers the description column at up to 110%. Descriptions wrap to the available phone width with 16px text at their reading scale. References stay alongside the description in the same canvas. Visual-reference links in the description focus each reference. Each reference retains its return-to-description icon. Long documents remain fully expanded; Pan, touch or arrow keys reach their lower sections.

The chooser uses the warm-paper palette, a search field and a scrollable list. Arrow keys move the active option, Enter opens it, and Escape closes the menu and restores focus. Clicking outside or tabbing away dismisses it. Search is useful for plans that cannot display readable titles when fitted.

The URL identifies current content, not a historical revision:

```text
/plans/{planId}
/plans/{planId}/items/{itemId}
/public/plans/{ownerId}/{planId}
/public/plans/{ownerId}/{planId}/items/{itemId}
```

Direct item URLs and browser history center the requested description. References use their owning item's URL. Zoom and pan preserve selection and do not add history entries. Epic goal in the chooser opens the plan URL and focuses the goal. Fit keeps the current selection. Opening Feedback and resizing preserve the selected document's vertical position and recenter it in the remaining width.

Every item presents its goal, required decisions, requirements, checks, visual-reference links and Technical detail. Required context, prior art, deferrals and completion remain expanded. Text selection and control clicks do not create feedback.

## References

Each required item/asset association appears inside its owning frame, including assets inherited through decisions and context. Shared assets appear for every owning item, retaining the original IDs and digests. Each reference names its item and shows the original caption and role. Raster and SVG proportions determine height without cropping. Missing assets, failed requests and unsupported previews keep their caption, feedback action and return link.

HTML keeps its isolated Worker interactions. Its frame grows with its document up to 4096px, with internal scrolling beyond that limit. Wheel movement over an HTML document scrolls the review area unless a nested area or the capped document can consume it. SVG frames remain script-disabled. The asset sandbox, CSP and Worker contracts are unchanged.

Replacing an asset remounts only its visual, while saved feedback retains the original digest and reports a changed target. Removing an association removes its reference and reports missing feedback targets; a selected removed reference returns to its item.

## Live revisions

An accepted MCP write publishes a revision notification only after its SQLite transaction commits. The browser then fetches the complete current plan. Reconnection does the same, so several missed notifications cannot produce duplicate or partially updated documents.

Items and references retain their stable React keys during live updates. The camera compensates when a live update moves the selected document to another grid row. Width changes keep its center in view and retain its vertical position. Unchanged text stays mounted so selection can survive. Update highlighting does not alter section spacing and clears after five seconds.
The review header does not show connection status or revision metadata. Reconnection continues automatically. An unavailable plan gets a dedicated recovery page. If the selected work item disappears in a revision, the application keeps the URL, explains that the item was deleted, and offers the overview.

The signed-in plan list
shows whether the repository still needs verification or cannot be published
because it is private. Published routes omit the private plan list and return to
the published overview. Publication remains an explicit authenticated MCP action,
not a browser control.

## Local feedback

The bottom toolbar retains Comment and Pan, C/V shortcuts, zoom out/in, a percentage button that resets to 100%, and Fit. Comment is the default and summaries navigate to full content. Shortcuts ignore controls, dialogs and editable content. Comment clicks on full text, drawings or blank canvas space open a focused dialog with editable About and Your feedback fields. Only Add comment saves a new note. Cancel and Escape leave notes and counts untouched and restore focus. A browser unload warning protects typed new feedback and unsaved edits from accidental reload or tab close. Clean dialogs do not warn. Edit uses the same dialog; Save comment changes wording while keeping the original target and revision.

Selecting text alone does nothing. Each section and visual has a keyboard comment action that appears on focus, so repeated buttons do not occupy the reading layout. The section action captures the selected excerpt and its occurrence, or the complete section when nothing is selected. A focus-only toolbar action comments on the canvas centre. Pointer movement beyond five pixels suppresses comment creation. Text selection remains available in Comment mode. Pan mode, middle-button dragging and touch swipes move the canvas; wheel movement in Pan mode remains usable throughout long documents.

An app-owned overlay captures visual points in Comment mode. Pan removes it so supported isolated HTML interactions work. The iframe sandbox, Worker and CSP restrictions remain in force. Section and visual notes store optional normalized positions; blank notes use canvas coordinates. Numbered pins follow their original full targets through zoom and unchanged-content relayout. Summarized targets are revealed by selecting their note in Feedback. Free-canvas notes retain their original world coordinates, including negative coordinates, at every zoom. Selecting one centers its position. Changed or missing targets lose their pins and retain warnings in the list; selecting them does not focus replacement content. Old unpositioned notes appear at the top-right of their section heading. Keyboard section actions also create heading notes without a synthetic normalized position. Positioned pins remain inside their targets, including at the edges. Stored identities and positions are never rewritten. Old notes remain readable, editable and copyable. Notes about the removed work-item index report a missing target. Optional subject and position fields extend browser storage only; the server plan contract is unchanged.

The Feedback control toggles a 330px right-hand column below the header on desktop. The canvas uses the remaining width, including for Fit. The column follows the pinned prototype: Next refinement, Pending feedback with a count, readable locations and comment text, and Edit/Remove actions. Its heading and Copy feedback footer stay visible while the list scrolls. Comments remain text until Edit is chosen. Unsaved dialog text stays separate from saved notes; cancelling an edit restores the saved wording.

At widths up to 760px, the column becomes a toggleable 330px panel over the canvas, bounded by the available width and positioned below the actual header. Close feedback remains available in its heading. This follows the prototype phone panel while keeping the single-row phone header and plan navigation.

Selecting a listed location or numbered pin selects its note and reveals its unchanged target. Changed and missing targets retain their warnings without focusing replacement content. The ordinary list hides internal IDs, revision numbers, coordinate values and asset digests. Changed/missing warnings retain the original-reference explanation. The panel copies described notes as one self-contained MCP revision prompt. It records the plan, work item and section or asset digest, subject, section/visual position or canvas location, original reference and observed internal revision. Changing About does not change this reference. Copying the prompt is not submission, approval or agreement. The application never sends feedback text to the server.

Feedback storage is partitioned by an opaque scope derived from the authenticated application owner and by plan ID. A different private owner cannot see the first owner's pending notes in the same browser profile. Public views use a separate browser-local scope from the authenticated owner view.

Live revisions retain pending notes. The panel compares their saved section content or asset digest with the current plan and labels changed or missing targets without moving feedback to new content. When this happens, the panel locally records whether preserving the original reference helped or got in the way. Storage and clipboard failures keep the current draft in memory and show a selectable prompt for manual copy.

## Text and visual content

Plan text uses a small display format: paragraphs separated by blank lines, lines beginning with `-` or `*` as lists, and `#` through `###` as small headings. The renderer creates React text nodes and never interprets plan text as HTML.

Raster images are owner-authenticated reads. Uploaded SVG and HTML never execute in the parent document. SVG uses a script-disabled iframe. HTML markup uses a script-disabled iframe, while its scripts run in a hardened SES compartment inside a dedicated Worker. The compartment receives only a small virtual document API for text, dataset, timer, and click updates; it receives no navigation, storage, messaging, or network capability. The Worker response also blocks network connections with Content Security Policy. Upload validation rejects external and relative markup dependencies and JavaScript module imports before storage.

## Retention status

The private plan list distinguishes retained open work, scheduled expiry and unknown GitHub status. The review view has no retention or repository-details disclosure. When a live document becomes unavailable, the browser removes its cached document and shows the unavailable page at the same URL.

## Visual reference and compact header

The continuous canvas follows the interaction direction recorded in PR #48 and its continuous C trial. The retained `docs/adaptive-sections/revised-c.html` records the previous discrete layouts. The existing header reference is `docs/plan-feedback-canvas` in `alundgren/irudd-skills`
at commit `754f9f4a08d8b6ba26ebde77531d028d30bed14e`. Its `canvas.html`,
`canvas.css`, `canvas.js` and `ux.md` govern colours, typography and header
presentation. The previous serif titles, cool cards and floating header no
longer govern these properties.

Use the prototype's warm paper CSS values: background `#F2EADE`, canvas/panel
`#EADFCD`, raised controls `#E0D2BD`, borders/grid `#C1AF9A`, sheets/fields
`#F9F6F0`, text `#604939`, secondary text `#66574D`, accent `#784F26`, links
`#3D5D71` and errors `#8F3A2D`. Text uses `system-ui, sans-serif` with weights
400, 500 and 600. Item frames have 10px corners and a single warm border. The
review area is flat with a 20px dotted grid. The grid remains in viewport pixels while document content scales.
Existing section labels, order and organization remain in place. Sheet sizing
and navigation follow the continuous canvas rules above. Relationship arrows from the previous canvas are no longer drawn.

The header contains the Implementation order action alongside these controls: the Plans icon and text, the searchable work-item chooser, and Feedback with its count. There is no Plan details option, status text, revision, repository or retention metadata in the review header. The epic goal stays on the canvas, with no separate item index or inner navigation bar. The chooser keeps its camera selection behavior even when selecting the current item again. On public routes, Plans retains the existing return-to-published-overview destination.

The header stays on one row, 68px high on desktop. At widths up to 700px, the Implementation order action sits below the chooser and the header grows to keep both readable. The chooser uses the space between Plans and Feedback and truncates its selected title when necessary. On phones the open menu spans the viewport with 8px margins so search and item names remain readable. Choosing an item cancels tracking of a previously selected feedback note. Its menu can extend over the canvas without being clipped by the header.

## Item prerequisites

Each section title bar has a separate `Depends on N` control when the item has
direct prerequisites. The title and control can wrap without hiding the title.
Zero prerequisites adds no badge and implies no readiness or completion state.
Related-item links have a separate meaning.

The control opens one small modal panel at a readable viewport size, even when
the canvas is zoomed out. It lists direct prerequisites in plan order using
current item titles. Each entry opens that item's stable reading view and moves
keyboard focus to its title. Escape, Close or a click/tap outside dismisses the
panel; dismissal returns focus to the trigger. Long lists scroll within the
viewport. Mouse, keyboard and touch use the same controls.

The panel creates no feedback and preserves pending notes. Live revisions
update its count and titles; removing its item or clearing its dependencies
closes it. Selected-item removal and plan-access failures retain the existing
recovery pages. Owner and public routes use the same authorized plan data,
without GitHub lookups or prerequisite completion tracking.

## Implementation order

Implementation order toggles a separate read-only view beside the ordinary
chooser. Toggling it off restores the ordinary canvas selection and camera;
the canvas and full references remain mounted. The order view retains its
selection and scroll across switches. Selecting a feedback location returns
to its full ordinary target, and the feedback dock and drafts remain available.

Step 1 contains items with no declared prerequisites. Every other step is one
plus the highest step of the item's direct prerequisites. Items stay in plan
array order within each step. Items in the same step have no declared dependency
on one another and may be implemented in parallel. These groups never indicate
completion, readiness, work started, or execution state. Related-item links and
GitHub associations do not participate.

Selecting an item inspects its direct relationships without navigating away.
Only its incident arrows appear, from prerequisite to dependent, including
connections that skip steps. Named prerequisite and dependent lists always
accompany the selection and scroll when long. Buttons in those lists inspect
another item. Open item navigates to the existing full reading view and stable
item URL. Returning to Implementation order retains the inspected item.

Step columns scroll at readable text size instead of shrinking the graph to fit.
Below 700px of available view width they stack vertically and omit arrows; the
named lists carry the same relationships. All inspection controls work with
Tab and Enter or Space. Live revisions recompute steps and lists without
resetting the graph scroll. Removed selections get an explicit notice. Invalid
or unavailable dependencies show an error instead of invented steps, while
legacy absent dependency fields and empty lists mean no declared prerequisites.
An empty plan gets an explanatory empty state. Relationship lines and compact
items create no new feedback targets.
