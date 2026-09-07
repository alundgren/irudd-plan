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

A direct item URL focuses the top of its document at reading size, independently of document height. The compact Overview action above the canvas returns to the epic document. Its work-item index, direct URLs and browser history provide item navigation. Solid overview arrows remain; related-item edges and button strips are omitted without changing stored relationships. Fit all is an explicit action on the overview. Selecting another item changes the stable URL without reloading the application.

Each sheet presents the goal, required decisions, requirements, checks, visual references and Technical detail as one continuous document. Required context, prior art, deferrals and completion retain their existing labels and are always expanded. Wheel movement and touch swipes pan the canvas through the document bottom. Text selection and control clicks inside sheets do not pan the canvas or create feedback.

At 390px width, documents reflow to the viewport with 24px inner padding and retain reading-size text. Canvas movement reaches all content without a nested document scrollbar. This differs from the reference prototype, which scales desktop paragraphs down on phones. The narrower paragraphs keep the text readable.

## Live revisions

An accepted MCP write publishes a revision notification only after its SQLite transaction commits. The browser then fetches the complete current plan. Reconnection does the same, so several missed notifications cannot produce duplicate or partially updated documents.

Existing sheets retain their stable React Flow node IDs. A refresh retains the viewport when the selected ID is unchanged. If other items are reordered or removed, the viewport compensates for the selected sheet's new horizontal position. Resizing the window keeps its horizontal reading offset and vertical canvas position. Unchanged text stays mounted so selection can survive the update. Update highlighting does not alter section spacing. Changed sections use a short yellow "Updated" treatment that clears after five seconds.

The status badge shows `connecting`, `reconnecting`, or `Live`. An unavailable plan gets a dedicated recovery page. If the selected work item disappears in a revision, the application keeps the URL, explains that the item was deleted, and offers the overview.

A second status badge says `Private` or `Published`. The signed-in plan list also
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
scheduled expiry and unknown GitHub status in plain text. Scheduled expiry shows
the UTC date and explains that deleted content is lost. Unknown status includes
the verification failure reason; completed checks show last and next check
dates. The header occupies its own row above the canvas so status text does not
cover plan content on narrow screens. Public views omit these owner details. When a live document becomes
unavailable, the browser removes its cached document from the view and shows the
unavailable page at the same URL.
