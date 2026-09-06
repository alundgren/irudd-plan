import { importPKCS8, SignJWT } from "jose";

import { PlanError } from "../contract/errors.js";

export interface GitHubInstallationMapping {
  readonly ownerId: string;
  readonly installationId: number;
  readonly repositories: ReadonlyArray<{
    readonly owner: string;
    readonly name: string;
  }>;
}

export interface VerifiedGitHubRepository {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly visibility: "public" | "private";
  readonly url: string;
}

export interface GitHubWorkObservation {
  readonly nodeId: string;
  readonly databaseId: string;
  readonly type: "issue" | "pull_request";
  readonly number: number;
  readonly url: string;
  readonly state: string;
  readonly observedAt: string;
  readonly closedAt?: string;
}

export interface GitHubReader {
  repository(
    installationId: number,
    owner: string,
    name: string,
  ): Promise<VerifiedGitHubRepository>;
  work(
    installationId: number,
    repository: VerifiedGitHubRepository,
    type: "issue" | "pull_request",
    number: number,
  ): Promise<GitHubWorkObservation>;
}

export class GitHubConnection {
  constructor(
    private readonly mappings: ReadonlyArray<GitHubInstallationMapping>,
    private readonly reader: GitHubReader,
  ) {}

  async verifyRepository(
    ownerId: string,
    requestedOwner: string,
    requestedName: string,
  ): Promise<VerifiedGitHubRepository> {
    const mapping = this.mappings.find(
      (candidate) =>
        candidate.ownerId === ownerId &&
        candidate.repositories.some(
          (repository) =>
            same(repository.owner, requestedOwner) &&
            same(repository.name, requestedName),
        ),
    );
    if (mapping === undefined) {
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "The repository is not permitted for this owner",
      );
    }
    const repository = await this.reader.repository(
      mapping.installationId,
      requestedOwner,
      requestedName,
    );
    if (
      !same(repository.owner, requestedOwner) ||
      !same(repository.name, requestedName)
    ) {
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "GitHub returned a different repository",
      );
    }
    return repository;
  }

  async observeWork(
    ownerId: string,
    repository: VerifiedGitHubRepository,
    type: "issue" | "pull_request",
    number: number,
  ): Promise<GitHubWorkObservation> {
    const mapping = this.mappings.find(
      (candidate) =>
        candidate.ownerId === ownerId &&
        candidate.repositories.some(
          (allowed) =>
            same(allowed.owner, repository.owner) &&
            same(allowed.name, repository.name),
        ),
    );
    if (mapping === undefined) {
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "The repository is not permitted for this owner",
      );
    }
    return this.reader.work(mapping.installationId, repository, type, number);
  }
}

export class GitHubAppReader implements GitHubReader {
  private tokenCache = new Map<number, { token: string; expiresAt: number }>();

  constructor(
    private readonly appId: string,
    private readonly privateKey: string,
    private readonly apiUrl = "https://api.github.com",
  ) {}

  async repository(installationId: number, owner: string, name: string) {
    const value = await this.request<Record<string, unknown>>(
      installationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      "GITHUB_ACCESS_DENIED",
    );
    const repositoryOwner = object(value.owner).login;
    const repositoryId = integer(value.id);
    const isPrivate = boolean(value.private);
    return {
      id: String(repositoryId),
      owner: string(repositoryOwner),
      name: string(value.name),
      visibility: isPrivate ? ("private" as const) : ("public" as const),
      url: string(value.html_url),
    };
  }

  async work(
    installationId: number,
    repository: VerifiedGitHubRepository,
    type: "issue" | "pull_request",
    number: number,
  ) {
    const segment = type === "issue" ? "issues" : "pulls";
    const value = await this.request<Record<string, unknown>>(
      installationId,
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/${segment}/${number}`,
      "GITHUB_WORK_NOT_FOUND",
    );
    if (type === "issue" && value.pull_request !== undefined) {
      throw new PlanError(
        "GITHUB_WORK_NOT_FOUND",
        "GitHub issue is unavailable",
      );
    }
    return {
      nodeId: string(value.node_id),
      databaseId: String(integer(value.id)),
      type,
      number: integer(value.number),
      url: string(value.html_url),
      state: string(value.state),
      observedAt: new Date().toISOString(),
      ...(typeof value.closed_at === "string"
        ? { closedAt: value.closed_at }
        : {}),
    };
  }

  private async request<T>(
    installationId: number,
    path: string,
    notFoundCode: "GITHUB_ACCESS_DENIED" | "GITHUB_WORK_NOT_FOUND",
  ): Promise<T> {
    const token = await this.installationToken(installationId);
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "irudd-plan",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (response.status === 404) {
      throw new PlanError(notFoundCode, "GitHub content is unavailable");
    }
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")))
    ) {
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "GitHub rate limit prevents verification",
      );
    }
    if (response.status === 401 || response.status === 403) {
      this.tokenCache.delete(installationId);
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "GitHub installation access was denied",
      );
    }
    if (!response.ok) {
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "GitHub verification is unavailable",
      );
    }
    return this.json<T>(response);
  }

  private async installationToken(installationId: number): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    if (cached !== undefined && cached.expiresAt > Date.now() + 60_000)
      return cached.token;
    const key = await importPKCS8(this.privateKey, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(this.appId)
      .setIssuedAt(now - 30)
      .setExpirationTime(now + 540)
      .sign(key);
    const response = await this.fetch(
      `${this.apiUrl}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
          "user-agent": "irudd-plan",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({
          permissions: { issues: "read", pull_requests: "read" },
        }),
      },
    );
    if (response.status >= 500) {
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "GitHub token service is unavailable",
      );
    }
    if (!response.ok) {
      throw new PlanError(
        "GITHUB_ACCESS_DENIED",
        "GitHub installation access was denied",
      );
    }
    const body = await this.json<{
      token?: unknown;
      expires_at?: unknown;
    }>(response);
    const token = string(body.token);
    const expiresAt = Date.parse(string(body.expires_at));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw malformed();
    }
    this.tokenCache.set(installationId, { token, expiresAt });
    return token;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      if (error instanceof PlanError) throw error;
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "GitHub verification is unavailable",
      );
    }
  }

  private async json<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new PlanError(
        "GITHUB_UNAVAILABLE",
        "GitHub returned an invalid response",
      );
    }
  }
}

function same(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object") throw malformed();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw malformed();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw malformed();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw malformed();
  return value;
}

function malformed(): PlanError {
  return new PlanError(
    "GITHUB_UNAVAILABLE",
    "GitHub returned an invalid response",
  );
}
