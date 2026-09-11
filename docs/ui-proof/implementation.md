# Guided planning implementation

This is a first implementation of the [rough plan and mockup](https://github.com/alundgren/irudd-plan/blob/t3code/reimagine-planning-canvas-ui/docs/guided-planning/README.md).

The default private view gives one question the main reading area. The accepted
plan is on the left; upcoming questions are on the right. Open, Waiting and Done
have direct navigation. The historical conversation canvas remains available,
with its existing camera, notes, attachments and save controls.

Answers keep the existing revision/digest checks and retry receipts. Drafts live
above the view components. Successful saves remove the editor and advance;
uncertain saves and edits made while saving remain visible. Explicit human
reopening appends a `reopened` event and restores the last answer without
changing the accepted plan. Stored conversation JSON accepts the new event, so
no database migration is needed. Older clients that validate a closed list of
entry kinds must update before consuming conversations with reopen events.

The example dialog uses the existing authenticated asset viewer. It fixes each
opened reference to its original digest, with independent reading size, width
and scrolling. Returning restores the underlying question and draft. Incoming
notes stay available in Earlier discussion. Resolutions wait until comparison
closes before advancing away from the selected question.

## Deliberate differences from the mockup

- Suggestions fill the draft; a separate save confirms submission.
- Only question entries ask for another answer. Agent notes and connection
  events cannot move Waiting back to Open. A follow-up question has its own
  stable identity and links to the original question.
- The accepted-plan excerpt uses the first decision. The current contract has
  no question-to-requirement association to select a reliable related excerpt.
- Attached documents open in full. Relevant excerpts need author-provided
  metadata; this version never guesses which caveats are safe to hide.
- Plan proposal approval stays with existing planner operations. There is no
  browser "Apply" button or invented plan-update confirmation.
- The guided layout uses responsive columns and ordinary scrolling. The
  historical canvas retains free pan and zoom. Comparison has its own zoom.
- Reading preferences last for the current comparison; drafts survive view
  navigation but remain in memory and do not survive page reloads.

## Validation

Unit tests cover event order, acknowledgement behavior, human-only reopening,
owner isolation, idempotent receipts and preservation of implementation packets.
Browser tests cover desktop and phone answers, historical reading, reopening,
draft retention, uncertain save recovery, independent reference sizing,
keyboard return, many completed questions and resolution during comparison.
Existing tests explicitly select the historical canvas before checking its
original navigation and saving behavior.

`vp run check` reports advisory length and complexity warnings already present
throughout the project, plus long JSX render functions in the new guided views.
The accepted-plan renderer is separate from conversation state. The remaining
JSX stays together because it describes one question or its navigation; splitting
individual conditional elements would add prop forwarding without isolating a
separate behavior. Warnings do not suppress format, lint or type errors.

See [the proof workflow](README.md) and [suggested skill](skill/SKILL.md) for
recording and attaching short examples to future UI pull requests.
