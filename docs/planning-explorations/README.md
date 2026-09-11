# Four ways to plan on the canvas

Status: design exploration. No option is selected and this PR changes no application behavior.

Open [the self-contained presentation](presentation.html) in a browser. It contains eight slides, four interactive mockups, a comparison, and shared interaction rules. The presentation uses sample planning content from the supplied screenshot about work item readiness. It does not connect to a live planning session.

## The problem to solve

The person is trying to understand the current plan, answer a question, and see what their answer changes. In the supplied screenshot, the current plan is behind a separate navigation action. Full-width navigation and submission bars use substantial vertical space. Section headings, question frames, author labels, answer labels, choice borders, and empty editors repeat across the canvas. At the pictured zoom, reading adjacent questions requires horizontal movement before the complete response area is visible.

The opportunity is to give space a useful meaning. Related discussion can sit beside plan text, dependencies can connect decisions, and alternative plans can be compared at the same time. An infinite canvas should support both a readable working area and an overview. It should not require fitting all text onto one screen.

## Shared design decisions for this exploration

- Use a compact plan identity row. Put navigation in a chooser in a production design, and put zoom controls in a small floating group.
- Remove the global answer submission footer. Submit the active answer beside its question. A suggested answer sends that choice; custom text uses Send. Production must make that consequence explicit and support correction.
- Keep the current plan or the affected part of it visible while answering.
- Show one expanded discussion per working area. Earlier turns remain available in a flat chronological history, without recursively nested replies.
- Preserve readable body text. Overview mode should show titles and decision states, then navigate to reading size. Do not solve density by shrinking every label.
- Separate the saved human answer, the agent's proposed wording, and the accepted plan revision. Each state needs evidence from the operation it describes.
- Use the existing warm-paper palette and system fonts so the deck is self-contained. Box documents or active decisions once; use spacing and position for the rest.

These are deliberate alternatives to the current rules in [ux.md](../../ux.md), especially answer submission outside the canvas and batch saving. They are proposals, not changes to the settled application UX. The current contract, storage, and component layout must not limit concept selection.

## 01. Plan with margins

The plan is a readable document on the canvas. Questions appear beside the passages they affect. Selecting a passage opens its discussion; selecting a discussion reveals the corresponding text.

1. The agent marks the ambiguous readiness rule and asks whether an open human decision blocks the whole item.
2. The person reads the rule and answers in the adjacent margin.
3. The answer stays visible. The agent proposes replacement wording next to the original passage.
4. The person accepts the edit or explains what is wrong. The accepted wording becomes the current plan.
5. The discussion collapses to a small marker and remains accessible from that passage.

The mockup demonstrates a suggested answer, a simulated proposal, an applied rule, and reset. A custom answer shows a waiting state. It does not invent a response to arbitrary text.

Best fit: refining a plan that already contains useful text. This most directly repairs the missing plan context in the screenshot.

Main risk: a discussion can become detached when the referenced text changes or moves. Production needs a stable passage identity and an explicit changed or removed target state. Match the exact passage version, not just the first occurrence of its text. If two sections contain “wait for approval,” editing one must not move the other's discussion.

First implementation slice: one plan document, one active passage discussion, one proposed replacement, accept/reject, and revision history. Defer simultaneous margin threads and arbitrary document rearrangement.

## 02. Decision map

Each decision occupies a place on the canvas. Labeled states distinguish settled decisions, unanswered questions, and affected plan rules. Connections express an explicit relationship, such as “blocks readiness.”

1. Start at an unanswered decision with its immediate dependencies and consequences visible.
2. Answer the decision in place.
3. Review the proposed change to the connected rule.
4. Accept the change, then navigate to another related decision.
5. Reopen a prior decision without losing its history. Mark affected downstream rules for review.

The mockup shows a settled prerequisite, an active readiness question, a resulting rule, and a follow-up question. It allows updating the rule and previewing the follow-up. It does not implement arbitrary graph editing.

Best fit: a session with decisions that affect each other. The position and connections explain why the question matters.

Main risk: many connections obscure the useful path. Start with direct connections; provide a searchable outline with states and keyboard navigation. Layout changes must not move the active question while someone is typing. A connection must have a recorded meaning, not merely visual proximity.

First implementation slice: a small directed decision graph with two relationship types, affects and depends on, a selected decision view, and an accessible outline. Validate the task with 20 decisions before adding free arrangement or graph editing tools.

## 03. Alternate plans

The agent presents concrete candidate plans side by side. Each uses the same comparison structure, including resulting rule, example, benefit, and cost. The person chooses the behavior they want rather than translating an abstract answer into a plan themselves.

1. Read the competing readiness policies together.
2. Compare what happens to the same work item under each policy.
3. Propose one candidate or describe a third approach.
4. Review the selected candidate as a proposed update, then accept it.
5. Preserve the other candidate in history with its rationale. Reopening it creates a fresh proposal against the current plan.

The mockup compares whole-item waiting with requirement-level independence. Selecting either alternative highlights it and enables acceptance. Custom approaches enter a waiting state. Combining alternatives is described here as future behavior, not a working demo control.

Best fit: choices with meaningful consequences that are difficult to explain in a short question. Concrete examples and visual artifacts can sit alongside each candidate.

Main risk: each candidate can diverge while the plan changes. Candidates need a shared base revision and explicit changed content. Never apply a stale candidate over unrelated accepted changes. Limit the initial comparison to two or three candidates.

First implementation slice: two alternatives for one policy, consistent comparison headings, select, propose, accept, and retain rejected alternatives. Defer mixing individual paragraphs between candidates and multi-author branch editing.

## 04. Guided focus

The active question occupies the center of the canvas. A compact current-plan excerpt remains to the left. The upcoming questions sit farther along the canvas. Finishing a question advances the working area while leaving a navigable record behind.

1. Enter at the next unanswered question with the affected rule visible.
2. Answer, review the resulting edit, and apply it.
3. Move to the next question without switching screens.
4. Leave a question open if it needs more thought. Dependent questions explain that unresolved condition.
5. Return to earlier answers through the outline or prior locations on the canvas.

The mockup demonstrates the readiness question, a second question about who records the outcome, and leaving the first question open. Reset returns to the initial state. The full session outline and animated camera movement are future behavior.

Best fit: a person wants progress through a planning session without scanning every open thread. This is also the strongest starting point for a phone interaction.

Main risk: a sequential flow can imply that everything is complete when skipped questions remain. Show unresolved counts and dependencies. Completion requires a review of open decisions, not merely reaching the end of the sequence.

First implementation slice: an ordered question list, one focused editor, the relevant plan excerpt, defer/revisit, and explicit proposal acceptance. Defer automated prioritization and animated transitions.

## Temporary workspace with independent document sizes

The user's example-file workflow adds a requirement shared by all four concepts. A global canvas zoom is insufficient when one JSON file needs more reading space than its neighbors.

Select **Focus with examples** on a work item to temporarily use the whole canvas for that item and its attached examples. The presentation includes a dedicated Workspace slide and an entry point in every concept. It shows two illustrative JSON files and the affected item. Each document has independent Text + and Text − controls. Widen reallocates horizontal space to that document. Back or Escape restores the previous canvas and draft.

Treat three operations separately in production:

- Canvas zoom changes the camera over the arrangement.
- Document reading size changes only the selected document, with reflow and measured layout. It must not scale its neighbors or move focus to another item.
- Focus with examples opens a temporary selection of content using the available viewport. It must not move or resize the original content on the main canvas.

Keep stable content identity across the two views. A workspace is another view of the same item and files, not a copied plan. Preserve the original camera, selected item, text selection where practical, document scroll positions, and unsent drafts. Store workspace reading preferences separately from the main canvas camera. The demo preserves the mounted original canvas and its draft; it resets temporary file sizing on reopening. Production persistence of those preferences remains a product choice.

Acceptance checks:

1. Pan the original canvas, change its zoom, and type an unsent answer.
2. Open the item's temporary workspace. Only that item and its related example files appear.
3. Increase one JSON file's text size. The other file's text size stays unchanged. Widen that file without changing the underlying plan layout.
4. Read a long file, then return in one action. The original camera, zoom, and unsent answer are unchanged.
5. Receive a reply while focused. On return, show the update beside its target without resetting the camera.
6. If an example changes or disappears, identify the version or missing file. Do not silently show another file under its name.
7. Repeat with keyboard navigation and with a phone-sized viewport. Keep the item and references reachable without reducing form text below reading size.

This is a shared inspection capability, not a fifth back-and-forth model. Prioritize it in the first slice of whichever concept is selected. Resolve whether people can add arbitrary related files to a workspace or only open the item's attached references.

## Recommendation and selection exercise

Test Plan with margins first, then Alternate plans. The first keeps the plan visible while changing it. The second gives difficult tradeoffs enough room. Test the concepts separately before choosing a combination; otherwise it will be hard to learn which interaction helped.

Run the same tasks in each candidate with representative short and long content:

- Find the current readiness rule and explain the consequence of each suggested answer.
- Reject the recommendation and write a custom answer.
- Tell whether the answer was saved, whether the planner replied, and whether the plan changed.
- Revisit an earlier answer after another rule changes.
- Recover a failed answer save without retyping or creating a duplicate response.
- Find every unresolved question in a plan with 20 decisions and several long discussions.

Observe time spent finding context, navigation actions before answering, accidental submissions, lost position, and mistaken beliefs about completion. Do not claim a percentage improvement until these are measured. Prefer the concept in which the person can explain the resulting plan accurately and complete the tasks without assistance.

## State and recovery requirements

| State                     | What the person sees                                    | Required behavior                                                                                  |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Draft                     | Editable response next to its question                  | Preserve locally by plan and question. Reload recovery is an explicit new requirement.             |
| Saving                    | Local progress beside the submitted answer              | Avoid duplicate submission. Keep text available.                                                   |
| Saved                     | The submitted wording and a persistence receipt         | Do not claim the agent is working or the plan changed.                                             |
| Waiting                   | A quiet local waiting message                           | Require an actual linked reply to clear it. General connection events are insufficient.            |
| Proposed                  | Original and replacement wording, with affected context | Let the person accept, reject, or request a revision.                                              |
| Applied                   | Updated rule and an accessible record of the change     | Keep the human answer and agent rationale.                                                         |
| Definite save failure     | Retry next to the preserved draft                       | Retry safely without discarding input.                                                             |
| Uncertain save            | Submitted text and a delivery-check action              | Check the original operation receipt before resubmitting.                                          |
| Stale proposal            | Current wording and a request to review again           | Reject an apply against the wrong base revision.                                                   |
| Paused agent              | Saved answer plus the known session state               | Offer resume only when the integration supports it. Never infer runtime activity from saving.      |
| Changed or removed target | Original quoted context and an explanation              | Let the person reattach or leave the discussion historical. Never silently target another passage. |

Correction should append a new answer or compensating plan change. “Undo” must not delete history or overwrite unrelated later changes. Multiple tabs must receive the accepted revision and reject stale edits. Errors should reserve space near the action without displacing the selected text.

## Canvas, long content, and smaller screens

Keep selection and the camera stable when replies arrive. New content should appear beside its target, with a local indicator when outside the viewport. Automatic layout should avoid overlapping documents and protect the active working area. Provide a searchable outline for large plans, direct links to decisions, keyboard navigation, and a return-to-current-work action.

At overview scale show meaningful titles and states, not unreadable full paragraphs. Opening a decision restores reading size. Let long discussion history expand on demand; do not truncate the actual question, proposed rule, or submitted answer. Place large references next to their related question and offer a full reference view.

On phones, use a readable selected question and plan excerpt in a vertical sequence. Provide an explicit switch to overview and a way back to the current question. Do not make the user pinch to read forms. The presentation itself has responsive navigation and scrollable desktop canvases; its Fit control is for inspecting spatial composition. It is not a finished mobile application prototype.

Keyboard users need the same answer, accept, defer, history, and navigation paths. Keep focus visible and announce receipts. Reduced motion should disable camera animation. Production should preserve text selection and distinguish a pan gesture from clicking a choice.

## Implementation planning after selection

Resolve these product questions before writing implementation issues:

1. Which concept is the default planning experience? Which task justifies opening another mode, if any?
2. Does a suggested answer submit immediately or populate a draft? The demos submit it immediately, with a separate approval for plan changes.
3. Must a human accept every proposed plan edit? The demos require acceptance. If automatic edits are allowed, define exactly which changes qualify and how to undo them.
4. Should the browser directly edit plan text, or only request and accept agent-authored proposals? Plan with margins currently demonstrates the latter.
5. What ends a session: no unanswered questions, no unresolved decisions, or explicit acceptance of the plan?
6. How much spatial arrangement is user-owned, and how should it behave as content changes?

After those decisions, define the domain concepts the selected workflow needs. Likely candidates are a stable discussion target, an answer with its author and submission receipt, a proposed edit against a specific revision, and an acceptance result. The map additionally needs explicit decision relationships. Alternate plans additionally needs candidate identity and a common base. Guided focus needs deferred state and deterministic navigation. These are hypotheses, not a schema to implement wholesale.

Use the current repository as evidence for implementation planning only after selecting the interaction:

- [Current UX](../../ux.md) documents navigation, question batches, draft behavior, canvas movement, and wait status.
- [Architecture](../architecture.md) describes the separate planning discussion and plan revision paths, authenticated browser and MCP writes, immutable assets, and the queue companion.
- Investigate the existing discussion submission and revision transactions for reuse. Preserve author attribution, owner isolation, idempotent receipts, and optimistic concurrency.
- A browser action that applies a proposed plan change is new authority relative to the current review-only browser. Specify and validate that operation explicitly. A visual approval button must not bypass server authorization.
- Keep private discussion and alternative drafts out of public plan reads and implementation packets. Only accepted requirements belong in the implementation plan.
- Preserve the isolated asset viewer when adding visual comparisons. Presentation JavaScript is not a proposed asset execution model.

Deliver one end-to-end slice for the chosen concept, including save failure, stale revision, and returning to an earlier answer. Then test realistic volume and phone behavior. Decide on migration only when the selected workflow is known. Existing conversations need either explicit conversion with stable links or an accessible historical view. No data removal or compatibility break is authorized by this exploration.

## Artifact scope and validation

The HTML has no external fonts, libraries, network calls, or live application state. Suggested answers generate scripted example proposals. Custom replies only show a simulated saved/waiting state. Reset and Undo demo changes reset the local example. Reload loses all demo edits. These controls are for comparing interactions, not proving backend behavior.

Validation on September 11, 2026:

- Chromium at 1440 × 1000: all four suggested-answer/apply flows, custom-answer waiting states, reset, guided deferral, zoom, and eight-slide navigation passed without JavaScript errors.
- Chromium at 390 × 844: every slide fits the page width. Desktop mockup canvases scroll internally; the temporary workspace uses vertically arranged documents.
- Independent reading size changed only the selected JSON file from 16px to 20px. Widen and Back were exercised. Returning preserved the original canvas zoom, scroll coordinates, and unsent draft. Both per-concept and dedicated Workspace entry points passed.
- Desktop screenshots of all four concepts and the temporary workspace were visually reviewed. The dedicated workspace was also inspected at phone width.
- `vp run check` passed with 73 advisory warnings in existing source and test files. No application files were changed, so unrelated size and complexity refactoring is outside this exploration.
- `vp run check:ci` passed.
- The first `vp run test` printed 23 passing files and 118 passing tests, but the command exited 143. A second run also exited 143 before printing results. A clean test-command exit could not be confirmed; the cause of termination is unknown.

## Published presentation

[View the presentation](https://repo-control.irudd.net/public/aijxsitqicflfudqnemrlwpukldrxomu/view) · [Download the HTML](https://repo-control.irudd.net/public/aijxsitqicflfudqnemrlwpukldrxomu/download)

Repo Control artifact `aijxsitqicflfudqnemrlwpukldrxomu`, type `presentation`. Created September 11, 2026 at 04:07 UTC. The public links expire October 11, 2026 at 04:07 UTC. The HTML committed beside this document remains available after that expiry.
