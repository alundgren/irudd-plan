import { browserAssetUploads, makeBrowserPlan } from "./browser-fixture.js";
import { startTestServer } from "./test-service.js";
import {
  GitHubConnection,
  type GitHubReader,
} from "../src/github/github-app.js";

const browserGitHub: GitHubReader = {
  async repository(_installationId, owner, name) {
    return {
      id: "browser-repository",
      owner,
      name,
      visibility: "public",
      url: `https://github.com/${owner}/${name}`,
    };
  },
  async work(_installationId, repository, type, number) {
    return {
      nodeId: `${type}-${number}`,
      databaseId: String(number),
      type,
      number,
      url: `${repository.url}/${type === "issue" ? "issues" : "pull"}/${number}`,
      state: "open",
      observedAt: new Date().toISOString(),
    };
  },
};

const github = new GitHubConnection(
  [
    {
      ownerId: "owner-a",
      installationId: 1,
      repositories: [{ owner: "example", name: "project" }],
    },
  ],
  browserGitHub,
);

const running = await startTestServer(
  undefined,
  4173,
  async (service) => {
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
    await service.verifyRepository("owner-a", {
      contractVersion: "v1",
      planId: "browser-plan",
    });
    await service.publish("owner-a", {
      contractVersion: "v1",
      planId: "browser-plan",
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
  },
  github,
);

console.log(`browser test server listening at ${running.url}`);

const stop = (): void => {
  void running.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
