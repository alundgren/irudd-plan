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
WebM and several short clips to one long tour. Aim for 10–30 seconds where useful;
do not add fixed waits or unrelated actions to reach a duration.

If explicit screencasting is unavailable, use Playwright video and trim setup
from the result. Preserve assertion failures as failures. Review at least one
frame from each clip and check duration and file size before attaching it.

Keep binaries out of git. Use the repository's existing artifact upload route.
For irudd-plan, run `vp run test:ui-proof`, select scenarios relevant to the PR,
and use the successful UI proof Actions artifact. The workflow adds the commit
and download URL to its job summary. Add that link and a short caption for each
clip to the PR body through `gh`. State that the files require download and expire
after 30 days. Refresh the link when a later commit changes the UI.

PR creation authority does not imply authority to publish production data,
create a release or send messages elsewhere. If the available upload route
fails, keep the completed implementation and describe the concrete reason in
the PR. Do not claim a local recording is attached. Do not install this proposed
skill globally unless asked.
