# Decision wording review

The work-item page called every required decision "Open decisions", including
choices already recorded during planning. Readers could not tell whether to
follow those choices or make them.

[View the six-slide presentation](https://repo-control.irudd.net/public/hkerpzdicbkojgeobepvgxbidflivvrh/view)
or [download it](https://repo-control.irudd.net/public/hkerpzdicbkojgeobepvgxbidflivvrh/download).
The Repo Control copy expires on 10 October 2026. The permanent source is
[presentation.html](presentation.html), a self-contained HTML deck with desktop
and 390px mockups.

## Three options

| Option                    | Benefit                                         | Limitation                                  |
| ------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Agreed decisions          | Minimal wording change; reads as settled        | Implies agreement the app cannot verify     |
| Decisions to follow       | Tells humans and agents how to use the choices  | Does not track unresolved choices           |
| Decided / Still to decide | Separates unresolved work and names who answers | Needs status, ownership and migration rules |

The implementation selects **Decisions to follow**. A short sentence explains
that these choices belong to the current plan and should be followed during
implementation. Full choices and reasons stay expanded, separated by spacing
and rules. The section is absent when no decisions are required.

The MCP tool description and bundled skill give agents the same instruction,
including raising conflicts before changing a recorded choice. Planning guidance
keeps unanswered questions in the conversation and puts explicitly delegated
choices and their limits in work-item requirements.

Existing decision records and packet contracts remain compatible. There is no
approval inference, migration or automatic classification of existing prose.
The section ID and feedback content matching remain unchanged. Existing saved
feedback may retain its historical heading label.

An already running implementation session may have cached its tools and installed
skill. This change takes effect after deployment and refreshed tool discovery;
the bundled skill also needs installation in environments using a local copy.

## Validation

- `vp run check` and `vp run check:ci`: passed. The 73 advisory file/function
  length and complexity warnings were also present before this change. The
  existing item renderer keeps its sections together; splitting it for four
  additional lines would not improve this change.
- `vp run test`: 118 tests passed across 23 files, including MCP packets and feedback.
- Focused Playwright run: three tests passed, covering desktop at 1440px,
  phone at 390px, public readers and omission on items without decisions.
- Presentation: all six slides, next/previous and keyboard navigation, phone
  preview controls, mobile overflow and browser console checked.
- Inspected the presentation and actual application screenshots at desktop and
  phone widths.

The browser run used a temporary configuration on port 4279 because another
process occupied the default port. The configuration was removed afterward.
The shared pan helper now selects the exact Plan canvas label, avoiding a
collision with the mounted Planning canvas.

[Desktop application capture](desktop.png) · [Phone application capture](phone.png)

This change addresses wording in the product. It does not implement or close
issue #63, which is being handled separately.
