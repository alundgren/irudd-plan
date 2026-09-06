import { PlanError } from "../contract/errors.js";
import type {
  CheckPacketRequest,
  GetAssetRequest,
  GetItemRequest,
  GetRelatedContextRequest,
  UploadAssetRequest,
  WritePlanRequest,
  AssociateGitHubWorkRequest,
  GetGitHubReferenceRequest,
  PublishPlanRequest,
  VerifyRepositoryRequest,
} from "../contract/plan.js";
import type { PlanStore, StoredPlan } from "../database/store.js";
import type {
  GitHubConnection,
  VerifiedGitHubRepository,
} from "../github/github-app.js";
import { prepareAsset, type AssetLimits } from "./assets.js";
import { PlanUpdateHub } from "./plan-update-hub.js";
import {
  collectRequiredPacket,
  digest,
  validatePlan,
} from "./validate-plan.js";

export class PlanService {
  constructor(
    private readonly store: PlanStore,
    readonly updates = new PlanUpdateHub(),
    private readonly assetLimits: AssetLimits = {
      maxAssetBytes: 5_000_000,
      maxSourceBytes: 2_000_000,
      maxOwnerStorageBytes: 100_000_000,
    },
    private readonly github?: GitHubConnection,
    private readonly publicBaseUrl = "http://localhost:3000",
  ) {}

  async write(ownerId: string, request: WritePlanRequest) {
    await this.store.assertPlanAssets(ownerId, request.plan);
    const result = await this.store.write(ownerId, request);
    if (!result.replayed) {
      this.updates.publish({
        ownerId,
        planId: result.planId,
        version: result.version,
      });
    }
    return result;
  }

  list(ownerId: string) {
    return this.store.list(ownerId);
  }

  current(ownerId: string, planId: string) {
    return this.store.get(ownerId, planId);
  }

  publicCurrent(ownerId: string, planId: string) {
    return this.store.getPublic(ownerId, planId);
  }

  async publicAsset(
    ownerId: string,
    planId: string,
    assetId: string,
    assetDigest: string,
  ) {
    const current = await this.store.getPublic(ownerId, planId);
    const descriptor = current?.plan.assets.find(
      (asset) => asset.id === assetId && asset.digest === assetDigest,
    );
    if (descriptor === undefined) {
      throw new PlanError("ASSET_UNAVAILABLE", "Public asset is unavailable");
    }
    return this.getAsset(ownerId, {
      contractVersion: "v1",
      planId,
      assetId,
      digest: assetDigest,
      content: "rendered",
    });
  }

  async uploadAsset(ownerId: string, request: UploadAssetRequest) {
    const prepared = prepareAsset(request, this.assetLimits);
    return this.store.putAsset(ownerId, prepared, this.assetLimits);
  }

  async getAsset(ownerId: string, request: GetAssetRequest) {
    const stored = await this.store.getAsset(
      ownerId,
      request.planId,
      request.assetId,
      request.digest,
    );
    if (stored === undefined) {
      throw new PlanError("ASSET_UNAVAILABLE", "Asset is unavailable");
    }
    if (request.content === "source") {
      if (stored.source === undefined) {
        throw new PlanError(
          "ASSET_UNAVAILABLE",
          "Editable source is unavailable",
        );
      }
      return {
        descriptor: stored.descriptor,
        content: "source" as const,
        mediaType: stored.source.mediaType,
        bytesBase64: stored.source.content.toString("base64"),
      };
    }
    return {
      descriptor: stored.descriptor,
      content: "rendered" as const,
      mediaType: stored.descriptor.mediaType,
      bytesBase64: stored.content.toString("base64"),
    };
  }

  async getOverview(ownerId: string, planId: string) {
    const stored = await this.store.get(ownerId, planId);
    if (stored === undefined)
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    return {
      contractVersion: stored.plan.contractVersion,
      planId: stored.plan.planId,
      resourceUri: planResourceUri(stored.plan.planId),
      epicGoal: stored.plan.epicGoal,
      repository: stored.plan.repository,
      index: stored.plan.items.map((item) => ({
        id: item.id,
        title: item.title,
        shortGoal: item.shortGoal,
        relatedItemIds: item.relatedItemIds,
        resourceUri: itemResourceUri(stored.plan.planId, item.id),
      })),
      internalRevision: stored.version,
    };
  }

  async getItem(ownerId: string, request: GetItemRequest) {
    const stored = await this.store.get(ownerId, request.planId);
    if (stored === undefined) {
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    }
    return this.itemPacket(stored, request.itemId);
  }

  private itemPacket(stored: StoredPlan, itemId: string) {
    const required = collectRequiredPacket(stored.plan, itemId);
    const requiredContent = {
      item: required.item,
      contexts: required.contexts,
      decisions: required.decisions,
      assets: required.assets,
    };
    const includedContextIds = new Set(
      required.contexts.map((context) => context.id),
    );
    return {
      contractVersion: stored.plan.contractVersion,
      planId: stored.plan.planId,
      itemId: required.item.id,
      packetVersion: digest(requiredContent),
      resourceUri: itemResourceUri(stored.plan.planId, required.item.id),
      epic: {
        goal: stored.plan.epicGoal,
        repository: stored.plan.repository,
        index: stored.plan.items.map((item) => ({
          id: item.id,
          title: item.title,
          shortGoal: item.shortGoal,
          relatedItemIds: item.relatedItemIds,
        })),
      },
      ...requiredContent,
      relatedContextIds: stored.plan.contexts
        .filter((context) => !includedContextIds.has(context.id))
        .map((context) => context.id),
      internalRevision: stored.version,
    };
  }

  async getContext(ownerId: string, request: GetRelatedContextRequest) {
    const stored = await this.store.get(ownerId, request.planId);
    if (stored === undefined)
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    const index = validatePlan(stored.plan);
    const root = index.contexts.get(request.contextId);
    if (root === undefined) {
      throw new PlanError("CONTEXT_NOT_FOUND", "Shared context is unavailable");
    }
    const contextIds = new Set<string>();
    const assetIds = new Set<string>();
    const visit = (id: string): void => {
      if (contextIds.has(id)) return;
      const context = index.contexts.get(id);
      if (context === undefined)
        throw new PlanError("REFERENCE_MISSING", `Missing context: ${id}`);
      contextIds.add(id);
      for (const childId of context.requiredContextIds) visit(childId);
      for (const assetId of context.assetIds) assetIds.add(assetId);
    };
    visit(root.id);
    const contexts = [...contextIds].map((id) => index.contexts.get(id)!);
    const assets = [...assetIds].map((id) => index.assets.get(id)!);
    return {
      contractVersion: stored.plan.contractVersion,
      planId: stored.plan.planId,
      contextId: root.id,
      packetVersion: digest({ contexts, assets }),
      contexts,
      assets,
      internalRevision: stored.version,
    };
  }

  async checkPacket(ownerId: string, request: CheckPacketRequest) {
    const stored = await this.store.get(ownerId, request.planId);
    if (stored === undefined) return { status: "unavailable" as const };
    if (
      !stored.plan.items.some((candidate) => candidate.id === request.itemId)
    ) {
      return { status: "deleted" as const };
    }
    const current = this.itemPacket(stored, request.itemId);
    if (current.packetVersion === request.packetVersion) {
      return {
        status: "unchanged" as const,
        packetVersion: current.packetVersion,
      };
    }
    return {
      status: "changed" as const,
      packetVersion: current.packetVersion,
      resourceUri: current.resourceUri,
    };
  }

  async verifyRepository(ownerId: string, request: VerifyRepositoryRequest) {
    const repository = await this.verifyCurrentRepository(
      ownerId,
      request.planId,
      false,
    );
    return {
      planId: request.planId,
      repository,
      publicationAllowed: repository.visibility === "public",
    };
  }

  async associateGitHubWork(
    ownerId: string,
    request: AssociateGitHubWorkRequest,
  ) {
    const repository = await this.verifyCurrentRepository(
      ownerId,
      request.planId,
      true,
    );
    const github = this.requireGitHub();
    const observation = await github.observeWork(
      ownerId,
      repository,
      request.type,
      request.number,
    );
    await this.store.linkGitHubWork(ownerId, request.planId, {
      ...(request.itemId === undefined ? {} : { itemId: request.itemId }),
      repositoryId: repository.id,
      workNodeId: observation.nodeId,
      workDatabaseId: observation.databaseId,
      type: observation.type,
      number: observation.number,
      url: observation.url,
      state: observation.state,
      lastObservedAt: observation.observedAt,
    });
    return {
      planId: request.planId,
      ...(request.itemId === undefined ? {} : { itemId: request.itemId }),
      ...observation,
    };
  }

  async publish(ownerId: string, request: PublishPlanRequest) {
    const repository = await this.verifyCurrentRepository(
      ownerId,
      request.planId,
      true,
    );
    if (repository.visibility !== "public") {
      throw new PlanError(
        "PUBLICATION_NOT_ALLOWED",
        "Private-repository plans cannot be published",
      );
    }
    const publishedAt = await this.store.publish(ownerId, request.planId);
    await this.publishAccessUpdate(ownerId, request.planId);
    return {
      planId: request.planId,
      status: "public" as const,
      publishedAt,
      humanUrl: this.publicPlanUrl(ownerId, request.planId),
    };
  }

  async getGitHubReference(
    ownerId: string,
    request: GetGitHubReferenceRequest,
  ) {
    const stored = await this.store.get(ownerId, request.planId);
    if (stored === undefined)
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    const item =
      request.itemId === undefined
        ? undefined
        : stored.plan.items.find(
            (candidate) => candidate.id === request.itemId,
          );
    if (request.itemId !== undefined && item === undefined) {
      throw new PlanError("ITEM_NOT_FOUND", "Work item is unavailable");
    }
    const planUrl = stored.access.published
      ? this.publicPlanUrl(ownerId, request.planId)
      : `${this.publicBaseUrl}/plans/${encodeURIComponent(request.planId)}`;
    const humanUrl =
      item === undefined
        ? planUrl
        : `${planUrl}/items/${encodeURIComponent(item.id)}`;
    const resourceUri =
      item === undefined
        ? planResourceUri(request.planId)
        : itemResourceUri(request.planId, item.id);
    const shortGoal = item?.shortGoal ?? stored.plan.epicGoal;
    return {
      planId: request.planId,
      ...(item === undefined ? {} : { itemId: item.id }),
      shortGoal,
      humanUrl,
      resourceUri,
      githubText: `${shortGoal}\n\nPlan: ${humanUrl}\nMCP: ${resourceUri}`,
      publicationStatus: stored.access.published ? "public" : "private",
      agentInstruction:
        "Use the MCP reference for implementation context. Keep personal and session details out unless the plan explicitly requests them.",
    };
  }

  private async verifyCurrentRepository(
    ownerId: string,
    planId: string,
    mustAlreadyBeVerified: boolean,
  ): Promise<VerifiedGitHubRepository> {
    const current = await this.store.repository(ownerId, planId);
    if (current === undefined)
      throw new PlanError("PLAN_NOT_FOUND", "Plan is unavailable");
    if (mustAlreadyBeVerified && !current.verified) {
      throw new PlanError(
        "PUBLICATION_NOT_ALLOWED",
        "Verify the plan repository before linking or publishing",
      );
    }
    const repository = await this.requireGitHub().verifyRepository(
      ownerId,
      current.owner,
      current.name,
    );
    if (current.verified && current.id !== repository.id) {
      throw new PlanError(
        "PLAN_CONFLICT",
        "A verified plan cannot be rebound to another repository",
      );
    }
    await this.store.verifyRepository(ownerId, planId, repository);
    await this.publishAccessUpdate(ownerId, planId);
    return repository;
  }

  private requireGitHub(): GitHubConnection {
    if (this.github === undefined) {
      throw new PlanError(
        "GITHUB_NOT_CONFIGURED",
        "GitHub App access is not configured",
      );
    }
    return this.github;
  }

  private publicPlanUrl(ownerId: string, planId: string): string {
    return `${this.publicBaseUrl}/public/plans/${encodeURIComponent(ownerId)}/${encodeURIComponent(planId)}`;
  }

  private async publishAccessUpdate(ownerId: string, planId: string) {
    const current = await this.store.get(ownerId, planId);
    if (current !== undefined) {
      this.updates.publish({ ownerId, planId, version: current.version });
    }
  }
}

export function itemResourceUri(planId: string, itemId: string): string {
  return `irudd-plan://plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`;
}

export function planResourceUri(planId: string): string {
  return `irudd-plan://plans/${encodeURIComponent(planId)}`;
}
