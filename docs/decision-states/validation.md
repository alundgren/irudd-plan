# Decision ownership validation

The service tests cover explicit states, required fields, owner-scoped question
links, shared-decision packet changes, readiness, stale writes, receipt replay,
reopening and reassignment. Conversation answers and resolution markers leave
selected packets unchanged until the specification is revised.

The browser scenario runs at 1280px and 390px. It exercises failed initial
conversation loading, delayed pagination, saved-answer status, mixed answered
and unanswered questions, replacement question links, retained drafts, public
privacy, outcome writeback and reopening.

A fresh outcome-writing client uses this call sequence:

```text
get_work_item -> patch_plan -> get_operation -> get_work_item -> check_packet
```

The test asserts the exact calls, preserved constraints, and both unchanged
freshness and completion readiness after the outcome. It uses neither whole-plan
nor conversation-history reads in that implementing-client sequence. The browser
and planner use the separate existing conversation to answer human questions.

## Desktop and phone captures

| State             | Desktop                     | 390px                    |
| ----------------- | --------------------------- | ------------------------ |
| Mixed ownership   | [Desktop](mixed-1280.png)   | [Phone](mixed-390.png)   |
| Public waiting    | [Desktop](public-1280.png)  | [Phone](public-390.png)  |
| Recorded outcomes | [Desktop](decided-1280.png) | [Phone](decided-390.png) |

## Broader browser limitations

The full browser regression run did not pass. Older tests use `.plan-viewport`
without distinguishing the mounted planning canvas from the specification
canvas. The duplicate-selector failures and existing feedback-position failure
were reproduced on base revision `3854ffd08ba1ea5135916719fa28c52a24a9cf88`:

```text
vp run test:browser tests/browser/adaptive-sections.spec.ts tests/browser/adaptive-visual.spec.ts
6 passed, 3 failed on the base revision

vp run test:browser tests/browser/document-reading.spec.ts
4 passed, 2 failed on the base revision
```

The document-reading failures concern the desktop completion marker after opening
feedback and the vertical offset after resizing. The full branch run ended with
exit 143 after reaching test 70 of 89. These results are not a successful full
regression run. The issue-specific lifecycle and affected planning checks are
reported separately in the pull request.
