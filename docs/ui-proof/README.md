# Short visual proof on pull requests

The experiment records focused, asserted browser interactions with headless
Playwright 1.62.1. The installed version supports `page.screencast.start` and
`stop`, so navigation, test data creation and server startup stay outside the
video. Two independent clips cover guided answers and example comparison.
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

The UI proof workflow runs on pull requests that change browser code, browser
tests, planning contracts or relevant tooling. It runs checks and unit tests,
then records the examples. Only a successful run uploads evidence. The artifact
name includes the PR commit and its download link appears in the job summary.
Artifacts expire after 30 days and require GitHub access. They are downloadable
files, not inline GitHub video players. The workflow has read-only repository
permissions and does not post comments or create releases.

The PR author copies the artifact link from the successful run into the PR
body, with the commit and a sentence about each clip. A later push requires
fresh evidence and a refreshed link. `gh run view` and `gh api` can retrieve the
run and artifact URLs. A failed workflow or unavailable artifact must be
reported explicitly; a local file path is not an uploaded attachment.

For the next UI change, add or select a focused scenario and update the
`test:ui-proof` script to run it. The workflow cannot decide which interactions
best demonstrate an arbitrary change. Keep that choice with the implementation
agent. Prefer two or three short examples over a tour of the application.
Aim for 10–30 seconds when the interaction needs that long; never pad a shorter
example. Use clear filenames and deterministic synthetic content.

[Suggested skill](skill/SKILL.md) describes that authoring workflow. It is a
proposal stored in this PR, not an automatically installed global skill.
