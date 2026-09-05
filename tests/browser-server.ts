import { browserAssetUploads, makeBrowserPlan } from "./browser-fixture.js";
import { startTestServer } from "./test-service.js";

const running = await startTestServer(undefined, 4173);
const assets = await Promise.all(
  browserAssetUploads("browser-plan").map((request) =>
    running.service.uploadAsset("owner-a", request),
  ),
);
await running.service.write("owner-a", {
  operationId: "browser-create",
  expectedVersion: null,
  plan: makeBrowserPlan(assets),
});

console.log(`browser test server listening at ${running.url}`);

const stop = (): void => {
  void running.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
