# Plan review interface

The browser application is a read-only review tool. It has no controls for editing stored plan content or publishing a plan.

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

Existing cards retain their stable React Flow node IDs. A refresh does not run automatic zoom when the selected ID is unchanged, and the card scroll container remains mounted so its reading position and unchanged text selection can survive the update. Changed sections use a short yellow "Updated" treatment that clears after five seconds.

The status badge shows `connecting`, `reconnecting`, or `Live`. An unavailable plan gets a dedicated recovery page. If the selected work item disappears in a revision, the application keeps the URL, explains that the item was deleted, and offers the overview.

A second status badge says `Private` or `Published`. The signed-in plan list also
shows whether the repository still needs verification or cannot be published
because it is private. Published routes omit the private plan list and return to
the published overview. Publication remains an explicit authenticated MCP action,
not a browser control.

## Text and visual content

Plan text uses a small display format: paragraphs separated by blank lines, lines beginning with `-` or `*` as lists, and `#` through `###` as small headings. The renderer creates React text nodes and never interprets plan text as HTML.

Raster images are owner-authenticated reads. Uploaded SVG and HTML never execute in the parent document. SVG uses a script-disabled iframe. HTML markup uses a script-disabled iframe, while its scripts run in a hardened SES compartment inside a dedicated Worker. The compartment receives only a small virtual document API for text, dataset, timer, and click updates; it receives no navigation, storage, messaging, or network capability. The Worker response also blocks network connections with Content Security Policy. Upload validation rejects external and relative markup dependencies and JavaScript module imports before storage.
