import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { startTestServer } from "../tests/test-service.js";
import { tenItemPlan, fixtureAssetUpload } from "../tests/fixture.js";

const plan = tenItemPlan();
const server = await startTestServer(undefined, 0, async (service) => {
  await service.uploadAsset("owner-a", fixtureAssetUpload(plan.planId));
  await service.write("owner-a", {
    operationId: "seed",
    expectedVersion: null,
    plan,
  });
});
try {
  process.exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(
      "python3",
      ["scripts/codex-queue-trial.py", server.url, plan.planId, resolve(".")],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
} finally {
  await server.close();
}
