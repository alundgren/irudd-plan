# Short visual proof on pull requests

The experiment records focused, asserted browser interactions with headless
Playwright 1.62.1. The installed version supports `page.screencast.start` and
`stop`, so navigation, test data creation and server startup stay outside the
video. Proof runs disable Playwright tracing because its earlier, lower-resolution
screencast controls capture dimensions in this installed version. Ordinary
browser tests retain failure traces. Two independent clips cover guided answers and example comparison.
Screenshots provide a still view for comparison with the design mockup.

Run `vp run test:ui-proof`. On a shared development VM, select a free port with
`BROWSER_PORT=4281 vp run test:ui-proof`. The ordinary Playwright server starts
the built application with isolated test data and test authentication. No
production conversation or credentials appear in the evidence.

The helper in `tests/browser/ui-proof.ts` starts recording immediately before
an interaction and attaches the WebM and screenshot to the Playwright result.
Assertions run inside the recording. A failed assertion fails the test; it
cannot produce a successful proof attachment. Files stay in ignored
`test-results/ui-proof/`, never in git. No fixed waits extend a clip.

## PR delivery

Run recordings locally with `vp run test:ui-proof`. Select scenarios relevant
to the PR in the package script. Review the result, trim each clip to one
3–5 second interaction, and render at half speed without adding waits.

Attach the clips directly to the PR with `gh pr edit --attach`, and identify
the recorded commit and interaction in the PR body. Keep recordings out of git.
Record fresh evidence when later changes affect the demonstrated behavior.
There is no GitHub Actions recording or artifact upload workflow.

[Suggested skill](skill/SKILL.md) describes that authoring workflow. It is a
proposal stored in this PR, not an automatically installed global skill.
