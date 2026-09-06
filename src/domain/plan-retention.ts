import { PlanError } from "../contract/errors.js";
import {
  RetentionStore,
  type RetentionSnapshot,
} from "../database/retention-store.js";
import type { GitHubConnection } from "../github/github-app.js";
import type { PlanUpdateHub } from "./plan-update-hub.js";
import {
  DAY_MS,
  RETENTION_MS,
  retentionStatus,
  type RetentionStatus,
} from "./retention-status.js";

export class PlanRetention {
  constructor(
    private readonly store: RetentionStore,
    private readonly github?: GitHubConnection,
    private readonly now: () => Date = () => new Date(),
    private readonly updates?: PlanUpdateHub,
  ) {}

  async runBatch(limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Retention batch must contain 1 to 100 plans");
    const due = await this.store.due(this.now().toISOString(), limit);
    const results = [];
    for (const candidate of due) {
      const snapshot = await this.store.snapshot(
        candidate.ownerId,
        candidate.planId,
      );
      if (snapshot === undefined) continue;
      let status = await this.check(snapshot);
      let remove = expired(status, this.now());
      if (remove && snapshot.plan.everAttached) {
        // A due plan always receives a separate final verification before deletion.
        status = await this.check(snapshot);
        remove = expired(status, this.now());
      }
      const result = await this.store.commit(snapshot, status, remove);
      if (result !== "changed")
        this.updates?.publish({
          ...candidate,
          version: snapshot.plan.currentVersion,
        });
      results.push({ ...candidate, result });
    }
    return results;
  }

  private async check(snapshot: RetentionSnapshot): Promise<RetentionStatus> {
    const now = this.now();
    const base = {
      ...retentionStatus(snapshot.plan),
      checkedAt: now.toISOString(),
      nextCheckAt: new Date(now.getTime() + DAY_MS).toISOString(),
    };
    if (!snapshot.plan.everAttached && snapshot.links.length === 0) return base;
    try {
      const activity = await this.linkedActivity(snapshot, now);
      if (activity === "open")
        return {
          ...base,
          status: "retained",
          reason: "Linked GitHub work is open.",
          expiresAt: null,
          inactiveSince: null,
        };
      return {
        ...base,
        status: "scheduled",
        reason: "All linked GitHub work is inactive.",
        inactiveSince: activity,
        expiresAt: new Date(Date.parse(activity) + RETENTION_MS).toISOString(),
      };
    } catch (error) {
      return {
        ...base,
        status: "unknown",
        reason: unknownReason(error),
        expiresAt: null,
        inactiveSince: null,
      };
    }
  }

  private async linkedActivity(
    snapshot: RetentionSnapshot,
    now: Date,
  ): Promise<string> {
    if (this.github === undefined)
      throw new PlanError(
        "GITHUB_NOT_CONFIGURED",
        "GitHub App access is not configured.",
      );
    if (!snapshot.plan.repositoryVerified || snapshot.links.length === 0)
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "Verified GitHub associations are missing.",
      );
    const repository = await this.github.verifyRepository(
      snapshot.plan.ownerId,
      snapshot.plan.repositoryOwner,
      snapshot.plan.repositoryName,
    );
    if (repository.id !== snapshot.plan.repositoryId)
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "The GitHub repository identity changed.",
      );
    let latest = 0;
    let open = false;
    for (const link of snapshot.links) {
      const observation = await this.github.observeWork(
        snapshot.plan.ownerId,
        repository,
        link.type,
        link.number,
      );
      if (
        link.repositoryId !== repository.id ||
        observation.nodeId !== link.workNodeId ||
        observation.databaseId !== link.workDatabaseId ||
        observation.type !== link.type ||
        observation.number !== link.number
      )
        throw new PlanError(
          "GITHUB_UNAVAILABLE",
          "A linked GitHub item could not be verified by its saved identity.",
        );
      if (observation.state === "open") {
        open = true;
        continue;
      }
      if (
        observation.state !== "closed" &&
        !(link.type === "pull_request" && observation.state === "merged")
      )
        throw new PlanError(
          "GITHUB_UNAVAILABLE",
          "GitHub returned an unrecognized work status.",
        );
      const closed = Date.parse(observation.closedAt ?? "");
      if (!Number.isFinite(closed) || closed > now.getTime())
        throw new PlanError(
          "GITHUB_UNAVAILABLE",
          "A reliable GitHub closure time is unavailable.",
        );
      latest = Math.max(latest, closed);
    }
    return open ? "open" : new Date(latest).toISOString();
  }
}

function expired(status: RetentionStatus, now: Date): boolean {
  return (
    status.status === "scheduled" &&
    status.expiresAt !== null &&
    Date.parse(status.expiresAt) <= now.getTime()
  );
}

function unknownReason(error: unknown): string {
  if (error instanceof PlanError)
    return `${error.message} Content is retained until GitHub can be checked.`;
  return "GitHub status could not be verified. Content is retained until the next successful check.";
}

export function startRetentionWorker(
  retention: PlanRetention,
  report: (error: unknown) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      await retention.runBatch();
    } catch (error) {
      report(error);
    }
    if (!stopped) timer = setTimeout(() => void tick(), 60_000).unref();
  };
  void tick();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
