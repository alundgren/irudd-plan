---
name: ui-pr-proof
description: Record short visual validation for a pull request with user-visible UI changes and link the evidence from the PR. Use during implementation handoff, after the changed flow works.
---

# UI proof for a pull request

Choose the one to three interactions that best explain the UI change. Use the
application's headless Playwright tests and synthetic data. Inspect the installed
Playwright API before choosing a recording method.

Check that tracing or another recorder does not capture at a lower resolution
first. In Playwright 1.62.1 the first screencast client controls capture size;
irudd-plan disables tracing for proof runs. Inspect an actual video frame for
padding or reduced text size, not only the separate screenshot.

Use a fixed viewport, normally 1280 by 800. Complete setup and navigation before
starting each screencast. Exercise the changed interaction, assert its resulting
state, and stop recording. Capture a still of the important result too. Prefer
WebM and several short clips to one long tour. Keep each clip to one interaction;
do not add fixed waits or unrelated actions to reach a duration.

If explicit screencasting is unavailable, use Playwright video and trim setup
from the result. Preserve assertion failures as failures. Review at least one
frame from each clip and check duration and file size before attaching it.

Keep binaries out of git. For irudd-plan, run `vp run test:ui-proof` locally
and select scenarios relevant to the PR. Trim each clip to one 3–5 second
interaction and render at half speed without adding waits. Attach clips directly
with `gh pr edit --attach`. Include the recorded commit and a short caption in
the PR body. Record fresh evidence when later changes affect the demonstrated
behavior. No GitHub Actions upload is required.

PR creation authority does not imply authority to publish production data,
create a release or send messages elsewhere. If the available upload route
fails, keep the completed implementation and describe the concrete reason in
the PR. Do not claim a local recording is attached. Do not install this proposed
skill globally unless asked.
