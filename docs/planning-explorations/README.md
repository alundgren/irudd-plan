# Four ways to plan on the canvas

Status: design exploration. No option is selected and this PR changes no application behavior.

Open [the self-contained presentation](presentation.html) in a browser. It contains nine slides, four interactive mockups, a comparison, and shared interaction rules. The presentation uses sample planning content from the supplied screenshot about work item readiness. It does not connect to a live planning session.

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
5. The completed discussion leaves the active canvas and remains accessible through Done.

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

Select **Focus with examples** on a work item to temporarily use the whole canvas for that item and its attached examples. The presentation includes a dedicated Workspace slide and an entry point in every concept. It shows the affected question with one short takeaway and two illustrative before/after JSON excerpts. Show full examples expands both files on demand. Earlier discussion stays closed initially. Each document has independent Text + and Text − controls. Widen reallocates horizontal space to that document. Back or Escape restores the previous canvas and draft.

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

## Agent replies must be concise before rendering

The second supplied screenshot shows an additional failure. The answer repeats the request and explains the examples; each attachment repeats its title in a navigation button, a caption, an internal label, and another heading before the JSON begins. The person has to scan several introductions to reach the requested evidence. Merely reducing card padding will not fix this.

Apply these authoring and rendering rules across all four concepts:

- Start with the answer, changed rule, or requested artifact. A short request for examples should get examples and at most one sentence explaining the meaningful difference.
- Keep the current question and latest relevant exchange expanded. Older turns are a history action, not a growing stack above the editor. Preserve access to them.
- Render a JSON example as JSON with one filename. Do not put an HTML presentation, repeated title, explanatory subtitle, and nested code panel around it.
- Default comparisons to the relevant excerpt or changed part. Offer complete files explicitly. Never omit a qualifier that changes the meaning of the excerpt; label an excerpt as such.
- Put detailed rationale and source findings behind a named disclosure. Do not repeat them in the reply and the artifact.
- Use one navigation action for entering the comparison and one Back action for leaving. Do not repeat Read, Compare, and Back beside every copy of the same title.
- A follow-up should add the new information. Link the relevant earlier context instead of quoting the whole thread again.

For the screenshot's example, the initial reply can be: “The pending decision moves out of prose into an explicit record.” Show Before.json and After.json immediately below or beside it. Earlier discussion and full examples remain available, but do not precede the requested JSON.

The revised temporary workspace demonstrates this content treatment. The distinction between whole-item waiting and independent work remains the planning question in the four concepts; the new workspace illustrates how the related before/after representation can be inspected without repeating that entire discussion.

Treat concise output as part of the agent/browser contract, not a CSS cleanup. A future protocol may distinguish a short reply, supporting explanation, and raw file attachments. Select the workflow first, then decide whether explicit fields or authoring instructions are sufficient. Do not blindly hide the first paragraphs of arbitrary HTML or truncate responses by character count.

Add a review task: ask for a short before/after JSON example, then verify that the first visible content contains the relevant JSON and no repeated title. A person should be able to find the difference without expanding history or reading implementation bookkeeping. Also test a complex answer whose essential caveat must remain visible.

## Completed work leaves the active workspace

The third screenshot shows an answered question still occupying a large card, including the original choices and an empty editor. “Add or revise your answer” is the only completion cue. The person has already done this work and almost never needs to revisit it. A different caption or a smaller badge is insufficient.

Default to **needs my attention**. After a successful save, remove the question's answer editor and choices from active view. Waiting questions live behind a quiet Waiting count. After the proposed plan change is accepted, put the question behind Done. Keep the accepted plan content visible; hide the completed discussion and obsolete alternatives. Do not retain a row of collapsed cards, reserve their old heights, or maintain a permanent completed-work column.

The distinction matters: the human's answer can be finished while the planner has not replied. Moving a question out of active work does not declare its underlying decision resolved. A saved answer, a waiting planner response, a proposal requiring review, and a completed decision remain separate facts.

The revised mockups demonstrate this in each concept:

| Concept           | What disappears                                              | What remains                                                      |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Plan with margins | Answer editor, choices, then the settled margin discussion   | Current plan text and a quiet Done count                          |
| Decision map      | Completed question and its discussion; no placeholder node   | Current affected rules and other active questions                 |
| Alternate plans   | Competing candidate documents after selection and acceptance | Accepted rule and Done access to the answer                       |
| Guided focus      | Finished question and editor                                 | Next question with current plan context; Done holds prior answers |

Done opens a separate history view. Each entry initially shows its question title, Read saved answer, and Reopen question. Reading is not reopening. Back restores the active canvas. Reopening restores that question and its answer for revision, but does not undo the accepted plan. A later accepted proposal updates the plan separately. The prototype retains the latest saved answer per example question; full append-only history is a production requirement.

When the agent asks a genuine follow-up or a failed operation needs action, return the item to active work with a short reason such as “One follow-up.” Do not reactivate it for a connection event, acknowledgement, or background refresh. Keep failed drafts in place. Uncertain saves must remain distinguishable from completed answers until their receipt is confirmed.

After completion, use the released space for active work. Preserve the location of any other item being read or edited; do not animate a large automatic rearrangement around the user. When no active questions remain, show “Nothing needs your answer” and small Waiting/Done controls. Do not fill the empty canvas with archived work. Removing the completed content is the important feedback, with a brief accessible announcement confirming the save.

Acceptance checks:

- Save a custom answer. Its form and choices disappear; the saved answer is available in Waiting.
- Accept a suggested plan change. The completed question disappears and Done increases. The accepted rule stays readable.
- Finish 20 questions. Active layout and Fit do not reserve space for those 20 questions.
- Read a completed answer and return. The question stays completed and the active view is unchanged.
- Reopen it explicitly. Its saved answer is restored and editable; the current plan is unchanged until a new proposal is accepted.
- Receive an acknowledgement, then a genuine follow-up. Only the follow-up returns the question to active attention.
- Fail a save. Preserve the draft and keep the question active. Do not announce Done.

This is required in the first implementation slice of every concept, alongside independent document reading size. It replaces the earlier proposal to leave small discussion markers scattered throughout the default canvas. Historical markers may appear in an explicitly selected history mode.

## Put the requested decision before the recap

The fourth screenshot combines attachment navigation, several accepted plan rules, implementation details, scope exclusions, a publication question, and privacy information in one paragraph. The publication question is the current task. The accepted rules belong in the plan and the other material should not precede that question.

The presentation's Question slide gives a concrete rewrite:

> Draft, review, and publish the implementation issues?
>
> Repository: alundgren/irudd-plan
>
> Issue descriptions will be visible to repository readers. The detailed plan stays private; the issues link to it.

Offer separate, explicit choices: Draft, review, and publish; Prepare drafts for my review; Revise the design first. Put the recap and examples behind “Review the plan changes and examples.” The presentation controls only record a local sample choice. They do not authorize or perform issue publication.

Keep material consequences visible. In particular, do not shorten a publication choice to “Continue” or hide the destination and exposure of the issue content in a disclosure. When the real action is irreversible or externally visible, the person must still understand its scope from the active question. The illustration does not establish that the actual draft issues are ready; a production approval must link the concrete material being approved.

Author one primary question per turn in the active discussion. Lead with that question or the actual answer. Move already accepted facts into the current plan, link supporting evidence, and keep internal bookkeeping out of the human response unless it affects their decision. Use a short list when several genuinely separate facts are necessary. Do not turn the same oversized paragraph into a new stack of subheadings or cards.

Review with realistic long agent output: can the person identify the requested decision and its consequence from the first screen? Can they retrieve the supporting facts without losing the question? Are any essential caveats hidden? The renderer should support semantic content such as a question, choices, supporting detail, and linked plan content. It should not try to guess which sentence in arbitrary prose is safe to hide.

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

The HTML has no external fonts, libraries, network calls, or live application state. Suggested answers generate scripted example proposals. Custom replies only show a simulated saved/waiting state. Reset restores the local example. Done and Waiting hold the latest example answers, and Reopen restores an answer without reverting the plan. Reload loses all demo edits. These controls are for comparing interactions, not proving backend behavior.

Validation on September 11, 2026:

- Chromium at 1440 × 1000: all four suggested-answer/apply flows, custom-answer waiting states, reset, guided deferral, zoom, and nine-slide navigation passed without JavaScript errors.
- Chromium at 390 × 844: every slide fits the page width. Desktop mockup canvases scroll internally; the temporary workspace uses vertically arranged documents.
- Independent reading size changed only the selected JSON file from 16px to 20px. Widen and Back were exercised. Returning preserved the original canvas zoom, scroll coordinates, and unsent draft. Both per-concept and dedicated Workspace entry points passed.
- Desktop screenshots of all four concepts and the temporary workspace were visually reviewed. The dedicated workspace was also inspected at phone width.
- `vp run check` passed with 73 advisory warnings in existing source and test files. No application files were changed, so unrelated size and complexity refactoring is outside this exploration.
- `vp run check:ci` passed, including after the completed-work and clear-question revisions.
- Browser checks passed for completion, history reading without reopening, explicit reopening with the saved answer, and saved/waiting removal in all four concepts. All nine slides fit the phone viewport without page overflow.
- The concrete publication-question rewrite records a local demo choice only. Its supporting recap starts collapsed.
- The revised workspace starts with collapsed history and short JSON excerpts. Both excerpts and expanded examples parse as JSON. Switching back restores the excerpts.
- The first `vp run test` printed 23 passing files and 118 passing tests, but the command exited 143. A second run also exited 143 before printing results. A clean test-command exit could not be confirmed; the cause of termination is unknown.

## Published presentation

[View the presentation](https://repo-control.irudd.net/public/flebdcwyvjcgthpuyzvewsjokxjgexcl/view) · [Download the HTML](https://repo-control.irudd.net/public/flebdcwyvjcgthpuyzvewsjokxjgexcl/download)

Repo Control artifact `flebdcwyvjcgthpuyzvewsjokxjgexcl`, type `presentation`. Created September 11, 2026 at 04:18 UTC. The public links expire October 11, 2026 at 04:18 UTC. The HTML committed beside this document remains available after that expiry.
