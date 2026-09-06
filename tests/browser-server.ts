import { browserAssetUploads, makeBrowserPlan } from "./browser-fixture.js";
import { startTestServer } from "./test-service.js";

const running = await startTestServer(undefined, 4173, async (service) => {
  const assets = await Promise.all(
    browserAssetUploads("browser-plan").map((request) =>
      service.uploadAsset("owner-a", request),
    ),
  );
  await service.write("owner-a", {
    operationId: "browser-create",
    expectedVersion: null,
    plan: makeBrowserPlan(assets),
  });
  for (const ownerId of ["owner-a", "owner-b"] as const) {
    const feedbackAssets = await Promise.all(
      browserAssetUploads("feedback-plan").map((request) =>
        service.uploadAsset(ownerId, request),
      ),
    );
    await service.write(ownerId, {
      operationId: `feedback-create-${ownerId}`,
      expectedVersion: null,
      plan: makeBrowserPlan(feedbackAssets, "feedback-plan"),
    });
  }
});

console.log(`browser test server listening at ${running.url}`);

const stop = (): void => {
  void running.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
