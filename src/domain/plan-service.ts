import { PlanError } from "../contract/errors.js";
import type {
  CheckPacketRequest,
  GetAssetRequest,
  GetItemRequest,
  GetRelatedContextRequest,
  UploadAssetRequest,
  WritePlanRequest,
} from "../contract/plan.js";
import type { PlanStore, StoredPlan } from "../database/store.js";
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
}

export function itemResourceUri(planId: string, itemId: string): string {
  return `irudd-plan://plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`;
}

export function planResourceUri(planId: string): string {
  return `irudd-plan://plans/${encodeURIComponent(planId)}`;
}
