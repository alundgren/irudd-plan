# Guided planning with a temporary example workspace

Selected direction: Guided focus plus “borrow the whole canvas.” This document is a rough implementation plan for later refinement. It does not split the work into issues or commit to a final schema. The other interaction concepts and the comparison presentation have been removed from this PR.

Open [the standalone mockup](mockup.html) in a browser. It illustrates the intended experience with sample content and local interactions. It is not connected to the application, an agent, or GitHub.

## Intended experience

The default view shows what needs the person's attention now. A relevant excerpt of the current plan stays on the left, one question occupies the center, and a short preview of upcoming questions sits to the right. A compact header provides the open-question list, Waiting, and Done. Navigation and saving do not require full-width bottom bars.

The person can answer a suggestion, write their own response, leave a question open, or jump to another open question. Typed responses survive navigation. New messages must not reset the camera or replace a draft while it is being edited.

A successful answer save removes the choices and editor. If the planner still owes a reply, the question goes into Waiting and the person can continue. A substantive follow-up returns it to active attention. A connection event or acknowledgement does not. Failed or uncertain saves stay visible until persistence is confirmed.

When a question is settled, it leaves the active canvas entirely. Done is a quiet count, not a permanent column or a row of collapsed cards. Reading an old answer does not reopen it. Explicitly reopening restores the discussion and answer for revision while preserving the accepted plan. When no questions need attention, show a clear empty state and access to the plan, Waiting, and Done.

## Borrow the whole canvas

Compare examples temporarily fills the viewport with the selected question and its related files. It uses the same underlying content, not a copied work item. Start with a short relevant excerpt and one useful sentence of context. Offer full files and older discussion on demand.

Canvas zoom and document reading size are separate controls. Increasing the text size or width of one JSON document must not enlarge its neighbors. Each file can scroll independently. On smaller screens, arrange the same documents vertically at readable size.

Back restores the previous selected question, camera position, zoom, and unsent answer. The temporary arrangement must not alter positions or sizes on the main canvas. Incoming updates should remain available on return without moving the reader's original location. If a file changed or disappeared, identify that condition instead of silently substituting another file.

The first version can focus the selected item and its attached examples. Arbitrary multi-selection, free arrangement, and nested temporary workspaces can wait unless refinement reveals a concrete need.

## Keep the conversation concise

Lead with the question or answer. Keep the relevant recommendation short. Accepted rules belong in the current plan; examples belong beside the question; a full recap belongs behind an explicit link. Do not repeat file titles in navigation controls, captions, internal headings, and wrapper cards.

Render JSON as JSON with one filename. Start comparisons at the relevant excerpt and label it as an excerpt. Keep essential caveats visible. A publication or other consequential question must still name what will happen and where; concision must not conceal the scope of approval.

This requires guidance for agent output as well as browser layout. During refinement, decide whether authoring instructions are enough or the conversation contract needs separate fields for the question, supporting detail, and references. Avoid heuristics that guess which paragraphs are safe to hide.

## Rough implementation approach

### Establish the active-work lifecycle

Define which questions need a human answer, are waiting for a planner response, need review of a proposed change, or are complete. Keep these states separate from whether the underlying plan has been updated. Define reopening, follow-ups, deferral, and the no-active-work state before changing the UI.

Use stable question identity and retain the conversation history. Derive attention state from confirmed events where possible. If a new persisted state is needed, define who can change it and how concurrent updates behave. Preserve author attribution, owner isolation, and the existing idempotent write receipts.

### Build the guided working area

Replace the repeated expanded question layout with one active question and its relevant plan context. Add readable open-question navigation and small Waiting/Done entry points. Move submission and error feedback beside the active answer. Keep drafts keyed to their questions rather than to mounted editors.

Preserve the user's selected question and camera during live updates. Move to the next useful question after successful submission or completion, while allowing deliberate deferral and direct navigation. The exact ordering rule can initially be simple and predictable. Avoid automatic reprioritization while someone is working.

### Add the temporary example workspace

Open the selected question and its references in a full-viewport view. Maintain separate reading-size and width preferences for each reference. Preserve the main canvas state while the workspace is open, including drafts and reference identity.

Reuse the authenticated, isolated reference viewer rather than weakening HTML or script isolation for the new layout. Different file types need appropriate reading controls: text can reflow, images can scale, and interactive HTML still follows its existing execution restrictions.

### Connect answers to visible plan updates

A saved answer is not evidence of a changed plan. Show a real planner response and the affected rule when a proposed update is ready. Applying a proposal must use the expected plan revision and reject stale changes. A correction must preserve history rather than silently undo later accepted work.

The mockup uses explicit “Apply and continue” approval to make this distinction visible. Whether every edit needs that approval remains a refinement question. Browser-side plan acceptance would be new authority compared with the current review-only specification view and needs an explicit authenticated operation if selected.

### Validate the complete flow and migrate deliberately

Test the experience with realistic long replies, large files, and many completed questions before polishing transitions. Include save failure, uncertain persistence, reconnect, conflicting revisions, removed targets, and returning from examples after an agent update.

After the workflow is settled, decide how existing conversations enter it. Preserve saved answers, links, attribution, and access to historical discussion. Either derive initial attention state conservatively or offer a historical view for records that cannot be mapped reliably. No deletion of existing plan data is part of this proposal.

## Repository starting points

[Current UX](../../ux.md) describes the existing canvas, batch answer submission, draft behavior, reference viewing, and waiting indicators. [Architecture](../architecture.md) describes separate conversation and plan revisions, authenticated browser and MCP operations, assets, and the queue companion.

Expect work in the planning browser view, conversation submission/state handling, and reference viewing. Server and contract changes depend on the selected lifecycle and plan-approval behavior. The current data model should inform migration and reuse, not constrain the chosen interaction.

Keep private conversation, drafts, and unaccepted proposals out of public plan reads and implementation packets. Only accepted requirements belong in the implementation plan. This document does not authorize implementation, deployment, or issue publication.

## Questions to resolve during refinement

- What confirms completion: an accepted plan update, a planner resolution, or an explicit human action? How does that differ from “my answer is saved”?
- Does choosing a suggestion submit immediately, as in the mockup, or first populate a draft?
- Which plan changes, if any, may the planner apply without another approval?
- What determines the next question, and how should deferred questions reappear?
- Should document reading sizes persist between visits? Can people add references beyond those attached to the current question?
- How should existing conversations acquire attention state without treating old answers as new work?

Resolve these together later, then split the selected behavior into implementation steps. They are not permission requests for this design-only PR.

## What success looks like

- The first screen makes the current question and its relevant plan rule easy to find.
- Answering removes the finished form. Twenty completed questions consume no active canvas space.
- Waiting, saving, and plan updates cannot be mistaken for one another.
- The person can revisit an answer without reopening it, or explicitly reopen it without reverting the plan.
- One example file can be enlarged independently, and Back preserves the original draft, selection, and camera.
- Long replies and references remain accessible without preceding or obscuring the current decision.
- Keyboard and phone users can perform the same tasks at readable text sizes.

## Mockup behavior and limits

The example starts with three open questions, one waiting answer, and two completed questions. Suggested answers produce scripted proposals. Apply and continue updates the local sample plan and advances. Custom answers move to Waiting. Open questions supports direct navigation; Done supports reading and reopening. Waiting includes a clearly labeled simulated follow-up for exploring the return to active work.

Compare examples supports independent text sizing, width, full/example excerpts, and Back. Read current plan shows the accepted sample rules. Reset example restores the initial state. Reload discards local changes. There is no persistence, live agent, network access, or actual plan mutation.

## Validation and published mockup

Browser checks passed in Chromium for suggested answers, proposed updates, completion, history reading, reopening without reverting the plan, custom answers, waiting, simulated follow-ups, deferral, and the no-active-work state. Independent document sizing and widening, full-file disclosure, and return with draft/camera restoration also passed. The mockup made no HTTP requests and produced no JavaScript errors.

Desktop and phone layouts were checked at 1440 × 1000 and 390 × 844. Screenshots of the working area and temporary workspace were visually reviewed. `vp run check:ci` passed. No application source or backend behavior changed.

[View the mockup](https://repo-control.irudd.net/public/wbfbqdmciddbwxycuravqwzijyuzofqi/view) · [Download HTML](https://repo-control.irudd.net/public/wbfbqdmciddbwxycuravqwzijyuzofqi/download)

Repo Control artifact `wbfbqdmciddbwxycuravqwzijyuzofqi`, type `mockup`. Published September 11, 2026 at 04:38 UTC; links expire October 11, 2026 at 04:38 UTC. The committed HTML remains available after expiry.
