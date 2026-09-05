import { createHash } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import { PlanService } from "../src/domain/plan-service.js";
import { clonePlan, fixtureAssetUpload, tenItemPlan } from "./fixture.js";
import { createTestStore } from "./test-service.js";

describe("immutable visual assets", () => {
  it("stores exact bytes and source, validates plan references, and retains replaced versions", async () => {
    const store = await createTestStore();
    const service = new PlanService(store);
    const plan = tenItemPlan("visual-plan");
    const first = await service.uploadAsset("owner-a", {
      ...fixtureAssetUpload(plan.planId),
      source: {
        mediaType: "text/plain",
        bytesBase64: Buffer.from("editable diagram source").toString("base64"),
      },
    });
    const firstPlan = {
      ...plan,
      assets: [first],
    };
    await service.write("owner-a", {
      operationId: "visual-create",
      expectedVersion: null,
      plan: firstPlan,
    });

    const rendered = await service.getAsset("owner-a", {
      contractVersion: "v1",
      planId: plan.planId,
      assetId: first.id,
      digest: first.digest,
      content: "rendered",
    });
    expect(digest(Buffer.from(rendered.bytesBase64, "base64"))).toBe(
      first.digest,
    );
    const source = await service.getAsset("owner-a", {
      contractVersion: "v1",
      planId: plan.planId,
      assetId: first.id,
      digest: first.digest,
      content: "source",
    });
    expect(Buffer.from(source.bytesBase64, "base64").toString()).toBe(
      "editable diagram source",
    );
    await expect(
      service.getAsset("owner-b", {
        contractVersion: "v1",
        planId: plan.planId,
        assetId: first.id,
        digest: first.digest,
      }),
    ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });

    const replacement = await service.uploadAsset("owner-a", {
      ...fixtureAssetUpload(plan.planId),
      bytesBase64: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>',
      ).toString("base64"),
    });
    const replacementPlan = clonePlan(firstPlan);
    const revised = { ...replacementPlan, assets: [replacement] };
    await service.write("owner-a", {
      operationId: "visual-replace",
      expectedVersion: 1,
      plan: revised,
    });
    await expect(
      service.getAsset("owner-a", {
        contractVersion: "v1",
        planId: plan.planId,
        assetId: first.id,
        digest: first.digest,
      }),
    ).resolves.toMatchObject({ descriptor: { digest: first.digest } });
  });

  it("rejects unsupported dependencies and limits without partial plan writes", async () => {
    const store = await createTestStore();
    const service = new PlanService(store, undefined, {
      maxAssetBytes: 100,
      maxSourceBytes: 50,
      maxOwnerStorageBytes: 120,
    });
    await expect(
      service.uploadAsset("owner-a", {
        ...fixtureAssetUpload("rejected"),
        mediaType: "text/html",
        bytesBase64: Buffer.from(
          '<img src="https://tracker.example/private.png">',
        ).toString("base64"),
      }),
    ).rejects.toMatchObject({ code: "ASSET_INVALID" });
    const unsupportedMarkup = [
      "<img src=https://tracker.example/a.png>",
      '<img srcset="https://tracker.example/a.png 1x">',
      '<object data="//tracker.example/a.html"></object>',
      '<style>@import "https://tracker.example/a.css";</style>',
      '<image href="//tracker.example/a.svg"/>',
      "<script>import('/api/plans')</script>",
      "<script>import('https://tracker.example/module.js')</script>",
      "<script>fetch('/api/plans')",
    ];
    for (const [index, markup] of unsupportedMarkup.entries()) {
      await expect(
        service.uploadAsset("owner-a", {
          ...fixtureAssetUpload("rejected"),
          assetId: `external-${index}`,
          mediaType: "text/html",
          bytesBase64: Buffer.from(markup).toString("base64"),
        }),
      ).rejects.toMatchObject({ code: "ASSET_INVALID" });
    }
    await expect(
      service.uploadAsset("owner-a", {
        ...fixtureAssetUpload("rejected"),
        mediaType: "image/png",
        bytesBase64: Buffer.alloc(101).toString("base64"),
      }),
    ).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });

    const plan = tenItemPlan("rejected");
    await expect(
      service.write("owner-a", {
        operationId: "broken-reference",
        expectedVersion: null,
        plan,
      }),
    ).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
    await expect(
      service.current("owner-a", plan.planId),
    ).resolves.toBeUndefined();
  });
});

function digest(content: Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
